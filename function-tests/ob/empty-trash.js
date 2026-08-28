
const { fstore } = require("../../functions/firebase");
const { deleteBoardPermanently, BOARD_COLLECTION } = require("../../functions/OBBoards/shared");

async function emptyTrash() {
    const snap = await fstore.collection(BOARD_COLLECTION)
                        .where("deletedAt", "!=", false)
                        .get()
    console.log(`Found ${snap.docs.length} boards marked as deleted.`);
    await Promise.all(
        snap.docs.map(doc => deleteBoardPermanently(doc.id))
    );
    console.log(`Deleted ${snap.docs.length} boards from storage.`);
}

emptyTrash().then(() => {
    console.log("Finished emptying trash.");
}).catch(err => {
    console.error(`Error emptying trash: ${err.message}`);
});