const { validateData, usersRef, tempUsersRef } = require("../Shared/shared.js");
const { Usage } = require("../usage.js");
const { endSession } = require("./sessions-end.js");
const { sessionsRef, START_END_VALIDATORS, ERROR_CODES } = require("./shared.js");
const {onCall} = require("firebase-functions/v2/https");


const START_VALIDATORS = [
    ...START_END_VALIDATORS,

    // Check the user is not already in a session.
    async ({auth: {uid}}) => {
        let active = await usersRef(uid, "active-session").get();
        if (active.exists()) {
            await endSession(active.val()); // End the existing session if the user is already in one
        }
    },

    // Check the user has not exceeded their session usage limit.
    async ({data, auth}) => {
        let {hostUID} = data.session;
        let usage = await Usage.getUserUsage(hostUID);

        if (usage.exceeded || (usage.used.sessions == usage.available.sessions)) {
            return [ERROR_CODES.USAGE, `User has exceeded their session usage limit (${usage.message}).`];
        } else {
            data.usage = usage; // Include usage data in the session start
        }
    }
];
const createClient = require('twilio');
async function createIceServers(maxTimeMinutes = 60) {
    let iceServers = null;
    try {
        const client = createClient(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        let maxTimeSeconds = Math.round(Math.min(24 * 60, maxTimeMinutes) * 60);
        let token = await client.tokens.create({ttl: maxTimeSeconds});
        iceServers = token.iceServers;
    } catch (e) {
        console.error("Failed to create ICE servers:", e);
        iceServers = null; // Fallback to null if there's an error
    }
    return iceServers;
}

async function startSession(data, auth) {
    let errors = [];
    let valid = await validateData({data, auth}, START_VALIDATORS, errors);
    let iceServers = null;
    if (valid) {
        iceServers = await createIceServers(data.usage.available.minutes);
        let now = (new Date()).getTime();

        const {anonymous, hostUID, anonymousHostUID} = data.session;
        await Promise.all([
            sessionsRef(data.sid).update({
                active:true,
                iceServers,
                startTime: now,
                updates: {
                    host: now,
                }
            }),
            usersRef(auth.uid, "active-session").set(data.sid), 
            
            // If the session is anonymous, also add the anon host
            // so they can be identified as the host for the 
            // duration of the session.
            anonymous ? tempUsersRef(anonymousHostUID, hostUID).set(true) : null
        ])
    }

    return {errors, iceServers}
}


module.exports = {
    start: onCall({
        region: "australia-southeast1",
        // minInstances: 1, This will reduce wait time to host but increase costs to 10$ per month
    },async ({auth, data}) => {
        return await startSession(data, auth);
    }),
}