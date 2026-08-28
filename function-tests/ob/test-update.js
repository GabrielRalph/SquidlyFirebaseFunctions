const { fstore, sb } = require("../../functions/firebase");
const { steps } = require("../../functions/OBBoards/ob-boards");
const { validateData } = require("../../functions/Shared/shared");
// const fflate = require("../functions/node_modules/fflate");

const BOARD_COLLECTION = "boards";
const DRAFT_COLLECTION = "draft-boards";

const id = `qzQKtOIDBgtaOxRULvZB`;
async function test() {
    let errors = []
    await validateData({
        data: {
            boardID: id,
        },
        auth: {
            uid: "s6NoggwP78XlE7LtWnu5Q38VbF32"
        }
    }, steps, errors);
    console.log(errors);
}

test().then(() => { 
    console.log("Test complete");
    process.exit(0);
}).catch(err => {
    console.error("Test failed:", err);
});