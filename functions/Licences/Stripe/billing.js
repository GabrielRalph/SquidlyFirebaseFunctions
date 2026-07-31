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
 * 
 * 
 * @typedef {Object} CreateSubscriptionCheckoutParams
 * @property {import("./shared").UID} creatorUID
 * @property {string} productID the ID of the product to create a subscription for.
 * @property {string} priceIndex index of the price in the product's prices array.
 * @property {number} quantity number of seats.
 * @property {string} return_url the URL to redirect the user to after the checkout is complete.
 * @property {string} licenceID the id of licence creator wants to renew.
 * @property {boolean} isTest whether to use the test or live stripe API.
 * @property {boolean} isPublic whether this is a public call.
 * @property {number} [trialPeriod] the number of days to apply a trial period for.
 */

const DEFAULT_PARAMS = {
    creatorUID: "",
    productID: "",
    priceIndex: 0,
    quantity: 1,
    return_url: "",
    licenceID: "",
    isTest: true,
    isPublic: false,
    trialPeriod: null,
}

const { refPath, usersRef } = require("../../Shared/shared.js");
const { createLicence, licencesRef, isBillerLevel, updateLicenceTier, updateLicenceSeats, suspendLicence, specialOfferRef } = require("../shared.js");
const { Auth } = require('../../firebase.js');
let { debug } = require("firebase-functions/logger");
const { FirebaseAuthError } = require("firebase-admin/auth");

if (process.env["TEST"]) {
    debug = console.log;
}

function getStripe(mode = "TEST") {
    const stripe = require("stripe")(process.env[`STRIPE_API_KEY_${mode}`]);
    return stripe;
}

class SubscriptionDetails {
    /**
     * @type {number} the tier ID of the subscription
     */
    tierID = 0;

    /**
     * @type {string} the licence ID in firebase of the subscription
     */
    licenceID = null;

    /**
     * @type {string} the firebase UID of the user who created the subscription
     */
    creatorUID = null;

    /**
     * @type {string} the name of the licence
     */
    licenceName = null;

    /**
     * @type {number} the number of seats in the subscription
     */
    seats = 1;

    /**
     * @type {("incomplete"|"incomplete_expired"|"trialing"|"active"|"past_due"|"canceled"|"unpaid"|"paused")} status of the subscription
     */
    status = "incomplete";

    constructor(subscriptionObject) {
        this.object = subscriptionObject;
        this.item = subscriptionObject.items.data[0];
        this.seats = this.item.quantity;
        this.status = subscriptionObject.status;
        this.customer = subscriptionObject.customer;
    }

    async checkLicenceExists() {
        const {licenceID, customer, isLicenceIDValid} = this;
        // Ensure if a licence is provided it links to the customer ID
        let isMatched = true;
        if (isLicenceIDValid) {
            const linkedCustomer = (await licencesRef(licenceID, "customerID").get()).val();
            if (linkedCustomer === null || linkedCustomer !== customer) {
                isMatched = false;
                debug(`STRIPE: customer ${customer} links the licence with id "${licenceID}", but ${linkedCustomer === null ? "no licence exists with that id" : `that licence links to a different customer id ${linkedCustomer}`}.`)
            }
        }

        this.licenceMatched = isMatched;
        return isMatched;
    }

    async updateLicence() {
        const {isLicenceIDValid, licenceMatched, licenceID, tierID, seats, isActive} = this;
        if (isLicenceIDValid && licenceMatched) {

            // Suspend or unsuspend the licence depending on the subscription status
            debug(`STRIPE: ${isActive ? "Unsuspending" : "Suspending"} licence ${licenceID}...`);
            await suspendLicence(licenceID, !isActive);
            
            // If the licence is unsuspended then ensure that the
            // licence has the same tier and number of seats as 
            // specified by the subsubscription.
            if (isActive) {
                debug(`STRIPE: Updating licence ${licenceID} with tier ${tierID} and seats ${seats}.`);
                await updateLicenceSeats(licenceID, seats);
                await updateLicenceTier(licenceID, tierID);
            }
        }
    }

