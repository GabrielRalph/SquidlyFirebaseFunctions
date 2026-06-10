const { db, Auth} = require("../firebase");

async function updateUserMetrics() {
    let users = (await db.ref("users").get()).val() || {};
    let uids = Object.keys(users);
    await Promise.all(uids.map(async uid => {
        try {
            let token = await Auth.getUser(uid);
            let creationTime = token.metadata.creationTime ? new Date(token.metadata.creationTime).getTime() : Date.now();
            let lastSignInTime = token.metadata.lastSignInTime ? new Date(token.metadata.lastSignInTime).getTime() : Date.now();
            await db.ref(`users/${uid}/metrics`).update({
                creationTime,
                lastSignInTime,
                email: token.email,
            });
        } catch (e) {

        }
    }));
}   

module.exports = {
    updateUserMetrics,
};