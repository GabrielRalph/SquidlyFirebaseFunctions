const { debug } = require("firebase-functions/logger");
const { parallelChucks } = require("../Shared/shared.js");
const { endSession } = require("./sessions-end.js");
const { sessionsRef } = require("./shared.js");
const { onSchedule } = require("firebase-functions/scheduler");
const { Usage } = require("../usage.js");
const {onObjectFinalized} = require("firebase-functions/v2/storage");


const SESSION_TIMEOUT_THRESHOLD_MINUTES = 10;
const MAX_CONCURENT = 100;
/**
 * This method is called every 10 minutes to check for
 * sessions that have been dormant for more than the
 * SESSION_TIMEOUT_THRESHOLD_MINUTES.
 * If such sessions are found, they are ended.  
 */
async function watchSessions() {
    let max_ms =  SESSION_TIMEOUT_THRESHOLD_MINUTES * 60 * 1000;


    // Get all active sessions
    let activeSessions = await sessionsRef().orderByChild("active").equalTo(true).get();
    activeSessions = activeSessions.val();

    let now = (new Date()).getTime();

    // Check for sessions updated more than the threshold time ago.
    if (activeSessions != null) {
        let activeSessionCount = 0;
        let dormantSessions = [];
        let nonDormantSessions = [];
        for (let sid in activeSessions) {
            let {updates, participants} = activeSessions[sid];

            // The host is active
            let hostActive = now - updates.host < max_ms;

            // At least one participant is active or there are no participants
            let participantsActive = true;
            if (participants) {
                participantsActive = Object.keys(participants).
                                            map(k => updates[k] - now < max_ms).
                                            reduce((a, b) => a||b);
            }

            // If the host is not active and no participants are active,
            // then the session is considered dormant.
            if (!(hostActive && participantsActive)) {
                dormantSessions.push(sid);
            } else {
                nonDormantSessions.push(sid);
            }

            activeSessionCount++;
        }

        debug(`SESSIONS: WATCH: ${activeSessionCount} active sessions of which ${dormantSessions.length} where dormant`);
        const usageChecker = new Usage();
        await usageChecker.initialise();
        let checkUsage = async (sid) => {   
            let {hostUID, startTime} = activeSessions[sid];
            let usage = await usageChecker.getUserUsage(hostUID);
            let rnow = (new Date()).getTime();
            let duration = (rnow - startTime) / (1000 * 60); // in minutes
            
            // If the usage has been exceeded end the session.
            if (duration > usage.remaining.minutes) {
                // end session
                debug(`SESSIONS: WATCH: Ending session ${sid} for user ${hostUID} as usage will be exceeded.`);
                await endSession(sid);
            // If the usage will be exceeded in the next threshold time, set an alert.
            } else if ((duration + SESSION_TIMEOUT_THRESHOLD_MINUTES) > usage.remaining.minutes) {
                // set alert
                debug(`SESSIONS WATCH: Session ${sid} for user ${hostUID} will exceed usage in the next ${SESSION_TIMEOUT_THRESHOLD_MINUTES} minutes.`);
                await sessionsRef(sid, "alerts").set(`time: ${Math.round(usage.available.minutes - duration)} minutes left`);
            
            } 
        }

    

        let endSessionCallers = [
            // End dormant sessions
            ...dormantSessions.map(sid => {
                return async () => await endSession(sid);
            }),

            // Check non dormant sessions for which the users usage will be exceeded in the next threshold time.
            ...nonDormantSessions.map(sid => {
                return async () => await checkUsage(sid);
            })
        ];

        await parallelChucks(endSessionCallers, MAX_CONCURENT)
    }
}

module.exports = {
    watch: onSchedule("*/10 * * * *", async (event) => {
       await watchSessions();
    }),
    watchData: onObjectFinalized({
        region: "australia-southeast1",
    }, async ({data}) => {
        let {name, size} = data;
        if (name.startsWith("session-data")) {
            let sid = name.split("/")[1];
            let hostUID = (await sessionsRef(sid, "hostUID").get()).val();
            debug(`SESSIONS: WATCH: Updating usage for host ${hostUID} for session ${sid} = ${Math.round(size/1e6)}MB.`);
            await Usage.updateUserUsage(hostUID, {storage: 2*size/1e6});
        }
    })
}
  