    async createLicence(stripe, isTest) {
        // Get creators auth token 
        const authToken = await Auth.getUser(this.creatorUID);
        this.email = authToken.email;

        debug(`STRIPE: creating licence for ${authToken.email}\n${this.toString()}`);

        // Create new licence.
        let lid = await createLicence(authToken, 
            this.tierID, 
            this.seats, 
            this.customer, 
            this.licenceName, 
            this.licenceID, 
            isTest
        );
        
        if (lid != null) {
            this.licenceID = lid;
            const {licenceID, creatorUID, licenceName, customer, email} = this;
            await stripe.customers.update(customer, {
                name: licenceName,
                email,
                metadata: {
                    creatorUID,
                    licenceID,
                    licenceName,
                }
            });
            this.licenceMatched = true;
        } 

        return lid != null;
    }

    async getLicenceName(stripe) {
        let name = "Untitled Organisation"
        try {
            const sessionsList = await stripe.checkout.sessions.list({
                subscription: this.object.id,
            })
            const session = sessionsList?.data[0];
            let fields = (session?.custom_fields || []).filter(a => a.key == "organisation");
            if (fields.length > 0) {
                let value = fields[0]?.text?.value;
                if (isNonEmptyString(value)) {
                    name = value;
                }
            }
        } catch (e) {
            debug("STRIPE: Error retreiving licence name.", e)
        }

        this.licenceName = name;
    }

    async getTier() {
        let tierID = await refPath("licences-settings", ["price-to-tier", this.item.price.id, "tierID"]).get()
        this.tierID = tierID.val() || 0;
    }

    async getCustomerInfo(stripe) {
        let {metadata} = await stripe.customers.retrieve(this.customer);
        let {licenceID, creatorUID} = metadata;
        this.licenceID = licenceID;
        this.creatorUID = creatorUID;
    }

    log() {
        debug(`STRIPE: Subscription Details:\n\tlicenceName: ${this.licenceName}\n\tstatus: ${this.status}\n\ttierID: ${this.tierID}\n\tseats: ${this.seats}\n\tlicenceID: ${this.licenceID}\n\tcreatorUID: ${this.creatorUID}`);
    }

    toString() {
        return `\tlicenceName: ${this.licenceName}\n\tstatus: ${this.status}\n\ttierID: ${this.tierID}\n\tseats: ${this.seats}\n\tlicenceID: ${this.licenceID}\n\tcreatorUID: ${this.creatorUID}`;
    }


    get isLicenceIDValid() {
        return isNonEmptyString(this.licenceID);
    }

    /**
     * @returns {boolean} whether the subscription is active or not.
     */
    get isActive() {
        return this.status in SubscriptionDetails.STATUS_VALUES && SubscriptionDetails.STATUS_VALUES[this.status];
    }

    static STATUS_VALUES = {
        "incomplete": false,
        "incomplete_expired": false,
        "past_due": false,
        "canceled": false,
        "unpaid": false,
        "paused": false,
        "trialing": true,
        "active": true,
    }

    static async get(subscriptionObject, stripe) {
        const details = new SubscriptionDetails(subscriptionObject);
        await Promise.all([
            details.getLicenceName(stripe),
            details.getTier(),  
            details.getCustomerInfo(stripe),
        ]);
        return details;
    }
}

const MAX_USER_SEATS = 10000; // Maximum number of seats a user can purchase in a single subscription.

function isNonEmptyString(str) {return typeof str === "string" && str.length > 0}
function isPositiveInteger(num) {return typeof num === "number" && Number.isInteger(num) && num > 0}

async function ownsLicence(creatorUID) {
    let has = false;
    let licenceKeys = (await usersRef(creatorUID, "licences").get()).val();
    if (licenceKeys != null) {
        let licences = await Promise.all(
            Object.keys(licenceKeys).map(async lid => (await licencesRef(lid, "users", creatorUID, "status").get()).val())
        )
        licences = licences.filter(l => l == "owner");
        has = licences.length > 0;
    }
    return has;
}


/**
 * Checks that the product ID and price index are valid.
 * @param {CreateSubscriptionCheckoutParams} args
 * @param {string[]} errors an array to push error messages to.
 * 
 * @return {Promise<[boolean, Object, string, string[]]>} returns a promise that resolves to an array containing:
 * 1. A boolean indicating whether the product and price are valid.
 * 2. The product object if valid, otherwise null.
 * 3. The price ID if valid, otherwise null.
 * 4. An array of error messages if any.
 */
