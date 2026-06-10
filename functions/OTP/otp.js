const { onCall } = require("firebase-functions/https");
const { emailerPrivateKey } = require("../Emailer/sendEmail");
const { isNonNullObject, validateData } = require("../Shared/shared");
const { sendOTP, verifyOTP, otpLength, createAccountWithOTP } = require("./otp-methods");
const { Auth, db } = require("../firebase");
const { error, debug } = require("firebase-functions/logger");

function isNonEmptyString(str) {return typeof str === "string" && str.length > 0}


function checkEmailIsFromDomain(email, domain) {
    if (typeof email !== "string" || typeof domain !== "string") return false;

    const e = email.trim().toLowerCase().replace(/\.+$/, "");
    const d = domain.trim().toLowerCase().replace(/^\@+/, "").replace(/\.+$/, "");

    return e.endsWith(d)
}
const ONLY_VIA_PROVIDER = [
    "cerebralpalsy.org.au",
]


const VALIDATE_GET_OTP = [
    ({data}) => {if (!isNonNullObject(data)) return "User did not provide data.";},
    ({data: {email}}) => {if (!isNonEmptyString(email)) return "User did not provide an email."},
    ({data: {email}}) => {if (ONLY_VIA_PROVIDER.some(domain => checkEmailIsFromDomain(email, domain))) return "Email domain is not allowed."},
]

const VALIDATE_CHECK_OTP = [
    ...VALIDATE_GET_OTP,
    ({data: {otp}}) => {if (!isNonEmptyString(otp) || (otp.length != otpLength)) return "User did not provide an OTP."},
]

const VALIDATE_CREATE_ACCOUNT_OTP = [
    ...VALIDATE_GET_OTP,
    ({data: {firstName}}) => {if (!isNonEmptyString(firstName)) return "User did not provide firstName."},
    ({data: {lastName}}) => {if (!isNonEmptyString(lastName)) return "User did not provide lastName."},
]

const VALIDATE_VERIFY_EMAIL = [
    ({auth}) => {if (!isNonNullObject(auth)) return "User is not currently authenticated.";},
    ({auth: {token}}) => {if (!isNonNullObject(token)) return "User is not currently authenticated."},
    ({auth: {token: {email}}}) => {if (!isNonEmptyString(email)) return "Authenticated user does not have an email."},
    ({auth: {token: {email}}}) => {if (!ONLY_VIA_PROVIDER.some(domain => checkEmailIsFromDomain(email, domain))) return "Email domain is not allowed."},
]


module.exports = {
    getOTP: onCall({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    },async (req) => {
        let errors = [];
        if (await validateData(req, VALIDATE_GET_OTP, errors)) {
            let error = await sendOTP(req.data.email);
            if (error) {
                errors.push(error);
            }
        }
        return {errors};
    }),

    checkOTP: onCall({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async (req) => {
        let res = {errors: []};
        if (await validateData(req, VALIDATE_CHECK_OTP, res.errors)) {
            let {error, token} = await verifyOTP(req.data.email, req.data.otp);
            if (error) {
                res.errors.push(error);
            } else {
                res.token = token;
            }
        }
        return res;
    }),

    createAccountWithOTP: onCall({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async (req) => {
        let errors = []
        if (await validateData(req, VALIDATE_CREATE_ACCOUNT_OTP, errors)) {
            let error = await createAccountWithOTP(req.data.email, req.data.firstName, req.data.lastName);
            if (error) {
                errors.push(error);
            }
        }
        return {errors};
    }),


    forceAccountLinking: onCall({
        region: "asia-southeast1",
    }, async (req) => {
        let errors = []
        if (await validateData(req, VALIDATE_VERIFY_EMAIL, errors)) {
            let {uid, token: {email, name, displayName}} = req.auth;
            displayName = displayName || name;
            


        }
    }),


    verifyEmail:  onCall({
        region: "asia-southeast1",
    }, async (req) => {
        let errors = []
        if (await validateData(req, VALIDATE_VERIFY_EMAIL, errors)) {
            const {auth: {uid, token: {email, name, displayName}}} = req;
            let newDisplayName = displayName || name;
            newDisplayName = typeof newDisplayName === "string" && newDisplayName.trim().length > 0 ? newDisplayName.trim() : "Squidly User";
            const firstName = newDisplayName.split(" ")[0];
            const lastName = newDisplayName.split(" ")[1] || "";
            try {         
                await Auth.updateUser(uid, { emailVerified: true });
                await db.ref(`users/${uid}/info`).set({ firstName, lastName, displayName: newDisplayName, email });
                debug(`OTP: Successfully verified email for user with name: ${newDisplayName}, uid: ${uid}, and email: ${email}`);
            } catch (e) {
                errors.push(e.message);
                error(`OTP: Failed to verify email for user with name: ${newDisplayName}, uid: ${uid}, and email: ${email}`);
            }
        }
        return {errors};
    }),


}
