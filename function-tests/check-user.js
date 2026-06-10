const inquirer =  require('inquirer');
const {db, Auth} = require('../functions/firebase.js');
const { getUsersMaxTier } = require('../functions/Licences/shared.js');
const { ownsLicence } = require('../functions/Licences/Stripe/billing.js');

async function test() {
    
    let uid = null
    try {
        res = await inquirer.default.prompt([{
            type: "input",
            name: "email",
            message: "What is the email of the user this offer is made out to?",
            default: null,
        }]);
        let email = res.email;
    
        let token = await Auth.getUserByEmail(email);
        console.log("Token:", token);
        if (!token) {
            throw email;
        } else {
            uid = token.uid;
        }
    
    
        let userData = (await db.ref(`users/${uid}`).get()).val();
        let maxTier = await getUsersMaxTier(uid);
        let owner = await ownsLicence(uid);
        // console.log(`User ${email} ${userData.info.displayName} (${uid}) has tier: ${maxTier} and data:`, userData);
        // console.log(`\n\nUser ${email}: ${owner ? "owns a licence" : "does not own a licence"}`);
        console.log(
            `\n\nUser ${email} (${userData.info.displayName}):\n\tUID: ${uid}\n\t${Object.keys(userData.info).map(k => `${k}: ${userData.info[k]}`).join("\n\t")}\n\tLicence Owner: ${owner ? "Yes" : "No"}`);
    } catch (e) {
        uid = null;
        console.error(`Failed to find user with email: ${e}\nPlease make sure the user exists and has a verified email.`);
    }
}


test().then(() => {
    console.log("Test completed successfully.");
}).catch(err => {
    console.error("Test failed:", err);
}).finally(() => {
    console.log("Test attempt completed.");
    process.exit(0);
});