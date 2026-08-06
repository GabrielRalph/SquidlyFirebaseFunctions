const { fstore, sb, db } = require("../firebase.js");
const { getEmbedding, docs2iconInfo, unique } = require("./vectorEmbedd");
const { FieldValue, DocumentReference } = require('firebase-admin/firestore');
const fs = require('fs');
const { getDownloadURL } = require("firebase-admin/storage");
const { img2png, img2rgb, phashHex, MIMETYPE_KEY, getType, FORMAT_2_MIMETYPE } = require("./shared.js");
const { debug, warn } = require("firebase-functions/logger");

const SIMILARITY_LIMIT = 12;
const MAX_FILE_SIZE = 1024 * 150;

function getNewIconDoc(isTest) {
    return fstore.collection(isTest ? 'icons-test' : 'icons').doc();
}

function getNewIconStoragePath(isTest, docId) {
    return isTest ? `icons/test/${docId}` : `icons/all/${docId}`;
}

class FileStatus {
    /** @type {import("firebase-admin/database").ThenableReference} */
    ref = null;

    /** @type {Promise} */
    lastProm = null;

    constructor(uid, uploadID){
        if (uploadID) {
            try {
                this.ref = db.ref(`file-status/${uid}/${uploadID}`).push();
                this.lastProm = this.ref.set({
                    progress: 0,
                    message: "Starting upload",
                    id: uploadID
                })
            } catch (err) {
                warn("GRID-SYMBOLS: FileStatus: Error initializing file status:", err);
            }
        }
    }

    async update(update = {}) {
        if (!this.ref) {
            let log = "State update:"
            for (const [key, value] of Object.entries(update)) {
                log += `  ${key}: ${value}\n`;
            }
            console.log(log);
        } else {
            try {
                await this.lastProm;
                this.lastProm = this.ref.update(update)
            } catch (err) {
                warn("GRID-SYMBOLS: FileStatus: Error updating file status:", err);
            }
        }
    }

    async clear(){
        if (!this.ref) return;
        try {
            await this.lastProm;
            await this.ref.remove();
        } catch (err) {
            warn("GRID-SYMBOLS: FileStatus: Error clearing file status:", err);
        }
    }
}

