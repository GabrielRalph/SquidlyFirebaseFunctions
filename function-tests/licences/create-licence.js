const {db, Auth} = require('../../functions/firebase.js');
const inquirer =  require('inquirer');
const { createLicence, suspendLicence } = require('../../functions/Licences/shared.js');

async function createSpecialOffer() {
    let products = (await db.ref("licences-settings/tier-info").get()).val();
    let ids = Object.keys(products);
    let prices = ids.flatMap(id => {
        let product = products[id];
        return product.prices.map((p, i) => {return {value: [product, i], name: `${product.displayName} - ${p.name}: ${p.amount.toFixed(2)} ${p.currency.toUpperCase()} / user / ${p.interval}`}});
    })
    
    let res = await inquirer.default.prompt([{
        type: "list",   
        name: "product",
        message: "Select a product to create a licence",
        choices: prices
    }])

    const [product, priceIdx] = res.product;
    let tier = product.tierID;

    let uid = null
    let token = null;
    try {
        res = await inquirer.default.prompt([{
            type: "input",
            name: "email",
            message: "What is the email of the user this offer is made out to?",
            default: null,
        }]);
        let email = res.email;

        token = await Auth.getUserByEmail(email);
        if (!token) {
            throw email;
        } else {
            uid = token.uid;
        }
    } catch (e) {
        uid = null;
        console.error(`Failed to find user with email: ${e}\nPlease make sure the user exists and has a verified email.`);
    }

    let resSeats = await inquirer.default.prompt([{
        type: "number",
        name: "seats",
        message: `How many seats should the licence have?`,
        default: 1,
        validate: (input) => {
            if (isNaN(input) || input < 1) {
                return "Please enter a valid number greater than 0.";
            }
            return true;
        }
    }]);
    let seats = resSeats.seats;

    let licenceNameRes = await inquirer.default.prompt([{
        type: "input",
        name: "licenceName",
        message: `What is the name of the licence?`,
        default: `${product.displayName} Licence`,
    }]);
    let licenceName = licenceNameRes.licenceName;


    let lid = await createLicence(
        token, 
        tier,
        seats,
        null,
        licenceName,
        null,
        true
    )
    await suspendLicence(lid, false)
    
}

createSpecialOffer().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});