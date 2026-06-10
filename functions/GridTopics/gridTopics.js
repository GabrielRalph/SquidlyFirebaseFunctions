const { onValueWritten } = require("firebase-functions/database");
const { Usage } = require("../usage.js");
module.exports = {
    search: require("./gridTopics-search.js").search,
    onWrite: onValueWritten({
        ref: "grid-topics/{tid}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1"
    }, async ({data: {before, after}}) => {
        // On deletion of a grid topic, update the user's usage
        if (before.exists() && !after.exists()) {
            let ownerUID = before.val().owner;
            await Usage.updateUserUsage(ownerUID, {
                grids: -1,
                files: -1
            });

        // On creation of a grid topic, update the user's usage
        } else if (after.exists() && !before.exists()) {
            let ownerUID = after.val().owner;
            let usage = new Usage();
            await usage.initialise();
            let stats = await usage.getUserUsage(ownerUID);
            await usage.updateUserUsage(ownerUID, {
                grids: 1,
                files: 1
            });

            // Delete the grid topic if the user has reached their limit
            if (stats.used.files >= stats.available.files) {
                await after.ref.set(null); 
            } 
        }
    })
}