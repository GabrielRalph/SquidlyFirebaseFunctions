const { updateUserMetrics } = require("../../functions/Metrics/shared");


updateUserMetrics().then(() => {
    console.log("User metrics update completed successfully.");
}).catch(err => {
    console.error("User metrics update failed:", err);
}).finally(() => {
    console.log("User metrics update attempt completed.");
    process.exit(0);
});