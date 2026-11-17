const { db } = require("../functions/firebase");
const { createProxyLinkForProfile, proxyRef } = require("../functions/Sessions/session-get-from-proxy");


async function createProxyLinksForUser(uid, user = null) {
    user = user || (await db.ref(`users/${uid}`).get()).val();
    const proids = Object.keys(user?.settings?.profiles || {});
    const proxids = proids.map(profileID => user?.settings?.profiles?.[profileID]?.proxyID);
    if (proxids.length > 0) {
        // console.log(uid,proids,proxids);
        for (let i = 0; i < proxids.length; i++) {
            const proxyID = proxids[i];
            const profileID = proids[i];
            if (proxyID && profileID) {
                console.log(`UID: ${uid}, ProfileID: ${profileID}, ProxyID: ${proxyID}`);
                await proxyRef(proxyID).set({ hostUID: uid, info: {profileID} });
            } else if (!proxyID && profileID) {
                await createProxyLinkForProfile(uid, profileID);
            }
            // await proxyRef(proxyID);
        }
        // await Promise.all(proxids.map(proxyID => proxyRef(proxyID)));
    }
    // await Promise.all(pids.map(profileID => proxyRef(pids, )));
    // const profiles = Object.entries(user?.settings?.profiles || {}).filter(profileID => profileID === "default");
    // await Promise.all(profiles.map(profileID => createProxyLinkForProfile(uid, profileID)));
    // await createProxyLinkForProfile(uid, "default");
}


async function createProxyLinks() {
    const users = (await db.ref("users").get()).val() || {};
    await Promise.all(Object.entries(users).map(([uid, user]) => createProxyLinksForUser(uid, user)));
}


async function test() {
    await createProxyLinks();
}


test().then(() => {
    console.log("Proxy links created");
    process.exit(0);
}).catch((error) => {
    console.error("Error creating proxy links:", error);
    process.exit(1);
})      