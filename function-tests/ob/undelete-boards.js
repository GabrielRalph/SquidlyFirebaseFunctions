const { fstore , FieldValue} = require("../../functions/firebase");

async function undelete() {
    const docs = await fstore.collection("boards").get()
    let boards = []
    for (let doc of docs.docs) {
        let board = doc.data();
        if ("hasThumbnail" in board) {
            boards.push(doc.ref.update({
                hasThumbnail: FieldValue.delete(),
                thumbnail: board.hasThumbnail
            }))
        }   
    }
    await Promise.all(boards);
}

undelete().then(() => {
    console.log("done")
})