async function validateProductAndPrice(args = {}) {
    args = !args || typeof args !== "object" ? {} : args;
    let {productID, priceIndex, isTest, isPublic} = {...DEFAULT_PARAMS, ...args};

    let valid = false;
    let errors = [];
    let product = await refPath("licences-settings", ["tier-info", productID]).get();
    product = product.val();
    if (product === null) {
        errors.push(`Invalid product ID "${productID}".`);
    } else if (!product.public && isPublic) {
        errors.push(`Product with ID "${productID}" is not public.`);
    } else if (!(priceIndex in product.prices)) {
        errors.push(`Invalid price index "${priceIndex}" for product with ID "${productID}".`);
    } else {
        valid = true;
    }

    
    let priceID = null;
    if (valid) {
        let price = product.prices[priceIndex];
        priceID = isTest ? price.testID : price.id;
    
        if (!isNonEmptyString(priceID)) {
            errors.push(`Invalid price ID "${priceID}" for price "${JSON.stringify(price)}".`);
            valid = false;
        } 
    }
    return [valid, product, priceID, errors];
}


/** Creates a subscription check out using stripe.
 * 1. Validates the input parameters.
 *  - Checks that the product ID and price index are valid.
 * 
 *  - Checks that the user has biller priviledges for 
 *    the licence if a licence ID is provided.
 * 2. Creates a stripe customer if one does not exist.
 * 3. Creates a stripe checkout session for the subscription.
 *  - If a trial period is specified then apply it.
 *    Otherwise if the product has a trial period and 
 *    either the user does not own a licence or the product
 *    forces a trial apply the trial.
 * 
 * @param {CreateSubscriptionCheckoutParams} args
 * @return {Promise<{errors: string[], client_secret: string}>}
 */
async function createSubscriptionCheckout(args={}) {
    args = !args || typeof args !== "object" ? {} : args;
    let {creatorUID, productID, priceIndex, quantity, return_url, licenceID, isTest, isPublic, trialPeriod} = {...DEFAULT_PARAMS, ...args};

    let [valid, product, priceID, errors] = await validateProductAndPrice({productID, priceIndex, isTest, isPublic});
    let client_secret = null;

    // Ensure quantity is a positive integer and does not exceed the maximum number of seats.
    if (typeof quantity !== "number" || quantity <= 0 || quantity > MAX_USER_SEATS || Number.isNaN(quantity)) {
        quantity = 1;
    } else {
        quantity = Math.ceil(quantity);
    }

    debug("STRIPE:", isTest ? "TEST" : "LIVE", `Creating subscription checkout for user ${creatorUID} with product ID ${productID}, price index ${priceIndex}, quantity ${quantity}, return URL ${return_url}, licence ID ${licenceID}.`);
    
    const stripe = getStripe(isTest ? "TEST" : "LIVE");
    let customer = null;

    // If a licence ID is provided i.e. this is a renewal.
    if (valid && isNonEmptyString(licenceID)) {
        // Check creator is an admin of the licence
        let creatorStatus = (await licencesRef(licenceID, "users", creatorUID, "status").get()).val();
        if (!isBillerLevel(creatorStatus)) {
            errors.push("User is attempting to renew a licence that either doesn't exist or they do not have the privileges to renew.");
            valid = false;
        } else {
            customer = (await licencesRef(licenceID, "customerID").get()).val();
        }
    }


    // Create stripe customer if one does not exist.
    if (valid && customer == null) {
        const token = await Auth.getUser(creatorUID); 
        const date = new Date();
        customer = await stripe.customers.create({
            name: `squidly_licence_${creatorUID}_${date.getFullYear()}_${date.getMonth() + 1}_${date.getDate()}`,
            email: token.email,
            metadata: {
                creatorUID,
                licenceID: licencesRef().push().key 
            }
        });
        customer = customer.id;
    }


    // Creator is either renewing a licence (they own) or creating a new one.
    if (valid) {
        const subscription_data = {};

        // If a trial period is specified then use that
        if (isPositiveInteger(trialPeriod)) {
            subscription_data.trial_period_days = trialPeriod;

        // otherwise if the user does not own a licence then give them a 7 day trial.
        } else if (
            isPositiveInteger(product.trialPeriod) &&
            (product.forceTrial || !(await ownsLicence(creatorUID)))
        ) {
            subscription_data.trial_period_days = product.trialPeriod;
        }
        
        // Create a stripe checkout session for the subscription.
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customer,
            line_items: [
                { 
                    price: priceID, 
                    quantity, 
                    adjustable_quantity: {
                        enabled: true,
                        maximum: MAX_USER_SEATS,
                        minimum: 1,
                    }
                },
            ],
            subscription_data,
            ui_mode: 'embedded',
            return_url,
            payment_method_types: ["card"],
            metadata: {
                creatorUID, 
                licenceID,
                isTest: isTest ? "true" : "false",
                tier: product.tierID
            },
            custom_fields: [
                {
                  key: 'organisation',
                  label: {
                    type: 'custom',
                    custom: 'Organisation',
                  },
                  type: 'text',
                  text: {
                    minimum_length: 1,
                    maximum_length: 255,
                  },
                  optional: false,
                },
            ],
        });
        client_secret = session.client_secret;
    }
    
    return {errors, client_secret}
}

