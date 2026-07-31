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
const { licencesRef, isBillerLevel, specialOfferRef } = require("./shared.js");
const { onCall, onRequest } = require("firebase-functions/https");
const { webhookHandler, createSubscriptionCheckout, createBillingPortal } = require("./Stripe/billing.js");
const { emailerPrivateKey } = require("../Emailer/sendEmail.js");

function isNonEmptyString(str) {return typeof str === "string" && str.length > 0}

const CREATE_SUBSCRIPTION_VALIDATORS = [
    ({auth}) => {if (!isNonNullObject(auth)) return "User is not authenticated";},
    ({auth}) => {if (!auth.token.email_verified) return "User is not email verified.";},
    ({data}) => {if (!isNonNullObject(data)) return "User did not provide subscription data.";},
    
    async ({auth: {uid}, data: {licenceID}}) => {
        if (isNonEmptyString(licenceID)) {
            let userStatus = (await licencesRef(licenceID, "users", uid, "status").get()).val();
            if (!isBillerLevel(userStatus)) {
                return "User does not have biller priviledges for this licence."
            }
        } 
    },

    async ({data, auth}) => {
        let {specialOfferToken} = data;
        if (isNonEmptyString(specialOfferToken)) {
            let offer = (await specialOfferRef(specialOfferToken).get()).val();
            if (!isNonNullObject(offer)) {
                return "Invalid special offer token."
            } else {
                let expiry = offer.expiry;
                if (typeof expiry !== "number" || Date.now() > expiry) {
                    return "Special offer has expired."
                } else if (offer.claimer && offer.claimer !== auth.uid) {
                    return "Special offer has already been claimed by another user."
                } else {
                    data.specialOffer = offer;
                }
            }
        }
    },

    ({data: {productID, specialOffer}}) => {if (!specialOffer && !isNonEmptyString(productID)) return "User did not provide a valid product ID."},
    ({data: {priceIndex, specialOffer}}) => {if (!specialOffer && (typeof priceIndex !== "number" || Number.isNaN(priceIndex))) return "User did not provide a valid price index."},
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
        await webhookHandler(req, res, true);
    }),

    webhookLive: onRequest({
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async (req, res) => {
        await webhookHandler(req, res, false);
    }),

    createLicenceCheckout: onCall({
        region: "asia-southeast1"
    },async (req) => {
        let client_secret = null;
        let errors = [];
        if (await validateData(req, CREATE_SUBSCRIPTION_VALIDATORS, errors)) {
            let {auth, data} = req;
            let {productID, priceIndex, seats, return_url, licenceID, specialOffer, specialOfferToken} = data;
            if (!licenceID) licenceID = "";
            try {
                let options = {
                    creatorUID: auth.uid, 
                    productID, 
                    priceIndex, 
                    quantity: seats, 
                    return_url, 
                    licenceID, 
                    isPublic: true, 
                    isTest: false
                }

                // If a special offer is provided
                if (specialOffer) {
                    // If the special offer already has a client_secret then
                    // we can just relay that back to the user.
                    if (specialOffer.client_secret) {
                        client_secret = specialOffer.client_secret ?? null;
                    
                    // Otherwise, we need to create a new checkout 
                    // session for the special offer. 
                    } else {
                        options.isPublic = false;
                        options.productID = specialOffer.productID;
                        options.priceIndex = specialOffer.priceIndex;
                        options.trialPeriod = specialOffer.trialPeriod;
                        options.isTest = specialOffer.isTest;

                        // Mark the special offer as claimed by this user.
                        await specialOfferRef(specialOfferToken).update({claimer: auth.uid});
                    }
                }

                // If we don't have a client_secret yet, create a new checkout session.
                if (!client_secret) {
                    let res = await createSubscriptionCheckout(options);
                    errors = res.errors;
                    client_secret = res.client_secret;

                    // If we created a new checkout session for a special offer,
                    // we need to store the client_secret in the special offer.
                    if (specialOffer && client_secret) {
                        await specialOfferRef(specialOfferToken).update({client_secret});
                    }
                }

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
