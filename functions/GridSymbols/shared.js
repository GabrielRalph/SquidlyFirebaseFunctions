const phash = require("sharp-phash");
const sharp = require('sharp');

const EMBEDDING_IMAGE_SIZE = 300;
const MIMETYPE_KEY = {
    "image/bmp": "bmp",
    "image/emf": "emf",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/heic": "heic",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "png": "png",
    "jpeg": "jpeg",
    "jpg": "jpeg",
    "bmp": "bmp",
    "emf": "emf",
    "heic": "heic",
    "svg": "svg",
    "webp": "webp",
}
const FORMAT_2_MIMETYPE = {
    "bmp": "image/bmp",
    "emf": "image/emf",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "heic": "image/heic",
    "png": "image/png",
    "svg": "image/svg+xml",
    "webp": "image/webp",
}


/**
 * Converts image at url to png base64 encoded string
 * @param {Buffer} dataBuffer
 */
async function img2png(dataBuffer) {
    const imgbuff = await sharp(dataBuffer)
    .resize(EMBEDDING_IMAGE_SIZE)
    .png()
    .toBuffer();

    return imgbuff;
}

async function getPhashReadyBuffer(imageBuffer) {
    const backgrounds = [
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 },
    ];

    let best = null;
    for (const background of backgrounds) {
        const candidate = await sharp(imageBuffer)
        .flatten({ background })
        .png()
        .toBuffer();

        const stats = await sharp(candidate).stats();
        const score = stats.channels[0]?.stdev || 0;

        if (!best || score > best.score) {
            best = { score, buffer: candidate };
        }
    }

    return best ? best.buffer : imageBuffer;
}

async function phashHex(imageBuffer) {
    const phashReadyBuffer = await getPhashReadyBuffer(imageBuffer);
    const hash = await phash(phashReadyBuffer);
    let hex = "";
    for (let i = 0; i < hash.length; i += 4) {
        const chunk = hash.slice(i, i + 4);
        const hexDigit = parseInt(chunk, 2).toString(16);
        hex += hexDigit;
    }
    return hex;
}

async function getType(imageData) {
    const format = (await sharp(imageData).metadata()).format;
    const type = format in FORMAT_2_MIMETYPE ? FORMAT_2_MIMETYPE[format] : null;
    return type;
}

module.exports = {
    img2png,
    phashHex,
    getType,
    MIMETYPE_KEY,
    FORMAT_2_MIMETYPE
}