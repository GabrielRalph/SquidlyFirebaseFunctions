const { getUsersMaxTier } = require("../Licences/shared.js");
const { validateData, isNonNullObject } = require("../Shared/shared.js");
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
            return [ERROR_CODES.REQUEST_DATA, "No session data provided."];
        }
    },
    async ({data}) => {
        if (typeof data.startTime !== "number") {
            return [ERROR_CODES.REQUEST_DATA, "No startTime provided."];
        }
    },
    async ({auth}) => {
        let maxTier = await getUsersMaxTier(auth.uid);
        if (maxTier === 0) {
            return [ERROR_CODES.PERMISSIONS, "User does not have a licence"];
        }
    },
    
]

/**
 * Create a new session for the user. Returns the session ID.
 * @param {string} uid - The user ID of the session host
 * @param {Object} data - The session data
 * @param {number} data.startTime - The start time of the session (timestamp)
 * @param {Object} [info] - Additional session info to store
 * @returns {Promise<string>} The session ID of the newly created session
 */
async function createSession(uid, data, info = {}) {
    let proxyID = info.proxyID || null;
    delete info.proxyID
    let sessionData = {
        hostUID: uid,
        anonymous: data.anonymous ?? false,
        active: false,
        proxyID,
        info: {
            startTime: data.startTime,
            ...info,
        }
    }

    let ref = sessionsRef().push();
    await ref.set(sessionData);

    return ref.key;
}

module.exports = {
    createSession,
    create: onCall({
        region: "australia-southeast1",
        // minInstances: 1, This will reduce wait time to host but increase costs by 10$ per month
    },async ({auth, data}) => {
        let errors = [];
        let sid = null;

        if (await validateData({data, auth}, VALIDATORS, errors)) {
            sid = await createSession(auth.uid, data);
        }
        return {sid, errors}
    }),
}