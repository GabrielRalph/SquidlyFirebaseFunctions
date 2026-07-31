const { fstore } = require("../functions/firebase");

async function undelete() {
    const docs = await fstore.collection("boards").where("deletedAt", "!=", false).get()
    let boards = []
    for (let doc of docs.docs) {
        let board = doc.data();
        if (!board.isDirectory) {
            boards.push(doc.ref.update({deletedAt: false}))
        }   
    }
    await Promise.all(boards);
}

undelete().then(() => {
    console.log("done")
})