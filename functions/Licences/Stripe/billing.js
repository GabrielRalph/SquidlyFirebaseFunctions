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

const { refPath, usersRef } = require("../../Shared/shared.js");
const { createLicence, licencesRef, isBillerLevel, updateLicenceTier, updateLicenceSeats, suspendLicence } = require("../shared.js");
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
            const session = sessionsList.data[0];
            let fields = session.custom_fields.filter(a => a.key == "organisation");
            if (fields.length > 0) {
                name = fields[0].text.value;
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
        "inclomplete": false,
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

/** Creates a subscription check out using stripe.
 * @param {import("./shared").UID} creatorUID
 * @param {string} productID
 * @param {string} priceIndex 
 * @param {number} quantity number of seats.
 * @param {string} return_url
 * @param {string} licenceID the id of licence creator wants to renew.
 * @param {boolean} isTest whether to use the test or live stripe API.
 * @param {boolean} isPublic whether this is a public call.
 * 
 * @return {Promise<{errors: string[], client_secret: string}>}
 */
async function createSubscriptionCheckout(creatorUID, productID, priceIndex, quantity, return_url, licenceID = "", isTest, isPublic) {
    let errors = [];
    let valid = true;
    let client_secret = null;

    let product = await refPath("licences-settings", ["tier-info", productID]).get();
    product = product.val();
    if (product === null) {
        errors.push(`Invalid product ID "${productID}".`);
        valid = false;
    } else if (!product.public && isPublic) {
        errors.push(`Product with ID "${productID}" is not public.`);
        valid = false;
    } else if (!(priceIndex in product.prices)) {
        errors.push(`Invalid price index "${priceIndex}" for product with ID "${productID}".`);
        valid = false;
    }

    let priceID = null;
    if (valid) {
        let price = product.prices[priceIndex];
        priceID = isTest ? price.testID : price.id;
    
        if (!isNonEmptyString(priceID)) {
            errors.push(`Invalid price ID "${priceID}" for price "${JSON.stringify(price)}".`);
            valid = false;
        }
    
        if (typeof quantity !== "number" || quantity <= 0 || quantity > MAX_USER_SEATS) {
            quantity = 1;
        }
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
        let token = await Auth.getUser(creatorUID); 
        let date = new Date();
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
        let subscription_data = await ownsLicence(creatorUID) ? {} : {trial_period_days: 7};
        let object = {
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
        }
        
    
        // renewing expired licence
        const session = await stripe.checkout.sessions.create(object);
        client_secret = session.client_secret;
    }
    
    return {errors, client_secret}
}


/** Called when a subscription event is triggered by stripe webhooks.
 * @param {Subscription} subscription
 * 
 */
async function onSubscriptionEvent(subscription, isTest) {
    const stripe = getStripe(isTest ? "TEST" : "LIVE");

    const details = await SubscriptionDetails.get(subscription, stripe);
    // details.log();

    // If no licence ID was parsed then create a new licence.
    if (!await details.checkLicenceExists(stripe)) {
        try {
            if (await details.createLicence(stripe, isTest)) {
                // await sendLicenceCreationEmail(details.email, details.creatorUID);
                debug(`STRIPE: Successfully created licence with ID ${details.licenceID} for user with UID: ${creatorUID}`);
            } else {
                debug(`STRIPE: creation failed likely due to a creation already occuring.`)
            }
        } catch (e) {
            if (e instanceof FirebaseAuthError) {
                e = "Invalid user uid."
            } else {
                e = e + "";
            }
            valid = false;
            debug("STRIPE: Error creating licence.", e)
        }
    }

    await details.updateLicence();
}

async function webhookHandler(req, res, isTest) {
    const stripe = getStripe(isTest ? "TEST" : "LIVE");
    const SIGNING_SECRET = process.env[`STRIPE_SIGNING_SECRET_${isTest ? "TEST" : "LIVE"}`];
    let signature = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            SIGNING_SECRET
        );
        debug(`STRIPE: event:\n\ttype: ${event.type}\n\tobject: ${event.data.object.object}\n\tcustomer: ${event.data.object.customer}\n\n`);
        res.sendStatus(200);
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                try {
                    await onSubscriptionEvent(event.data.object, isTest);
                } catch (e) {
                    debug("STRIPE: Error on subscription call.", e);
                }
                break;
        }
    } catch (error) {
        debug("STRIPE: Error parsing webhook.", error)
        res.sendStatus(400);
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
    webhookHandler,
    createSubscriptionCheckout,
    createBillingPortal,
    onSubscriptionEvent,
    ownsLicence
}
