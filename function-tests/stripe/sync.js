const { syncStripeProducts } = require("../../functions/Licences/Stripe/sync");



syncStripeProducts().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});