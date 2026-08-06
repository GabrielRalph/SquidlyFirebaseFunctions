const { fstore, sb, FieldValue } = require("../firebase.js");
const { onCall } = require("firebase-functions/https");
const { validateData, isNonNullObject } = require("../Shared/shared.js");
const { OBBoard } = require("./openboard.js");
const fflate = require("fflate");
const { debug } = require("firebase-functions/logger");

const BOARD_COLLECTION = "boards";
const DRAFT_COLLECTION = "draft-boards";

async function encodeBoard(boardJSON) {
    const input = fflate.strToU8(JSON.stringify(boardJSON));
    const compressed = await new Promise((resolve, reject) => {
        fflate.gzip(input, {}, (err, data) => {
            if (err) return reject(err);
            else resolve(data);
        });
    });
    return compressed;
}

async function isSquidlyAdmin(uid) {
    const docSS = await fstore.collection("squidly-board-admins").doc(uid).get()
    return docSS.exists && docSS.data().approved === true;
}

async function isAuthenticated({auth}) {
    if (!isNonNullObject(auth) || auth.uid === undefined || auth.uid === null || auth.uid === "") {
        return "User not authenticated";
    }
}

async function parseBoardObject(data) {
    if (isNonNullObject(data) && isNonNullObject(data.board)) { 
        try {
            const board = OBBoard.make(data.board);
            const binary = await encodeBoard(board);
            if (!binary) {
                return "Failed to compress board data.";
            } else {
                data.encoded = binary;
            }
        } catch (e) {
            return "Invalid board data provided." + e.message;
        }
    } else {
        return "No board data provided.";
    }
}

async function isOwner(uid, boardID) {
    const docSS = await fstore.collection(BOARD_COLLECTION).doc(boardID).get();
    if (!docSS.exists) {
        return [false, null];
    }
    const data = docSS.data();
    if (data.owner === uid) {
        return [true, data];
    } else if (data.owner === "squidly") {
        return [await isSquidlyAdmin(uid), data]
    } else {
        return [false, data]
    }
}

async function uploadToStorage(boardID, encoded) {
    const file = sb.file(`boards/${boardID}`);
    await file.save(encoded, {metadata: {
        contentType: "application/json",
        contentEncoding: "gzip"
    }});
}

const UPDATE_BOARD_VALIDATORS = [
    isAuthenticated,
    ({data}) => {if (!isNonNullObject(data)) { return "No data provided." }},
    ({data: {boardID}}) => {if (!boardID || typeof boardID !== "string") { return "No board ID provided." }},
    async ({data, auth: {uid}}) => {
        const [owner, metadata] = await isOwner(uid, data.boardID);
        data.metadata = metadata;
        if (!owner) {
            return "User does not have permission to update this board.";
        } 
    },
    async ({data}) => {
        const draft = fstore.collection(DRAFT_COLLECTION).doc(data.boardID);
        const draftDoc = await draft.get();
        if (!draftDoc.exists) {
            return "No board data exists for this board ID.";
        }
        let boardJSON = draftDoc.data().board;

        try {
            data.board = JSON.parse(boardJSON);
        } catch (e) {
            return "Failed to deserialize board data: " + e.message;
        }
        
        if (isNonNullObject(data.board)) {
            data.board.id = data.boardID;
        } else {
            return "Draft board data is invalid.";
        }
    },
    async ({data}) => await parseBoardObject(data),

    async ({data: {boardID, encoded}}) => {
        try {
            await uploadToStorage(boardID, encoded);
        } catch (e) {
            return "Failed to upload board data to storage: " + e.message;
        }
    },

    async ({data: {boardID}}) => {
        try {
            await fstore.collection(BOARD_COLLECTION).doc(boardID).update({
                updatedAt: FieldValue.serverTimestamp()
            });

            await fstore.collection(DRAFT_COLLECTION).doc(boardID).delete();
        } catch (e) {
            return "Failed to update board metadata in Firestore: " + e.message;
        }
    }
]

module.exports = {
    steps: UPDATE_BOARD_VALIDATORS,
    update: onCall({
        region: "australia-southeast1"
    }, async (res) => {
        let result = {errors: [], success: false};
        if (await validateData(res, UPDATE_BOARD_VALIDATORS, result.errors)) {
            result.success = true;
        }
        return result;
    })
}