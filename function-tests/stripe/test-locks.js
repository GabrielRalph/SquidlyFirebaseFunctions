const { RTDBLock } = require("../../functions/rtdb-lock");
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function p(iDelay, i) {
    await delay(iDelay);
    let lock = new RTDBLock("test-lock");
    lock.id = i;
    console.log(`p${i}: acquiring lock`);
    await lock.acquire();
    console.log(`p${i}: acquired lock`);
    await delay(5000);
    console.log(`p${i}: releasing lock`);
    await lock.release();
    console.log(`p${i}: done`);
}
async function testLocks() {
    await Promise.all( [
        p(100, 1),
        p(200, 2),
        p(300, 3),
    ]);
    console.log("All done");
}

testLocks().then(() => {
    console.log("Test complete");
}).catch(err => {
    console.error("Test failed:", err);
});

