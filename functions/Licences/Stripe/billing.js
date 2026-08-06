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
 * 
 * 
 * @typedef {import("stripe").Stripe} Stripe
 * @typedef {import("stripe").Stripe.CustomerSubscriptionCreatedEvent} CustomerSubscriptionCreatedEvent
 * @typedef {import("stripe").Stripe.CustomerSubscriptionDeletedEvent} CustomerSubscriptionDeletedEvent
 * @typedef {import("stripe").Stripe.CustomerSubscriptionUpdatedEvent} CustomerSubscriptionUpdatedEvent
 */


const { refPath, usersRef } = require("../../Shared/shared.js");
const { createLicence, licencesRef, isBillerLevel, updateLicenceTier, updateLicenceSeats, suspendLicence, specialOfferRef, deleteLicence } = require("../shared.js");
const { Auth } = require('../../firebase.js');
const { RTDBLock } = require("../../rtdb-lock.js");
let { debug, warn } = require("firebase-functions/logger");
const { FirebaseAuthError } = require("firebase-admin/auth");


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
const LOCK_TIMEOUT = 60000; // 60 seconds

if (process.env["TEST"]) {
    debug = console.log;
}

/**
 * @return {Stripe} returns a stripe instance using the test or live API key.
 */
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

    /**
     * @type {string} the stripe subscription ID
     */
    subscriptionID = null;

    constructor(subscriptionObject) {
        this.object = subscriptionObject;
        this.item = subscriptionObject?.items?.data[0];
        this.seats = this.item?.quantity ?? 0;
        this.status = subscriptionObject.status;
        this.customer = subscriptionObject.customer;
        this.subscriptionID = subscriptionObject.id;
    }

    /**
     * Checks if the licence ID in the subscription matches the licence ID in firebase.
     * @returns {Promise<boolean>} 
     */
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

    /**
     * Updates the state of the licence in firebase, 
     * suspending or unsuspending it depending on the subscription status.
     * @param {string} id the event id of the stripe webhook event that triggered this update.
     * @returns {Promise<void>}
     */
    async updateLicence(id) {
        const {isLicenceIDValid, licenceMatched, licenceID, tierID, seats, isActive} = this;
        if (isLicenceIDValid && licenceMatched) {

            // Suspend or unsuspend the licence depending on the subscription status
            debug(`STRIPE: (${id}) ${isActive ? "Unsuspending" : "Suspending"} licence ${licenceID}...`);
            await suspendLicence(licenceID, !isActive);
            
            // If the licence is unsuspended then ensure that the
            // licence has the same tier and number of seats as 
            // specified by the subsubscription.
            if (isActive) {
                debug(`STRIPE:  (${id}) Updating licence ${licenceID} with tier ${tierID} and seats ${seats}.`);
                await updateLicenceSeats(licenceID, seats);
                await updateLicenceTier(licenceID, tierID);
            }
        }
    }



    /**
     * @param {import("stripe").Stripe} stripe the stripe instance to use.
     * @param {boolean} isTest whether to create a live or test licence.
     * @returns {Promise<boolean>} creates a new licence in firebase if one does not exist for the subscription.
     */
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
        } else if (await this.checkLicenceExists()) {
            debug(`STRIPE: licence already exists for customer ${this.customer} with id ${this.licenceID}.`);
        }

        return lid != null;
    }

    /**
     * @returns {Promise<void>} retrieves the licence name from the stripe checkout session custom fields.
     */
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
            warn("STRIPE: Error retreiving licence name.", e)
        }

        this.licenceName = name;
    }

    /**
     * @returns {Promise<void>} retrieves the tier ID from the price metadata.
     */
    async getTier() {
        let tierID = await refPath("licences-settings", ["price-to-tier", this.item?.price?.id, "tierID"]).get()
        this.tierID = tierID.val() || 0;
    }

    /**
     * @returns {Promise<void>} retrieves the licence ID and creator UID from the stripe customer metadata.
     */
    async getCustomerInfo(stripe) {
        let {metadata} = await stripe.customers.retrieve(this.customer);
        let {licenceID, creatorUID} = metadata;
        this.licenceID = licenceID;
        this.creatorUID = creatorUID;
    }


    /**
     * Updates the subscription details from stripe.
     * @param {import("stripe").Stripe} stripe the stripe instance to use.
     */
    async refresh(stripe) {
        const subscription = await stripe.subscriptions.retrieve(this.subscriptionID);
        this.object = subscription;
        this.item = subscription?.items?.data[0];
        this.seats = this.item?.quantity ?? 0;
        this.status = subscription.status;
        await this.getTier();
    }


    /**
     * @returns {string} a string representation of the subscription details.
     */
    toString() {
        return `${this.licenceName}[${this.isActive ? "Active" : "Inactive"}]\n\tstatus: ${this.status}\n\ttierID: ${this.tierID}\n\tseats: ${this.seats}\n\tlicenceID: ${this.licenceID}\n\tcreatorUID: ${this.creatorUID}`;
    }

    /**
     * @returns {boolean} whether the licence ID is valid or not.
     */
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

    /**
     * @param {SubscriptionObject} subscriptionObject the stripe subscription object to get details for.
     * @param {import("stripe").Stripe} stripe the stripe instance to use.
     */
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

