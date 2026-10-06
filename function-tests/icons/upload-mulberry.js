const { fstore } = require("../../functions/firebase");
const database = require("../data/mulberry/db.json");
const urls = require("../data/mulberry/urls.json");
const fs = require("fs");
const symbols = fstore.collection("symbols");
const newDB = {};

function getSymbolSize(symbol) {
    const svg = fs.readFileSync("./data/mulberry/syms/" + symbol + ".svg", "utf-8");
    const viewBoxMatch = svg.match(/viewBox="([\d\s\.]+)"/);
    if (viewBoxMatch) {
        const viewBoxValues = viewBoxMatch[1].split(" ").map(Number);
        return {
            width: Math.round(viewBoxValues[2]),
            height: Math.round(viewBoxValues[3])    
        };
    }
    return {
        width: 100,
        height: 100
    };
}

for (const id in database) {
    const newID = symbols.doc().id;
    const entry = database[id];
    const oldDefURL = entry.url;
    const size = getSymbolSize(oldDefURL);
    entry.width = size.width;
    entry.height = size.height;
    entry.url = urls[oldDefURL];
    for (const key in entry.variants) {
        entry.variants[key] = urls[entry.variants[key]];
    }
    newDB[newID] = entry;
}

fs.writeFileSync("../function-tests/data/mulberry/db-id.json", JSON.stringify(newDB, null, 2));