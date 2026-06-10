const inquirer =  require('inquirer');
const { sendOTP, verifyOTP } = require('../functions/OTP/otp-methods');
const privateKey = require("../private/squidly-gmail-key.json")


async function testOTP() {
    // Get email from prompt
    let { email } = await inquirer.default.prompt([{
        type: "input",
        name: "email",  
        message: "Enter the email to send the OTP to:",
    }]);

    // Call getOTP function
    let error = await sendOTP(email, privateKey);
    if (error) {
        console.error("\n\nFailed to send OTP.\n\n", error);
    } else {
        console.log(`\n\nSuccessfully sent OTP to ${email}.\n\n`);
    
        let { otp } = await inquirer.default.prompt([{
            type: "input",
            name: "otp",  
            message: "Enter the OTP received in the email:",
        }]);
    
        let { error: verifyError, token } = await verifyOTP(email, otp);
    
        if (verifyError) {
            console.error("\n\nFailed to verify OTP.\n\n", verifyError);
        } else {
            console.log("\n\nSuccessfully verified OTP. Token:", token);
        }
    }


}

testOTP().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});