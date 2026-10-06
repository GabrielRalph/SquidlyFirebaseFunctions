const inquirer =  require('inquirer');
const {db, Auth} = require('../../functions/firebase.js');
const { getUsersMaxTier } = require('../../functions/Licences/shared.js');
const { ownsLicence } = require('../../functions/Licences/Stripe/billing.js');

async function test() {
    
    let uid = null
    try {
        const {uid} = await inquirer.default.prompt([{
            type: "input",
            name: "uid",
            message: "What is the UID of the user?",
            default: null,
        }]);
        const token = await Auth.getUser(uid);
        console.log("User's token:", JSON.stringify(token));
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