/**
 * Checks if the user owns a licence.
 * @param {string} creatorUID the firebase UID of the user to check.
 * @returns {Promise<boolean>} returns a promise that resolves to true if the user owns a licence, false otherwise.
 */
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
        let trialDays = trialPeriod || product.trialPeriod;
        if (typeof trialDays === "number" && trialDays > 0) {
            trialDays = Math.ceil(trialDays);
            if (product.forceTrial || !(await ownsLicence(creatorUID))) {
                subscription_data.trial_period_days = trialDays;
            }
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

    if (!isNonEmptyString(productID)) {
        throw new Error("A product ID is required.");
    }

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
        token = "SPO" + token + Math.random().toString(36).substring(2, 8).toUpperCase() + (isTest ? "T" : "L");
        await specialOfferRef(token).set(offer);
    }

    return {token, errors};
}

/** Called when a subscription event is triggered by stripe webhooks.
 * @param {CustomerSubscriptionCreatedEvent | CustomerSubscriptionDeletedEvent | CustomerSubscriptionUpdatedEvent} event
 * 
 */
async function onSubscriptionEvent(event, isTest) {
    const id = event.id;
    const subscription = event.data.object;
    const mode = isTest ? "TEST" : "LIVE";
    const stripe = getStripe(mode);

    const lock = new RTDBLock(
        "stripe-subscriptions/" + subscription.id + mode, {
            acquireTimeoutMs: LOCK_TIMEOUT, 
            leaseMs: LOCK_TIMEOUT
    });
    lock.id = id.slice(-5)
    
    const details = await SubscriptionDetails.get(subscription, stripe);
    debug(`STRIPE: (${id}) Subscription event received:\n`, details);
    
    // If no licence ID was parsed then create a new licence.
    await lock.acquire();

    try {
        if (!(await details.checkLicenceExists())) {
            try {
                if (await details.createLicence(stripe, isTest)) {
                    // await sendLicenceCreationEmail(details.email, details.creatorUID);
                    debug(`STRIPE: (${id}) Successfully created licence with ID ${details.licenceID} for user with UID: ${details.creatorUID}`);
                } else {
                    debug(`STRIPE: (${id}) creation failed likely due to a creation already occuring.`)
                }
            } catch (e) {
                warn(`STRIPE: (${id}) Error creating licence.`, e instanceof FirebaseAuthError ? "Invalid user uid." : e);
                throw e;
            }
        }
        // Ensure the subscription state is up to date and update the licence accordingly.
        await details.refresh(stripe);
        await details.updateLicence(id);
    } finally {
        await lock.release();
    }
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
        warn("STRIPE: Error parsing webhook.", error)
        return res.sendStatus(400);
    }

    debug(`STRIPE: event(${event.id}):\n\tcreated: ${event.created}\n\ttype: ${event.type}\n\tobject: ${event.data.object.object}\n\tcustomer: ${event.data.object.customer}\n\n`);

    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                await onSubscriptionEvent(event, isTest);
                break;
            default:
                break;
        }
        return res.sendStatus(200);
    } catch (e) {
        warn(`STRIPE: (${event.id}) Error processing webhook event.`, e);
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


async function removeSubscriptionAndLicence(licenceID) {
    let isTest = (await licencesRef(licenceID, "isTest").get()).val();
    let customer = (await licencesRef(licenceID, "customerID").get()).val();
    const stripe = getStripe(isTest ? "TEST" : "LIVE");
    if (isNonEmptyString(customer)) {
       const deleted = await stripe.customers.del(customer);
    }

    await deleteLicence(licenceID);
}


module.exports = {
    webhookHandler,
    createSubscriptionCheckout,
    createSpecialOffer,
    createBillingPortal,
    onSubscriptionEvent,
    ownsLicence,
    removeSubscriptionAndLicence,
}
