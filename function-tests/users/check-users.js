const inquirer =  require('inquirer');
const {db, Auth} = require('../../functions/firebase.js');
const { getUsersMaxTier } = require('../../functions/Licences/shared.js');
const { ownsLicence } = require('../../functions/Licences/Stripe/billing.js');
const { info, log } = require('console');
const fs = require('fs');
const infoKeys = [
    "dark",
    "displayPhoto",
    "firstName",
    "hostAudio",
    "hostVideo",
    "lastName",
    "optionalData",
    "participantAudio",
    "participantVideo",
    "pronouns",
    "requiredData",
]
function length(obj) {
    return Object.keys(obj || {}).length;
}

function lastSession(sessions) {
    sessions = Object.values(sessions || {});
    if (sessions.length === 0) return "-";
    sessions.sort((a, b) => b.startTime - a.startTime);
    let d = new Date();
    d.setTime(sessions[0].startTime);
    return d.toDateString();
}

async function test() {
    
    let allUsers = db.ref('users');
    let snapshot = await allUsers.get();
    let users = snapshot.val();
    const Stats = [];
    for (let uid in users) {
        let userData = users[uid];

        let email = userData.info.email;
        let displayName = userData.info.displayName;

        let infoProgress = 0;
        for (let key of infoKeys) {
            infoProgress += (userData.info[key] ? 1 : 0);
        }
        infoProgress = Math.round((infoProgress / infoKeys.length) * 100);
        let scheduled = length(userData.sessions);
        let history = length(userData["session-history"]);
        let lastSes = lastSession(userData["session-history"]);

        let str = `User ${email} (${displayName}):\n\tUID: ${uid}\n\tInfo Progress: ${infoProgress}% (${length(userData.info)}/${infoKeys.length})\n\tSessions:\n\t\tscheduled: ${scheduled}\n\t\thosted: ${history}\n\t\tlast date: ${lastSes}\n\tMax Tier: ${await getUsersMaxTier(uid)}\n`
        console.log(str);
        Stats.push(str);
    }
    fs.writeFileSync("user-stats.txt", Stats.join("\n"), "utf8");
}


test().then(() => {
    console.log("Test completed successfully.");
}).catch(err => {
    console.error("Test failed:", err);
}).finally(() => {
    console.log("Test attempt completed.");
    process.exit(0);
});