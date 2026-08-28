const { fstore, FieldValue, FileStatus } = require("../firebase.js");
const { onCall } = require("firebase-functions/https");
const { validateData, isNonNullObject } = require("../Shared/shared.js");
const { debug } = require("firebase-functions/logger");
const { 
    BOARD_COLLECTION, DRAFT_COLLECTION, 
    encodeBoard, isSquidlyAdmin, isAuthenticated, 
    parseBoardObject, isOwner, uploadBoardToStorage 
} = require("./shared.js");


const UPDATE_BOARD_VALIDATORS = [
    isAuthenticated,
    ({data}) => {
        if  (!isNonNullObject(data)) {
             return "No data provided." 
        } else {
            data.status = new FileStatus(data.auth.uid, data.boardID, {
                step: 0,
            })
        }
    },
    
    ({data: {boardID}}) => {if (!boardID || typeof boardID !== "string") { return "No board ID provided." }},
    async ({data, auth: {uid}}) => {
        const [owner, metadata] = await isOwner(uid, data.boardID);
        data.metadata = metadata;
        if (!owner) {
            return "User does not have permission to update this board.";
        } else {
            await data.status.update({step: 2})
        }
    },
    async ({data}) => {
        const draft = fstore.collection(DRAFT_COLLECTION).doc(data.boardID);
        const draftDoc = await draft.get();
        if (!draftDoc.exists) {
            return "No board data exists for this board ID.";
        } else {
            await data.status.update({step: 3})
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

    async ({data: {status, boardID, encoded}}) => {
        try {
            await status.update({step: 4})
            await uploadBoardToStorage(boardID, encoded);
        } catch (e) {
            return "Failed to upload board data to storage: " + e.message;
        }
    },

    async ({data: {boardID}}) => {
        try {
            await status.update({step: 5})
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
    }),
}