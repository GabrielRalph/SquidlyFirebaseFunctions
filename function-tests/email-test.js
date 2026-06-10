const { sendEmail } = require("../functions/Emailer/sendEmail");
const privateKey = require("../private/squidly-gmail-key.json")


sendEmail({
    from: "joshua@squidly.com.au",
    to: "Joshua.aarons@sydney.edu.au",
    templateName: "licence-creation",
    data: {firstName: "Joshua"},
    subject: 'Welcome to Squidly',
}, privateKey).then((e) => {
    console.log("Email sent successfully:", e);
}).catch(err => {
    console.error("Failed to send email:", err);
}).finally((e) => {
    console.log("Email send attempt completed.", e);
    process.exit(0);
});