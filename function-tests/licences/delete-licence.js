const { suspendLicence, deleteLicence } = require("../../functions/Licences/shared");
const inquirer =  require('inquirer');
const { refPath } = require("../../functions/Shared/shared");
const { removeSubscriptionAndLicence } = require("../../functions/Licences/Stripe/billing");

async function del() {
    let licences = (await refPath("/licences", []).get()).val() || {};
    let licenceList = Object.keys(licences).map(lid => ({
        name: `${licences[lid].licenceName} ${licences[lid].disabled ? "(suspended)" : ""}`,
        value: lid,
    }));

    let { lid } = await inquirer.default.prompt([{
        type: "list",
        name: "lid",
        message: "Select the licence to delete:",
        choices: licenceList,
    }]);

    // ensure they are sure    
    let { confirm } = await inquirer.default.prompt([{
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to delete the licence "${licences[lid].licenceName}"? This action cannot be undone.`,
        default: false,
    }]);
    
    if (confirm) {
        
        await removeSubscriptionAndLicence(lid);
    }
}

del().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});