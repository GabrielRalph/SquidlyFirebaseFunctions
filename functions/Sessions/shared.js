const { isNonNullObject, refPath } = require("../Shared/shared.js");

/**
 * @param {string[]} path 
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function sessionsRef(...path) {
    return refPath("sessions-v3", path);
}

/**
 * @param {string[]} path 
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function sessionDataRef(...path) {
   return refPath("session-data", path)
}

/**
 * @param {string} sid 
 * @param {string[]} path
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function userSessionsRef(uid, ...path) {
    return refPath(`users/${uid}/session-history`, path);
}

const ERROR_CODES = {
    REQUEST_DATA: 0,
    REQUEST_AUTH: 1,
    PERMISSIONS: 2,
    NO_SESSION: 3,
    NOT_HOST: 4,
    NO_REQUEST: 5,
    IN_SESSION: 6,
    USAGE: 7
}

/**
 * These validators check 
 * - User is authenticated
 * - Data is provided with a session ID
 * - Session exists with the provided ID And the user is the host of the session.
 * 
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const START_END_VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return [ERROR_CODES.REQUEST_AUTH, "User not authenticated"];
        }
    },
    
    async ({data}) => {
        if (!isNonNullObject(data)) {
            return [ERROR_CODES.REQUEST_DATA, "No session data provided."];
        }
    },

    async ({data}) => {
        if (typeof data.sid !== "string") {
            return [ERROR_CODES.REQUEST_DATA, "No SID provided."];
        }
    },

    async ({data}) => {
        let session = await sessionsRef(data.sid).get();
        session = session.val();
        data.session = session;
        if (session === null) {
            return [ERROR_CODES.NO_SESSION, "No sessioun found with the provided SID."]
        }
    },

    async ({data, auth}) => {
        let host = data.session.anonymous ? 
            data.session.anonymousHostUID : data.session.hostUID;
            
        if (host !== auth.uid) {
            return [ERROR_CODES.NOT_HOST, "User is not the host of the session."]
        }
    },
]



module.exports = {ERROR_CODES, sessionsRef, sessionDataRef, userSessionsRef, START_END_VALIDATORS}