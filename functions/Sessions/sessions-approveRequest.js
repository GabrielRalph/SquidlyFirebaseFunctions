const { validateData, isNonNullObject, tempUsersRef } = require("../Shared/shared.js");
const { sessionsRef, ERROR_CODES } = require("./shared.js");
const {onCall} = require("firebase-functions/v2/https");


/**
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return [ERROR_CODES.REQUEST_AUTH, "User not authenticated"];
        }
    },
    async ({data}) => {
        if (!isNonNullObject(data)) {
            return [ERROR_CODES.REQUEST_DATA, "No join request data provided."];
        }
    },
    async ({data}) => {
        if (typeof data.sid !== "string") {
            return [ERROR_CODES.REQUEST_DATA, "No session ID provided."];
        }
    },
    async ({data}) => {
        if (typeof data.uid !== "string") {
            return [ERROR_CODES.REQUEST_DATA, "No user uid provided to approve."];
        }
    },
    async ({data, auth}) => {
        let session = await sessionsRef(data.sid).get();
        if (!session.exists()) {
            return [ERROR_CODES.NO_SESSION, "Session does not exist"]
        } else {
            let {active, hostUID, anonymous, anonymousHostUID, requests, participants} = session.val()
            let subHostUID = anonymous ? anonymousHostUID : hostUID;
            if (!active) {
                return [ERROR_CODES.NO_SESSION, "Session is not active"];
            } else if (auth.uid !== subHostUID) {
                return [ERROR_CODES.NOT_HOST, "User is not the host"];
            } else if (participants && data.uid in participants) {
                return [ERROR_CODES.NO_REQUEST, "The participant has alread been approved"];
            } else if (!requests || !(data.uid in requests)) {
                return [ERROR_CODES.NO_REQUEST, "The participant has not made a request"];
            }
            data.session = session.val();
        }
    },
]


async function approveRequest(auth, data) {
    const errors = [];
    const valid = await validateData({data, auth}, VALIDATORS, errors);
    if (valid) {
        const {uid, sid, session} = data;
        const now = (new Date()).getTime();
        await Promise.all([
            sessionsRef(sid + '/requests/' + uid).remove(),
            sessionsRef(sid + '/participants/' + uid).set(session.requests[uid]),
            sessionsRef(sid + '/updates/' + uid).set(now),
            tempUsersRef(uid, session.hostUID).set(true)
        ]);
    } 
    
    return {valid, errors};
}

module.exports = {
    approveRequest: onCall({
        region: "australia-southeast1",
        // minInstances: 1, This will reduce wait time to host but increase costs to 10$ per month
    },async ({auth, data}) => {
        return await approveRequest(auth, data);
    }),
}