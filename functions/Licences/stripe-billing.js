/**
 * @typedef {Object} SubscriptionMetadata
 * @param {string} licenceID
 * @param {string} creatorUID
 * @param {string} licenceName
 * 
 * @typedef {Object} StripePrice
 * @param {{tier: string}} metadata
 * 
 * @typedef {Object} StripeItem
 * @param {number} quantity
 * @param {StripePrice} price
 * 
 * @typedef {Object} SubscriptionObject
 * @param {("incomplete"|"incomplete_expired"|"trialing"|"active"|"past_due"|"canceled"|"unpaid"|"paused")} status
 * @param {SubscriptionMetadata} metadata
 * @param {string} id
 * @param {{data: StripeItem[]}} items
 */


const { validateData, isNonNullObject } = require("../Shared/shared.js");
const { licencesRef, isBillerLevel } = require("./shared.js");
const { onCall, onRequest } = require("firebase-functions/https");
const { webhookHandler, createSubscriptionCheckout, createBillingPortal } = require("./Stripe/billing.js");
const { emailerPrivateKey } = require("../Emailer/sendEmail.js");

function isNonEmptyString(str) {return typeof str === "string" && str.length > 0}

const CREATE_SUBSCRIPTION_VALIDATORS = [
    ({auth}) => {if (!isNonNullObject(auth)) return "User is not authenticated";},
    ({auth}) => {if (!auth.token.email_verified) return "User is not email verified.";},
    ({data}) => {if (!isNonNullObject(data)) return "User did not provide subscription data.";},
    ({data: {productID}}) => {if (!isNonEmptyString(productID)) return "User did not provide a valid product ID."},
    ({data: {priceIndex}}) => {if (typeof priceIndex !== "number" || Number.isNaN(priceIndex)) return "User did not provide a valid price index."},
    async ({auth: {uid}, data: {licenceID}}) => {
        if (isNonEmptyString(licenceID)) {
            let userStatus = (await licencesRef(licenceID, "users", uid, "status").get()).val();
            if (!isBillerLevel(userStatus)) {
                return "User does not have biller priviledges for this licence."
            }
        } 
    },
];

const CREATE_PORTAL_VALIDATORS = [
    ...CREATE_SUBSCRIPTION_VALIDATORS.slice(0, 3),
    async ({auth: {uid}, data: {licenceID}}) => {
        if (isNonEmptyString(licenceID)) {
            let userStatus = (await licencesRef(licenceID, "users", uid, "status").get()).val();
            if (!isBillerLevel(userStatus)) {
                return "User does not have biller priviledges for this licence."
            }
        } else {
            return "Invalid licence ID"
        }
    },
];

module.exports = {
    webhook: onRequest({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async (req, res) => {
        webhookHandler(req, res, true);
    }),

    webhookLive: onRequest({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async (req, res) => {
        webhookHandler(req, res, false);
    }),

    createLicenceCheckout: onCall({
        region: "asia-southeast1"
    },async (req) => {
        let client_secret = null;
        let errors = [];
        if (await validateData(req, CREATE_SUBSCRIPTION_VALIDATORS, errors)) {
            let {auth, data} = req;
            let {productID, priceIndex, seats, return_url, licenceID} = data;
            if (!licenceID) licenceID = "";
            try {
                let res = await createSubscriptionCheckout(auth.uid, productID, priceIndex, seats, return_url, licenceID, false, true);
                errors = res.errors;
                client_secret = res.client_secret;
            } catch (e) {
                let errorMsg = e instanceof Error ? "unexpected: " + e.message + "\n" + e.stack: e + "";
                errors.push(errorMsg)
            }
        }
        return {errors, client_secret};
    }),

    createCustomerPortal: onCall({
        region: "asia-southeast1"
    },async (req) => {
        let errors = [];
        let url = null;
        if (await validateData(req, CREATE_PORTAL_VALIDATORS, errors)) {
            try {
                url = await createBillingPortal(req.data.licenceID, req.data.return_url);
            } catch (e) {
                errors.push(e + "");
            }
        }
        return {errors, url}
    }),

}
