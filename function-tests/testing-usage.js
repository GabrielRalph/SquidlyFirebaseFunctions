const { Usage } = require("../functions/usage.js");
const uid = "s6NoggwP78XlE7LtWnu5Q38VbF32";

function logUsageStats(stats) {
    const keys = ["used", "available", "remaining"];
    let str = Object.keys(stats.used).map(key => {
        return `${key.padEnd(15)} | ${stats.used[key].toString().padStart(10)} | ${stats.available[key].toString().padStart(10)} | ${stats.remaining[key].toString().padStart(10)}`;
    }).join("\n");
    console.log(`\nUSAGE STATS:\n${"| ".padStart(18)}${keys.map(k => k.padEnd(10)).join(" | ")}\n${str}`);
}
async function test() {
    const usageInstance = new Usage();
    await usageInstance.initialise();
    let usage =await usageInstance.getUserUsage(uid);
    logUsageStats(usage);

    await usageInstance.updateUserUsage(uid, {
        storage: -12
    });

    usage = await usageInstance.getUserUsage(uid);
    console.log("\n\nAFTER");
    logUsageStats(usage);
}
test().then(() => {
    console.log("Test completed successfully.");
    
}).catch(err => {
    console.error("Test failed:", err);
}).finally(() => {
    process.exit(0);
});