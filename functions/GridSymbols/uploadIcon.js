const { fstore, sb, db } = require("../firebase.js");
const { getEmbedding, startTimer, docs2iconInfo, unique } = require("./vectorEmbedd");
const { FieldValue, DocumentReference } = require('firebase-admin/firestore');
const fs = require('fs');
const { getDownloadURL } = require("firebase-admin/storage");
const { img2png, phashHex, MIMETYPE_KEY, getType } = require("./shared.js");

const uploadIconSteps = [
    async (scope) => {
        const {srcFilename} = scope;
        const imageData = fs.readFileSync(srcFilename);
        scope.imageData = imageData;
        const pngBuffer = await img2png(imageData);
        scope.base64 = pngBuffer.toString('base64');
        scope.hash = await phashHex(pngBuffer);
        scope.type = await getType(imageData);
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
        /** @type {DocumentReference} */
        const docRef = scope.docRef ? scope.docRef : fstore.collection(scope.isTest ? 'icons-test' : 'icons').doc();
        scope.docRef = docRef;
        await docRef.set({
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
        return scope.docRef.id;
    } else {
        return null;
    }
}

module.exports = {
    uploadIcon,
}