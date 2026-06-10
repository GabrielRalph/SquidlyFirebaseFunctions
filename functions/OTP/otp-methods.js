const { sendEmail } = require("../Emailer/sendEmail");
const { Auth, db, getUserData } = require("../firebase");
const crypto = require("crypto");

const expiryMinutes = 10;
const retryMinutes = 2;
const otpLength = 6;

function generateRandomDigitNumber(n) {
    let digits = '';
    for (var i = 0; i < n; i++) {
        digits += Math.floor(Math.random() * 10);
    }
    return digits;
}

/**
 * Create a new OTP with expiry, only if user has an email
 * @returns {[string, { hash: string, expires: number, used: boolean }]} OTP object if valid, null otherwise
 */
function generateOTP() {
    const otp = generateRandomDigitNumber(otpLength);
    const expires = new Date(Date.now() + expiryMinutes * 60 * 1000).getTime();
    const hash = crypto.createHash("sha256").update(otp).digest("hex");
    return [otp, { hash, expires, used: false }];
}

/**
 * Create an OTP for a user and email it to them
 * @param {string} email 
 */
async function sendOTP(email, privateKey = null) {
    // Check user has an email
    let error = null;
    try {
        let user = null;
        try {
            user = await Auth.getUserByEmail(email)
            if (!user) {
                throw "err"
            }
        } catch (e) {
            throw new Error("NewUser: No user with that email exists.")
        }

        const oldOTPExpiry = (await db.ref(`otps/${user.uid}/expires`).get()).val();
        const timeSinceOldOTP = oldOTPExpiry ? Math.round((Date.now() - (oldOTPExpiry - expiryMinutes * 60 * 1000))/ 60000) : null;
        if (oldOTPExpiry && timeSinceOldOTP < retryMinutes) {
            throw new Error(`OTP: Please wait ${Math.round(retryMinutes - timeSinceOldOTP)} minutes before requesting a new OTP.`);
        }

        const [otp, otpData] = generateOTP();
        let [userName] = await Promise.all([
            getUserData(user.uid, "info", "firstName"),
            db.ref(`otps/${user.uid}`).set(otpData)
        ]);
        
        userName = userName || "Squidly User";
        userName = userName.trim();

        let res = await sendEmail({
            from: "gabriel@squidly.com.au",
            to: email,
            templateName: "otp",
            data: { otp, userName, expiryMinutes },
            subject: `Your Squidly code is ${otp}`,
        }, privateKey)

        if (res.error) {
            error = res.message;
        }
    } catch (e) {
        error = e.message;
    }
    return error
}

/** Verify an OTP for a given user 
 * @param {string} otp - The OTP entered by the user 
 * @param {string} email - The user object containing OTP details 
 */
async function verifyOTP(email, otp) {
    let error = null;
    let token = null;
    try {
        let user = null;
        try {
            user = await Auth.getUserByEmail(email)
            if (!user) {
                throw "err"
            }
        } catch (e) {
            new Error("OPT-BACK: No user with that email exists.")
        }

        const uid = user.uid;

        // Get the OTP record for the user
        const otpRecord = (await db.ref(`otps/${uid}`).get()).val();
        if (!otpRecord) {
            throw new Error("OPT-BACK: No OTP record found for this user.");
        }

        // Get current time and hash the provided OTP
        const now = Date.now();
        const otpHash = crypto.createHash("sha256").update(otp.toString()).digest("hex");

        // Check if OTP is expired if so delete it
        if (now > otpRecord.expires) {
            await db.ref(`otps/${uid}`).set(null);
            throw new Error("OTP: This code has expired.");
        } 

        // Check if OTP matches
        if (otpHash !== otpRecord.hash) {
            throw new Error("OPT: This code is not correct.");
        } 
        
        // Create a custom sign-in token and delete the OTP record
        if (user.emailVerified === false) {
            await Auth.updateUser(uid, { emailVerified: true });
        }
        token = await Auth.createCustomToken(uid);
        await db.ref(`otps/${uid}`).set(null);
    } catch (e) {
       error = e.message;
    }
    return { error, token };
}

async function createAccountWithOTP(email, firstName, lastName, privateKey = null) {
    let error = null;
    try {
        const userRecord = await Auth.createUser({
            email,
            emailVerified: false,
            password: crypto.randomBytes(32).toString("hex"),
            displayName: `${firstName} ${lastName}`,
            disabled: false,
        });
        uid = userRecord.uid;
        await db.ref(`users/${uid}/info`).set({ firstName, lastName, displayName: `${firstName} ${lastName}`, email });
        error = await sendOTP(email, privateKey);
    } catch (e) {
        error = e.message;
    }
    return error;
}

module.exports = {
    sendOTP,
    verifyOTP,
    createAccountWithOTP,
    otpLength
}