const { steps } = require("../functions/OBBoards/ob-boards");
const { validateData } = require("../functions/Shared/shared");


async function test() {
    let testReq = {
        data: {
            boardID: "L8Gj95ybSJXJkqkDTNtC"
        },
        auth: {
            uid: process.env.GABRIELS_UID,
        }
    }
    let errors= []
    if (await validateData(testReq, steps, errors)) {
        console.log("Result successful.");
    } else {
        console.error("Validation failed.", errors);
    }
}
test().then(() => {
    console.log("Test complete");
}).catch(err => {
    console.error("Test failed:", err);
});