/**
 * Creates a special offer for a product and price index that expires after a certain number of days.
 * @param {CreateSubscriptionCheckoutParams} args
 * @param {number} durationInDays the number of days until the special offer expires.
 * @returns {Promise<string>} returns a promise that resolves to the special offer token.
 */
async function createSpecialOffer(args={}, durationInDays) {
    args = !args || typeof args !== "object" ? {} : args;
    const {productID, priceIndex, isTest, trialPeriod} = {...DEFAULT_PARAMS, ...args};

    durationInDays = isPositiveInteger(durationInDays) ? durationInDays : 1; 
    const  expiry = Date.now() + durationInDays * 24 * 60 * 60 * 1000;

    const [valid, product, priceID, errors] = await validateProductAndPrice({productID, priceIndex, isTest, isPublic: false});
    
    let token = null;
    if (valid) {
        const offer = {
            productID,
            priceIndex,
            expiry,
            isTest,
            trialPeriod: isPositiveInteger(trialPeriod) ? trialPeriod : null,
        }
        token = specialOfferRef().push().key;
        await specialOfferRef(token).set(offer);
    }

    return token;
}

/** Called when a subscription event is triggered by stripe webhooks.
 * @param {Subscription} subscription
 * 
 */
async function onSubscriptionEvent(subscription, isTest) {
    const stripe = getStripe(isTest ? "TEST" : "LIVE");

    const details = await SubscriptionDetails.get(subscription, stripe);

    // If no licence ID was parsed then create a new licence.
    if (!(await details.checkLicenceExists(stripe))) {
        try {
            if (await details.createLicence(stripe, isTest)) {
                // await sendLicenceCreationEmail(details.email, details.creatorUID);
                debug(`STRIPE: Successfully created licence with ID ${details.licenceID} for user with UID: ${details.creatorUID}`);
            } else {
                debug(`STRIPE: creation failed likely due to a creation already occuring.`)
            }
        } catch (e) {
            debug("STRIPE: Error creating licence.", e instanceof FirebaseAuthError ? "Invalid user uid." : e);
            throw e;
        }
    }

    await details.updateLicence();
}

async function webhookHandler(req, res, isTest) {
    const stripe = getStripe(isTest ? "TEST" : "LIVE");
    const SIGNING_SECRET = process.env[`STRIPE_SIGNING_SECRET_${isTest ? "TEST" : "LIVE"}`];
    let signature = req.headers["stripe-signature"];
    let event;

    // Verify signature first. If this fails, Stripe should not retry as a processing error.
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            SIGNING_SECRET
        );
    } catch (error) {
        debug("STRIPE: Error parsing webhook.", error)
        return res.sendStatus(400);
    }

    debug(`STRIPE: event:\n\ttype: ${event.type}\n\tobject: ${event.data.object.object}\n\tcustomer: ${event.data.object.customer}\n\n`);

    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                await onSubscriptionEvent(event.data.object, isTest);
                break;
            default:
                break;
        }
        return res.sendStatus(200);
    } catch (e) {
        debug("STRIPE: Error processing webhook event.", e);
        return res.sendStatus(500);
    }
}

async function createBillingPortal(licenceID, return_url) {
    let customer = (await licencesRef(licenceID, "customerID").get()).val();
    let isTest = (await licencesRef(licenceID, "isTest").get()).val();
    const stripe = getStripe(isTest ? "TEST" : "LIVE");
    const session = await stripe.billingPortal.sessions.create({customer,return_url});
    return session.url;
}


module.exports = {
    createSpecialOffer,
    webhookHandler,
    createSubscriptionCheckout,
    createSpecialOffer,
    createBillingPortal,
    onSubscriptionEvent,
    ownsLicence
}
