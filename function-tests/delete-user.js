const inquirer =  require('inquirer');
const {db, Auth} = require('../functions/firebase.js');

async function test() {
    
    res = await inquirer.default.prompt([{
        type: "input",
        name: "email",
        message: "What is the email of the user this offer is made out to?",
        default: null,
    }]);
    let email = res.email;
    
    let uid = null;
    let token = null;
    try {
        token = await Auth.getUserByEmail(email);
        if (!token) {
            throw email;
        } else {
            uid = token.uid;
        }
    } catch (e) {
        uid = null;
        console.error(`Failed to find user with email: ${email}\nPlease make sure the user exists and has a verified email.`);
    }
    

    if (uid) {
        let userData = (await db.ref(`users/${uid}/info`).get()).val() || {};
        let name = (userData.displayName || (userData.firstName + " " + userData.lastName)).trim() || "NA";
        // confirm user deletion
        let { confirm } = await inquirer.default.prompt([{
            type: "confirm",
            name: "confirm",
            message: `Are you sure you want to delete user:\n\tName: ${name}\n\tEmail: ${email}\n\tUID: ${uid}\nThis action cannot be undone.`,
            default: false,
        }]);
        if (confirm) {
            await Auth.deleteUser(uid);
            await db.ref(`users/${uid}`).set(null);
            console.log(`Deleted user with UID: ${uid}`);
        }
    } else {
        console.log("No user to delete.");
    }
}


test().then(() => {
    console.log("Success.");
}).catch(err => {
    console.error("Test failed:", err);
}).finally(() => {
    process.exit(0);
});