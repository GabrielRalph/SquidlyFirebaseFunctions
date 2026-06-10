const { fstore, sb, db } = require("../firebase.js");
const { getEmbedding, startTimer, docs2iconInfo, unique } = require("./vectorEmbedd");
const { FieldValue } = require('firebase-admin/firestore');
const sharp = require('sharp');
const fs = require('fs');
const { getDownloadURL } = require("firebase-admin/storage");
const phash = require("sharp-phash");

/**
 * Converts image at url to png base64 encoded string
 * @param {Buffer} dataBuffer
 */
async function img2png_base64(dataBuffer) {
    let imgbuff = await sharp(dataBuffer)
    .png()
    .toBuffer();

    return imgbuff.toString('base64');
}

function hashToHex(hash) {
    let hex = "";
    for (let i = 0; i < hash.length; i += 4) {
        const chunk = hash.slice(i, i + 4);
        const hexDigit = parseInt(chunk, 2).toString(16);
        hex += hexDigit;
    }
    return hex;
}


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


const uploadIconSteps = [
    async (scope) => {
        const {srcFilename} = scope;
        const imageData = fs.readFileSync(srcFilename);
        scope.imageData = imageData;
        const hash = await phash(imageData);
        scope.hash = hashToHex(hash);
        scope.base64 = await img2png_base64(imageData);
        const format = (await sharp(imageData).metadata()).format;
        scope.type = format in FORMAT_2_MIMETYPE ? FORMAT_2_MIMETYPE[format] : null;
        if (!scope.base64 || !scope.type) {
            throw new Error("Error processing image");
        }
    },
    async (scope) => {
        let pred = await getEmbedding({"instances": [
            {"image": { "bytesBase64Encoded": scope.base64 } }
        ]});

        // get field vectorEmbedding
        scope.embedding = FieldValue.vector(pred.imageEmbedding);
        if (!scope.embedding) {
            throw new Error("No embedding returned from model");
        }
    },
    async (scope) => {
        // Create a new document in Firestore with the download URL and vector embedding
        scope.docRef = await fstore.collection(scope.isTest ? 'icons-test' : 'icons').add({
            embedding: scope.embedding,
            name: scope.name,
            type: MIMETYPE_KEY[scope.type],
            public: !!scope.public,
            iconSetPath: scope.storagePath,
            phash: scope.hash,
        });
    },
    async (scope) => {
        // Upload the icon to storage and get the download URL
        const storageRef = sb.file(`icons/icon-sets/${scope.storagePath}`);
        await storageRef.save(scope.imageData, {
            metadata: {
                contentType: scope.type,
                documentID: scope.docRef.id,
            },
            contentType: scope.type,
        });
        scope.downloadURL = await getDownloadURL(storageRef);
    },
    async (scope) => {
        // Create a new document in Firestore with the download URL and vector embedding
        await scope.docRef.update({
            url: scope.downloadURL,
        });
    }   
]
/**
 * Uploads an icon 
 */
async function uploadIcon(srcFilename, ops = {
    name: null,
    public: false,
    storagePath: null,
    uid: null,
}) {
    let scope = {
        srcFilename,
        ...ops,
    }
    let i = 0;
    for (let step of uploadIconSteps) {
        try {
            await step(scope);
        } catch (err) {
            console.error(`Error in uploadIcon step ${i}:`, err);
            break;
        }
        i++;
    }

    if (i === uploadIconSteps.length) {
        // console.log("Icon uploaded successfully with ID:", scope.docRef.id);
        return scope.docRef.id;
    } else {
        return null;
    }
}

module.exports = {
    uploadIcon,
}