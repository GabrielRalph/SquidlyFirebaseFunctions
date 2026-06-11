const { debug } = require("firebase-functions/logger");
const { sb } = require("../firebase.js");
const { validateData, tempUsersRef, usersRef } = require("../Shared/shared.js");
const { Usage } = require("../usage.js");
const { sessionsRef, sessionDataRef, userSessionsRef, START_END_VALIDATORS } = require("./shared.js")
const { onCall } = require("firebase-functions/v2/https");
const { parseSessionLogs } = require("./session-logs.js");
const { proxyRef } = require("./session-get-from-proxy.js");


async function removeSessionContent(sid){
  try {
    const [files] = await sb.getFiles({
      prefix: `session-data/${sid}`,
    });

    let filennames = files.map(file => file.name);
    debug(`SESSIONS: Removing session content for session ${sid}:`, filennames);

    if (files.length === 0) {
      return;
    }

    // Delete each file
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);

  } catch (error) {
    debug('SESSIONS: Error deleting files:', error);
  }
}

async function removeSessionParticipants(session){
    let {participants, hostUID, anonymousHostUID} = session;
    if (participants) {
        await Promise.all([
            // remove participant temp user entries
            ...Object.keys(participants).map(uid => 
                tempUsersRef(uid, hostUID).set(null)
            ),
            // remove host temp user entry
            tempUsersRef(anonymousHostUID, hostUID).set(null)
        ])
    }
}



async function endSession(sid) {
    let duration = 0;
    let session = (await sessionsRef(sid).get()).val();
    if (session != null && session.active === true) {
        let {hostUID, anonymouse, anonymousHostUID, startTime} = session;
        debug(`SESSIONS: Ending session ${sid} for host ${hostUID}`);

        let subHostUID = anonymouse ? anonymousHostUID : hostUID;
        let ownerHostUID = hostUID;

        // Compute the duration of the session.
        let now = (new Date()).getTime();
        if (typeof startTime === "number") {
            duration =  (now - startTime) / (1000 * 60) ; // minutes
        }

    
        // Delete session, session data and session content.
        const logsRef = sessionDataRef(sid, "logs");
        const [logs, _] = await Promise.all([
            await logsRef.get(),
            await sessionsRef(sid).set(null),
        ]);

        let sessionLogs = null;
        let profileID = "default";
        try {
            sessionLogs = parseSessionLogs( Object.values(logs.val() || {}) );
            if (sessionLogs !== null) {
                profileID = sessionLogs.metadata.profile;
            }
        } catch (e) {
            console.log("Error parsing session logs for session", sid, ":", e);
        }

        await Promise.all([
            session.proxyID ? proxyRef(session.proxyID).child("linkedSID").set(null) : null, // Unlink session from proxy if applicable
            sessionDataRef(sid).set(null),                           // Remove session data
            removeSessionContent(sid),                               // Remove session content
            removeSessionParticipants(session),                      // Remove session participants
            usersRef(subHostUID, "active-session").set(null),   // Remove active session reference from the host
            userSessionsRef(subHostUID, sid).set({                      // Update stored session data for the host 
                duration: duration,
                startTime: startTime,
                info: session.info || null, // Include any additional session info
            }),
            usersRef(subHostUID, "profile-logs", profileID, sid).set(sessionLogs),
            Usage.updateUserUsage(ownerHostUID, {sessions: 1, minutes: duration}) // Update the host's usage
        ]);
    } else if (session != null && session.active === false) {
        debug(`SESSIONS: Deleting Session ${sid}.`);
        await Promise.all([
            sessionsRef(sid).set(null), // Remove the session
            usersRef(session.hostUID, "session-history", sid).set(null) // Remove active session reference from the host
        ]);
    }
}


module.exports = {
    endSession,
    end: onCall({
        region: "australia-southeast1",
        // minInstances: 1, This will reduce wait time to host but increase costs to 10$ per month
    },async (context) => {
        let errors = [];

        let valid = await validateData(context, START_END_VALIDATORS, errors);
        if (valid) {
            await endSession(context.data.sid);
        }

        return {errors}
    }),
}