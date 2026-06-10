
const { createSubscriptionCheckout } = require("../functions/Licences/Stripe/billing");
const { syncStripeProducts } = require("../functions/Licences/Stripe/sync");


async function createSpecialOffer() {
    let res = await createSubscriptionCheckout("s6NoggwP78XlE7LtWnu5Q38VbF32", "prod_Sa1vvobJOi8LGQ", 0, 1, "http://127.0.0.1:5501/#licences-page",null, false, false);
    if (res.errors.length) {
        console.error("Errors occurred while creating the special offer:\n\t", res.errors.join("\n\t"));
        return;
    }
    console.log(`http://127.0.0.1:5501/#licences-page?${res.client_secret}`);
}


syncStripeProducts().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});