const { db } = require("../functions/firebase");
const { createProxyLinkForProfile, proxyRef } = require("../functions/Sessions/session-get-from-proxy");


async function createProxyLinksForUser(uid, user = null) {
    user = user || (await db.ref(`users/${uid}`).get()).val();
    const profiles = Object.keys(user?.settings?.profiles || {}).filter(profileID => profileID !== "default");
    await Promise.all(profiles.map(profileID => createProxyLinkForProfile(uid, profileID)));
}


async function createProxyLinks() {
    const users = (await db.ref("users").get()).val() || {};
    await Promise.all(Object.entries(users).map(([uid, user]) => createProxyLinksForUser(uid, user)));
}


async function test() {
    proxyRef().set(null)
    await createProxyLinks();
}


test().then(() => {
    console.log("Proxy links created");
    process.exit(0);
}).catch((error) => {
    console.error("Error creating proxy links:", error);
    process.exit(1);
})      