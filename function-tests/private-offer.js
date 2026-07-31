const {db, Auth} = require('../functions/firebase.js');
const inquirer =  require('inquirer');
const { syncStripeProducts } = require('../functions/Licences/Stripe/sync.js');
const { createSubscriptionCheckout, createSpecialOffer } = require('../functions/Licences/Stripe/billing');

async function make() {
    await syncStripeProducts();

    let products = (await db.ref("licences-settings/tier-info").get()).val();

    let ids = Object.keys(products);
    let prices = ids.flatMap(id => {
        let product = products[id];
        return product.prices.map((p, i) => {return {value: [product, i], name: `${product.displayName} - ${p.name}: ${p.amount.toFixed(2)} ${p.currency.toUpperCase()} / user / ${p.interval}`}});
    })
    
    let res = await inquirer.default.prompt([{
        type: "list",   
        name: "product",
        message: "Select a product to create a special offer for:",
        choices: prices
    }])

    const [product, priceIndex] = res.product;

    res = await inquirer.default.prompt([{
        type: "confirm",
        name: "isTest",
        message: "Is this a test offer?",
        default: true,
    }]);
    
    let {errors, client_secret} = await createSpecialOffer({
        productID: product.id, 
        priceIndex, 
        quantity: 1, 
        isTest: res.isTest,
    }, 30);

    if (errors.length > 0) {
        console.error("Failed to create special offer:", errors);
        return;
    } else {
        console.log("\nSuccessfully created special offer for user:", uid);
        console.log("Checkout link: https://squidly.com.au/Console/#licences-page?clientSecret="+client_secret);
    }
}

createSpecialOffer().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});