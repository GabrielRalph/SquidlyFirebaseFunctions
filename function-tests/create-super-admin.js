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
        if (!token) {
            throw email;
        } else {
            uid = token.uid;
        }
        
        await db.ref(`super-admin/${uid}`).set(true);
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