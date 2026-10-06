const { db, Auth } = require("../../functions/firebase");

function table2string(table, sep = " | ", headerSep = '-', linestart = "\t") {
    let keys = Object.keys(table[0] || {});
    let colWidths = keys.map(k => Math.max(...table.map(row => (row[k] ? row[k].toString().length : 0)), k.length));
    let keysPad = keys.map((k, i) => k.padEnd(colWidths[i], ' '));
    let rowsPad = table.map(row => keys.map((k, i) => {
        let cell = row[k] ? row[k].toString() : '';
        return cell.padEnd(colWidths[i], ' ');
    }));
    let lines = [
        keysPad.join(sep),
        headerSep.repeat(colWidths.reduce((a, b) => a + b, 0) + sep.length * (colWidths.length - 1)),
        ...rowsPad.map(r => r.join(sep))
    ];
    return linestart + lines.join(`\n${linestart}` + linestart);
}

async function removeDeletedUsers() {
    let users = (await db.ref("users").get() ).val() || {};
    let checkForAuth = await Promise.all(Object.keys(users).map(async uid => {
        try {
            let userRecord = await Auth.getUser(uid);
            if (!userRecord) {
                throw new Error("No user with that UID exists.")
            }
            return false;
        } catch (e) {
            return true;
        }
    }));

    let usersToDelete = Object.keys(users).filter((uid, i) => checkForAuth[i]);

    if (usersToDelete.length > 0) {
        let userStr =table2string(usersToDelete.map(uid => {
            let userData = users[uid].info || {};
            let name = (userData.displayName || (userData.firstName + " " + userData.lastName)).trim() || "NA";
            return {name, email: userData.email || "No Email", uid}
        }));
        // prompt user to confirm deletion
        const inquirer = require('inquirer');
        let { confirm } = await inquirer.default.prompt([{
            type: "confirm",
            name: "confirm",
            message: `Are you sure you want to delete users:\n\t${userStr}\nThis action cannot be undone.`,
            default: false,
        }]);
        if (confirm) {
            await Promise.all(usersToDelete.map(async uid => {
                await db.ref(`users/${uid}`).set(null);
                console.log(`Deleted user with UID: ${uid}`);
            }));
        }
    } else {
        console.log("No deleted users to remove.");
    }
}
removeDeletedUsers().then(() => {
    console.log("Success.");
}).catch(err => {
    console.error("Failed.\n\n", err);
}).finally(() => {
    process.exit(0);
});