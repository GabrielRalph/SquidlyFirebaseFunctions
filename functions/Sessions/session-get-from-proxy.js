const { onCall } = require("firebase-functions/https");
const { db } = require("../firebase");
const { getUsersMaxTier } = require("../Licences/shared");
const { createSession } = require("./sessions-create");
const { sessionsRef } = require("./shared");
const { validateData, isNonNullObject } = require("../Shared/shared");
const { debug } = require("firebase-functions/logger");
const { onValueCreated, onValueDeleted } = require("firebase-functions/database");

const PROXY_REF = "proxy-links"

function proxyRef(proxyID) {
    return typeof proxyID == "string" ? db.ref(PROXY_REF).child(proxyID) : db.ref(PROXY_REF);
}

/**
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return "User not authenticated";
        }
    },
    async ({data}) => {
        if (!isNonNullObject(data)) {
            return "No proxy data provided.";
        }
    },
    async ({data}) => {
        if (typeof data.proxyID !== "string") {
            return "No proxy ID provided.";
        }
    },
]

async function getSIDFromProxy(proxyID) {
    // Get proxy info using the proxyID
    const pidRef = proxyRef(proxyID)
    const sc = await pidRef.get()

    let sid = null;
    if (sc.exists()) {
        const {hostUID, linkedSID, info} = sc.val();

      
        const exists = typeof linkedSID === "string" && 
                      (await sessionsRef(linkedSID).child("hostUID").get()).exists();

        // There is currently no existing session linked to the proxy 
        if (!exists) {

            //Check user's max tier to ensure they can create a session
            const maxTier = await getUsersMaxTier(hostUID);
            if (maxTier === 0) {
                throw new Error("Host of proxy does not have a licence");
            }

            // Create a new session 
            const profileName = info?.profileID ? (await db.ref(`users/${hostUID}/settings/profiles/${info.profileID}/profileSettings/name`).get()).val() : "Untitled profile";
            const newSID = await createSession(hostUID, {
                startTime: Date.now(),
            }, {
                proxyID,
                ...info,
                startDate: new Date().toISOString(),
                description: `Meeting with ${profileName}`,
            });

            // Link it to the proxy
            const result = await pidRef.child("linkedSID").transaction((current) => 
                current == null || current == newSID || current == linkedSID ? newSID : undefined
            );

            if (!result.committed) {
                // Another session was linked during the transaction, use that one instead
                sid = result.snapshot.val();
                
                // Clean up the session we just created since it won't be used
                sessionsRef(sid).set(null); 

            } else {
                sid = newSID;
            }

        } else {
            sid = linkedSID;
        }
    } 

    return sid;
}

async function createProxyLinkForProfile(uid, profileID) {
    const nref = proxyRef().push();
    await Promise.all([
        nref.set({
            hostUID: uid,
            linkedSID: null,
            info: {profileID: profileID},
        }),
        db.ref(`users/${uid}/settings/profiles/${profileID}/proxyID`).set(nref.key)
    ]);
}

module.exports = {
    proxyRef,

    createProxyLinkForProfile,

    getSIDFromProxy: onCall({
        region: "australia-southeast1",
        // minInstances: 1, This will reduce wait time to host but increase costs by 10$ per month
    },async ({auth, data}) => {
        let errors = [];
        let sid = null;

        if (await validateData({data, auth}, VALIDATORS, errors)) {
            try {
                sid = await getSIDFromProxy(data.proxyID);
            } catch (e) {
                errors.push(e.message);
            }
        }
        return {sid, errors}
    }),

    watchForProfileCreation: onValueCreated({
        ref: "users/{uid}/settings/profiles/{profileID}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1"
    }, async ({params: {uid, profileID}, data}) => {
        if (data.exists() && profileID !== "default") {
            await createProxyLinkForProfile(uid, profileID);
        }
    }),

    watchForProfileDeletion: onValueDeleted({
        ref: "users/{uid}/settings/profiles/{profileID}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1"
    }, async ({data, params: {uid, profileID}}) => {
        if (data.exists() && profileID !== "default") {
            const proxyID = data.val().proxyID;
            if (proxyID) {
                await proxyRef(proxyID).set(null);
            }
        }
    })
}