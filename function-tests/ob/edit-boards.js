const { fstore, sb } = require("../../functions/firebase");
const { OBBoard, OBAction } = require("../../functions/OBBoards/openboard");
const { BOARD_COLLECTION, OBFileMetadata, uploadBoardSetToStorage } = require("../../functions/OBBoards/shared");
async function getBoards(user, rootPath, download) {
    const boardsRef = fstore.collection(BOARD_COLLECTION);
    const snap = await boardsRef
        .where("owner", "==", user)  
        .where("path", ">=", rootPath)
        .where("path", "<=", rootPath + "\uf8ff")
        .get();

    
    const metadata = Object.fromEntries(
        snap.docs.map(doc => [doc.id, OBFileMetadata.make(doc.data())])
    );
    const boards = {}
    if (download) {
        await Promise.all(Object.keys(metadata).map(async id => {
            const file1 = sb.file(`boards/${id}`);
            const [json] = await file1.download()
            const board = OBBoard.make(JSON.parse(json.toString()));
            boards[id] = board;
        }))
    }

    return {boards, metadata};
}

async function updateBoards(user, rootPath, updateMethod) {
    console.log(`Editing boards under path: ${rootPath}`)
    const { boards, metadata } = await getBoards(user, rootPath, true);
    console.log(`\tFound ${Object.keys(boards).length} boards to potentially update.`);

    const updatedBoards = {}; 
    const updatedMetadata = {}; 

    await Promise.all(Object.keys(boards).map(async key => {
        const board = boards[key];
        const meta = metadata[key];
        const updated = await updateMethod(board, meta, key);
        if (updated) {
            updatedBoards[key] = board;
            updatedMetadata[key] = meta;
            console.log(`\tUpdated board: ${meta.path}`);
        }
    }));
   
    await uploadBoardSetToStorage(updatedMetadata, updatedBoards);
}


updateBoards(
    "b74L3X6ChOPe5lmbGMpg9jVfRrb2", 
    "Proloquo\\Proloquo CWB", 
    /** @param {OBBoard} board
     *  @param {OBFileMetadata} meta
     *  @param {string} key
     */
    async (board, meta, key) => {
        meta.owner = "squidly"
        let path = meta.path.split("\\");
        path.slice(1);
        meta.path = path.join("\\");
        return true;
    }
).then(() => {
    console.log("Update process completed.");
}).catch(err => {
    console.error("Error updating boards:", err);
});