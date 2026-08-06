const { fstore, FieldValue, sb } = require("../functions/firebase");

const P2K_REPLACERS = [
    [/\//g, "~0~"],
    [/\./g, "~1~"],
    [/#/g,  "~2~"],
    [/\$/g, "~3~"],
    [/\[/g, "~4~"],
    [/\]/g, "~5~"],
]

const K2P_REPLACES = [
    [/~0~/g, "/"],
    [/~1~/g, "."],
    [/~2~/g, "#"],
    [/~3~/g, "$"],
    [/~4~/g, "["],
    [/~5~/g, "]"],
]

function path2key(path) {
    if (/~\[0-5]+~/.test(path)) {
        throw new Error("File paths cannot contain the sequence ~[0-5]+~ as it is reserved for escaping special characters.");
    }
    for (const [regex, repl] of P2K_REPLACERS) {
        path = path.replace(regex, repl);
    }
    return path;
}

function key2path(key) {
    let path = key;
    for (const [reg, val] of K2P_REPLACES) {
        path = path.replace(reg, val);
    }
    return path;
}

function downloadBoard(boardID) {
    // Boards a strored as gziped JSON files in the storage bucket. The path is the boardID with special characters escaped.
    const file = sb.file(`boards/${boardID}`);
    return file.download().then(([buffer]) => {
        let json = buffer.toString("utf-8");
        return JSON.parse(json);
    });
}


async function normBoards() {
    let board = await downloadBoard("0RLShuFM53gjoE6cJGpj");
    // console.log("Board:", board);
    const c = fstore.collection("boards");
    const snapshot = await c.get();
    await Promise.all(snapshot.docs.map(async doc => {
        let data = doc.data();
        if (!data.path) {
        //     // await doc.ref.update({
        //     //     path: path2key(data.path),
        //     // });
        // } else {
            let data = await downloadBoard(doc.id);
            let setName = data.name;
            let path = "idk/" + setName;
            await doc.ref.update({
                path: path2key(path),
            });
        }
    }));
}

normBoards().then(() => {
    console.log("Done");
}).catch(err => {
    console.error("Failed:", err);
});