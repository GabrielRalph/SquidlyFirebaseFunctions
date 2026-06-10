const { onValueWritten, onValueCreated } = require("firebase-functions/database");
const { debug } = require("firebase-functions/logger");
const { sendEmail, emailerPrivateKey} = require("./sendEmail.js");

module.exports = {
    onWriteContact: onValueWritten({
        ref: "contact-messages/{messageId}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async ({data: {before, after}}) => {
        // On creation of a grid topic, update the user's usage
        
        if (after.exists() && !before.exists()) {
           let data = after.val();
           let response = await sendEmail({
                from: "gabriel@squidly.com.au",
                to: "contact@squidly.com.au",
                templateName: "contact",
                data,
            });
            if (response.error) {
                debug(`EMAILER: Failed to send contact message email: ${response.message}`);
            } else {
                debug(`EMAILER: Successfully sent contact message email: ${response.message}`);
                // Delete the message after sending the email
                after.ref.set(null);
            }
        }
    }),
    onMessage: onValueCreated({
        ref: "messages/{messageId}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async ({data}) => {
        // On creation of a message, send an email notification
        if (data.exists()) {
           data = data.val();
           data.jobTitle = data.jobTitle || "Squidly User";
           let response = await sendEmail({
                from: "gabriel@squidly.com.au",
                to: "contact@squidly.com.au",
                templateName: "contact",
                data,
            });
        }
    }),

}