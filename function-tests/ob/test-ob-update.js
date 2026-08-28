const { fstore, sb } = require("../../functions/firebase");
const { steps } = require("../../functions/OBBoards/ob-boards");
const { validateData } = require("../../functions/Shared/shared");
// const fflate = require("../functions/node_modules/fflate");

const BOARD_COLLECTION = "boards";
const DRAFT_COLLECTION = "draft-boards";

// async function encodeBoard(boardJSON) {
//     const input = fflate.strToU8(JSON.stringify(boardJSON));
//     const compressed = await new Promise((resolve, reject) => {
//         fflate.gzip(input, {}, (err, data) => {
//             if (err) return reject(err);
//             else resolve(data);
//         });
//     });
//     return compressed;
// }

// async function decodeBoard(encoded) {
//     const decompressed = await new Promise((resolve, reject) => {
//         fflate.gunzip(encoded, {}, (err, data) => {
//             if (err) return reject(err);
//             else resolve(data);
//         });
//     });
//     return JSON.parse(fflate.strFromU8(decompressed));
// }


const id = `jIWSB9XWCQ8Fg79Z7Iky`
async function test() {
    // Re upload the board to storage and set the content type to application/json
    const path = `boards/${id}`;
    const file = sb.file(path);
    // const data = await file.download();

    //unzip the data
    // const board = await decodeBoard(data[0]);
    // console.log(board)

    await file.delete();

    // await file.save(data[0], {metadata: {
    //     contentType: "application/json",
    //     contentEncoding: "gzip"
    // }});

 
    console.log(`Set content type for ${path} to application/json`);


//    const boards = await fstore.collection("boards").where("owner", "==", "b74L3X6ChOPe5lmbGMpg9jVfRrb2").get();
//    console.log(boards.docs.length)
//    for (const doc of boards.docs) {
//        const data = doc.data();
//        const errors = validateData(data, steps);
//        if (data.deletedAt) {
//         //    console.log(`Board ${doc.id} ${data.path} has been deleted`);
//             doc.ref.update({
//                 deletedAt: false,
//             })
//        }
//    }
}

test().then(() => { 
    console.log("Test complete");
}).catch(err => {
    console.error("Test failed:", err);
});