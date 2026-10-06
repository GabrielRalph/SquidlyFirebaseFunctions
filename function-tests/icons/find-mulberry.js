const fs = require("fs");
const crypto = require("crypto");
// const iconLibrary = require("../data/icons.json");

const mulberryIcons = require("../data/mulberry/mulberry-icons.json");
const mulberry2squidly = require("../data/mulberry/mulberry2squidly.json");
const squidlyIcons = require("../data/mulberry/my-squidly-svg-icons.json");


const { img2png } = require("../../functions/GridSymbols/shared.js");


let nMatched = Object.entries(mulberry2squidly).filter(([k,v]) => v!=null).length;
let total = Object.entries(mulberry2squidly).length;
console.log(`Matched ${nMatched} out of ${total} entries.`);

console.log(`Total my icons: ${Object.keys(squidlyIcons).length}`);
/**
 * Creates a unique hash for the SVG content.
 * @param {string} content - The SVG content to hash.
 * @returns {string} A unique hash for the SVG content.
 */
function hashSvgContent(content) {
    return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Converts an SVG content to a unique hash for its corresponding PNG representation.
 * @param {string} svg - The SVG content to convert and hash.
 * @returns {Promise<string>} A unique hash for the corresponding PNG representation.
 */
async function pngHash(svg) {
    const pngBuffer = await img2png(Buffer.from(svg), 64);
    return hashSvgContent(pngBuffer);
}

async function generateFileMap(svgDirectory = "./data/mulberry/EN-symbols", mapFile = "./data/mulberry/mulberry-icons.json") {
    // Get all SVG icons in the specified directory and create a map 
    // where each key is the first 100 characters of the SVG content.
    const svgFiles = fs.readdirSync(svgDirectory);
    const svgMap = {}

    await Promise.all(svgFiles.map(async file => {
        if (file.endsWith(".svg")) {
            const fname = file.replace(".svg", "");
            const content = fs.readFileSync(`${svgDirectory}/${file}`, "utf-8");
            const p = await pngHash(content);
            const svgHash = hashSvgContent(content);
            svgMap[fname] = {
                svgHash,
                pngHash: p,
            }
        }
    }));
    fs.writeFileSync(mapFile, JSON.stringify(svgMap, null, 2));
}

const pngHash2squidlyID = {};
for (const sID in squidlyIcons) {
    const pngHash = squidlyIcons[sID]?.pngHash;
    if (pngHash) {
        if (!(pngHash in pngHash2squidlyID)) {
            pngHash2squidlyID[pngHash] = []
        }
        pngHash2squidlyID[pngHash].push(sID);
    }
}
    

for (const fname in mulberry2squidly) {
    const squidlyID = mulberry2squidly[fname];
    
    if (!squidlyID) {
        const pngHash = mulberryIcons[fname]?.pngHash;
        if (pngHash in pngHash2squidlyID) {
            console.log(`Found matching squidly IDs for mulberry icon "${fname}":`, pngHash2squidlyID[pngHash]);
        }
    }
}