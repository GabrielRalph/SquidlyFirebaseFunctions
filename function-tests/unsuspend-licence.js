const { suspendLicence } = require("../functions/Licences/shared");
const inquirer =  require('inquirer');
const { refPath } = require("../functions/Shared/shared");

async function unsuspendLicence() {
    let licences = (await refPath("/licences", []).get()).val() || {};
    let licenceList = Object.keys(licences).map(lid => ({
        name: `${licences[lid].licenceName} ${licences[lid].disabled ? "(suspended)" : ""}`,
        value: lid,
    }));

    let { lid } = await inquirer.default.prompt([{
        type: "list",
        name: "lid",
        message: "Select the licence to unsuspend:",
        choices: licenceList,
    }]);
    await suspendLicence(lid, false)
}

unsuspendLicence().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});