const uploadIconSteps = [
    {
        relativeTime: 1,
        message: "Preparing icon for upload",
        name: "preparing",
        async method(scope){
            let {srcFilename, dataBuffer} = scope;
            if (!dataBuffer && !srcFilename) {
                throw new Error("No source filename or data buffer provided");
            } else if (srcFilename) {
                dataBuffer = fs.readFileSync(srcFilename);
                scope.dataBuffer = dataBuffer;
            } else if (typeof dataBuffer === 'string') {
                dataBuffer = Buffer.from(dataBuffer, 'base64');
                scope.dataBuffer = dataBuffer;
            }

            if (dataBuffer.length > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE} bytes`);
            }

            if (!scope.type) {
                scope.mimeType = await getType(dataBuffer);
                scope.type = MIMETYPE_KEY[scope.mimeType];
            } else {
                scope.mimeType = FORMAT_2_MIMETYPE[MIMETYPE_KEY[scope.type]];
                scope.type = MIMETYPE_KEY[scope.mimeType];
            }

            if (!scope.type || !scope.mimeType) {
                throw new Error("Unsupported image type");
            } 

            const pngBuffer = await img2png(dataBuffer);
            const rgbBuffer = await img2rgb(pngBuffer);
            scope.imgBase64 = rgbBuffer.toString('base64');
            scope.hash = await phashHex(rgbBuffer);
        },
    },

    {
        relativeTime: 5,
        message: "Creating semantic embedding for icon",
        name: "embedding",
        async method(scope){
            // Get the vector embedding for the image
            let pred = await getEmbedding({"instances": [
                {"image": { "bytesBase64Encoded": scope.imgBase64 } }
            ]});

            if (!pred || !pred.imageEmbedding) {
                throw new Error("Failed to get image embedding");
            }
    
            // get field vectorEmbedding
            scope.embedding = FieldValue.vector(pred.imageEmbedding);
        }
    },

    {
        relativeTime: 3,
        message: "Saving icon in cloud storage",
        name: "storing",
        async method(scope){
            // Generate a unique storage path for the icon
            scope.docRef = getNewIconDoc(scope.isTest);
            scope.id = scope.docRef.id;

            let finalPath = null;
            if (scope.storagePath) {
                finalPath = `icons/icon-sets/${scope.storagePath}`;
            } else {
                finalPath = getNewIconStoragePath(scope.isTest, scope.id);
                scope.storagePath = null;
            }

            // Upload the icon to storage and get the download URL
            const storageRef = sb.file(finalPath);
            scope.storageRef = storageRef;

            await storageRef.save(scope.dataBuffer, {
                metadata: {
                    contentType: scope.mimeType,
                    documentID: scope.id,
                },
                contentType: scope.mimeType,
            });
            const url = await getDownloadURL(storageRef);
            scope.url = url;
            return {url}
        },
        async clean(scope) {
            try {
                if (scope.storageRef) {
                    await scope.storageRef.delete();
                } 
            } catch (err) { 
                console.error("Error after storage cleanup:", err); 
            }
        }
    }, 

    {
        relativeTime: 1,
        message: "Saving icon metadata",
        name: "saving",
        async method(scope){
            let searchName = scope.name.trim().toUpperCase().replace(/\s+/g, "_");
            let metadata = {
                embedding: scope.embedding,
                name: searchName,
                type: scope.type,
                public: !!scope.public,
                iconSetPath: scope.storagePath,
                phash: scope.hash,
                uid: scope.uid || null,
            }
            if (scope.name !== searchName) {
                metadata.title = searchName;
            }
            await scope.docRef.set(metadata);
        },
        async clean(scope) {
            try {
                if (scope.docRef) {
                    await scope.docRef.delete();
                }
            } catch (err) { 
                console.error("Error after metadata cleanup:", err);
            }
        }
    },

    {
        relativeTime: 1,
        message: "Finding similar icons",
        name: "searching",
        async method(scope){
            if (scope.embedding && scope.similaritySearch) {
                try {

                    const params = {
                        vectorField: 'embedding',
                        queryVector: scope.embedding,
                        limit: SIMILARITY_LIMIT,
                        distanceMeasure: 'EUCLIDEAN',
                        distanceResultField: 'vector_distance'
                    };
                    const uid = scope.uid || null;
                    const col = fstore.collection("icons")
                    let proms = [col.where("public", "==", true).findNearest(params).get()]
                    if (scope.uid) {
                        proms.push(col.where("uid", "==", scope.uid).findNearest(params).get())
                    }
                    const snapshots = await Promise.all(proms);

                    let similar = snapshots.flatMap(sn => docs2iconInfo(sn.docs, uid, true));
                    similar = unique(similar);
                    similar.sort((a, b) => a.match - b.match);
                    scope.similar = similar.slice(0, SIMILARITY_LIMIT);

                } catch (e) {
                    console.error("Error during similarity search:", e);
                }
            }
        }
    }
]
/**
 * Uploads an icon 
 */
async function uploadIcon(scope = {
    uid: null,
    name: null,
    type: null,
    public: false,
    isTest: false,
    upoadID: null,
    dataBuffer: null,
    srcFilename: null,
    storagePath: null,
    similaritySearch: false
}) {
    let totalRelativeTime = uploadIconSteps.reduce((acc, step) => acc + step.relativeTime, 0);
    let relativeTimeElapsed = 0;
    let status = new FileStatus(scope.uid, scope.uploadID);
    let error = false;
    for (let i = 0; i < uploadIconSteps.length; i++) {
        const step = uploadIconSteps[i];
        await status.update({
            message: step.message,
            progress: relativeTimeElapsed / totalRelativeTime
        })

        try {
            let update = await step.method(scope);
            if (update) {
                await status.update(update);
            }
        } catch (err) {
            warn(`GRID-SYMBOLS: Error during step ${i} (${step.name}):`, err);
            await status.update({error: `Error: ${err.message}`})
            for (let j = i; j >= 0; j--) {
                const cleanStep = uploadIconSteps[j];
                if (cleanStep.clean instanceof Function) {
                    try {
                        await status.update({message: `Cleaning up after ${cleanStep.name}`});
                        await cleanStep.clean(scope);
                    } catch (cleanErr) {
                        warn(`GRID-SYMBOLS: Clean Up: Error during cleanup of step ${j}:`, cleanErr);
                    }
                }
            }
            error = err.message;
            break;
        }
        relativeTimeElapsed += step.relativeTime;
    }
    await status.clear();
    scope.error = error;
    return scope;
}

module.exports = {
    uploadIcon,
}