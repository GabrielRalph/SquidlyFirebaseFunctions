const { sb, getDownloadURL } = require("../../functions/firebase");
const { fflate } = require("../../functions/OBBoards/shared");
const name2ID = require("../data/mulberry/map.json");
const fs = require("fs");
const uploads = [];

for (const name in name2ID) {
    const id = name2ID[name];
    const file = `./data/mulberry/syms/${name}.svg`;
    const data = fs.readFileSync(file);
    uploads.push({ name, id, data });
}


/**
 * @param {Buffer<ArrayBufferLike>} svgData
 */
async function compSvg(svgData) {
    const input = fflate.strToU8(svgData.toString());
    const compressed = await new Promise((resolve, reject) => {
        fflate.gzip(input, {}, (err, data) => {
            if (err) return reject(err);
            else resolve(data);
        });
    });
    return compressed;
}


async function uploadIcons(u) {
    const map = {}
    let batch = [];
    for (const {name, id, data} of u) {
        let uploadPromise = (async () => {
            const file = sb.file(`symbols/sets/MULBERRY/${id}`)
            const compressed = await compSvg(data);
            await file.save(compressed, {metadata: {
                contentType: "image/svg+xml",
                contentEncoding: "gzip"
            }});
            const url = await getDownloadURL(file);
            map[id] = url;
            map[name] = url;
        })();
        batch.push(uploadPromise);
        if (batch.length >= 100) {
            await Promise.all(batch);
            batch = [];
            console.log("Batch of 100 uploads completed.");
        }
    }

    await Promise.all(batch);
    fs.writeFileSync("./data/mulberry/urls.json", JSON.stringify(map, null, 2));
   
}

uploadIcons(uploads).then(() => {
    console.log("Upload complete.");
}).catch(err => {
    console.error("Upload failed:", err);
});