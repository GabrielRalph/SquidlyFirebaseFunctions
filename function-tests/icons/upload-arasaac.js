const { fstore } = require("../../functions/firebase");
const fs = require("fs");

const arasaac = require("../data/arasaac-id.json");

const symbols = fstore.collection("symbols");

async function upload() {
    let proms = []
    for (const id in arasaac.symbols) {
        const s = arasaac.symbols[id]
        s.symbol_set = s.icon_set;
        delete s.icon_set
        proms.push(symbols.doc(id).set(arasaac.symbols[id]));
        if (proms.length > 500) {
            await Promise.all(proms);
            console.log(`Uploaded ${proms.length} symbols`);
            proms = [];
        }
    }
}

upload().then(() => {
    console.log("Upload complete");
}).catch(err => {
    console.error("Upload failed", err);
});