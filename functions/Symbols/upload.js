const { fstore, sb, FileStatus } = require("../firebase.js");
const { getEmbedding } = require("../Shared/vectorEmbedd");
const { FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const { getDownloadURL } = require("firebase-admin/storage");
const { img2rgb, getType, FORMAT_2_MIMETYPE, resizeImageToFileSize, getImageDimensions } = require("../Shared/images.js");
const { warn } = require("firebase-functions/logger");
const fflate = require("fflate");

const EMBEDDING_IMAGE_SIZE = 512;
const MAX_FILE_SIZE = 1024 * 200;

function getNewIconDoc(isTest) {
    return fstore.collection(isTest ? 'test-symbols' : 'symbols').doc();
}

function getNewIconStoragePath(isTest, docId) {
    return isTest ? `symbols/test-all/${docId}` : `symbols/all/${docId}`;
}

function getEmbeddingDoc(docId, isTest) {
    return fstore.collection(isTest ? 'test-symbol-embeddings' : 'symbol-embeddings').doc(docId);
}

function normaliseSearchPhrase(title) {
    if (typeof title !== 'string') return "";

    title = title.normalize("NFKC");
    // casefold: toLowerCase + common Unicode fold (ß→ss)
    title = title.toLowerCase().replace(/ß/g, "ss");
    title = title.normalize("NFD").replace(/\p{Mn}/gu, "");

    title = title.replace(/['\u2018\u2019\u02BC`]/g, "");
    title = title.replace(/_/g, " ");
    title = title.replace(/[\u2010-\u2015\u2212]/g, "-");

    if (!/^[^\p{L}\p{N}_\s-]+$/u.test(title)) {
        title = title.replace(/[^\p{L}\p{N}_\s-]/gu, " ");
    }

    title = title.replace(/\s+/g, " ");
    title = title.replace(/\s*-\s*/g, "-");

    const trimmed = title.replace(/^[\s-]+|[\s-]+$/g, "");
    if (trimmed !== "") title = trimmed;

    return title;
}

class CustomError extends Error {}
const uploadSymbolSteps = [
    {
        relativeTime: 1,
        message: "Preparing icon for upload",
        name: "preparing",
        defaultErrorMessage: "Failed to prepare icon for upload, please try again.",
        async method(scope){
            let {srcFilename, dataBuffer} = scope;
            if (!dataBuffer && !srcFilename) {
                throw new CustomError("No source filename or data buffer provided");
            } else if (srcFilename) {
                dataBuffer = fs.readFileSync(srcFilename);
                scope.dataBuffer = dataBuffer;
            } else if (typeof dataBuffer === 'string') {
                dataBuffer = Buffer.from(dataBuffer, 'base64');
                scope.dataBuffer = dataBuffer;
            }
            scope.imageBuffer = scope.dataBuffer;

            const type = await getType(dataBuffer);
            if (type == null) {
                throw new CustomError("The image provided is not supported. Please upload a different image.");
            } else {
                scope.type = type;
                scope.mimeType = FORMAT_2_MIMETYPE[type];
            }

            // If the image is an SVG we will zip it to reduce file size
            if (type == "svg") {
                const compressed = await new Promise((resolve, reject) => {
                    fflate.gzip(scope.dataBuffer, {}, (err, data) => {
                        if (err) return reject(err);
                        else resolve(data);
                    });
                });
                scope.dataBuffer = compressed;
            }
        },
    },
    {
        relativeTime: 4,
        message: "Resizing icon",
        name: "resizing",
        defaultErrorMessage: "The provided image type is not supported or the image is too large. Please try uploading a different image.",
        async method(scope){
            if (scope.dataBuffer.length > MAX_FILE_SIZE) {
                const [resizedBuffer, metadata] = await resizeImageToFileSize(scope.imageBuffer, MAX_FILE_SIZE, 0.05);
                scope.dataBuffer = resizedBuffer;
                scope.imageBuffer = resizedBuffer;
                scope.type = metadata.format;
                scope.mimeType = FORMAT_2_MIMETYPE[metadata.format];
                scope.width = metadata.width;
                scope.height = metadata.height;
            } else {
                const [width, height] = await getImageDimensions(scope.imageBuffer, scope.type);
                scope.width = width;
                scope.height = height;
            }
        }
    },


    {
        relativeTime: 2,
        message: "Generating image for embedding",
        name: "preparing embedding input",
        defaultErrorMessage: "Failed to generate image for embedding. Please try uploading a different image.",
        async method(scope){
            const rgbBuffer = await img2rgb(scope.imageBuffer, scope.type, EMBEDDING_IMAGE_SIZE);
            scope.imgBase64 = rgbBuffer.toString('base64');
        }
    },

    {
        relativeTime: 5,
        message: "Creating semantic embedding for icon",
        name: "embedding",
        defaultErrorMessage: "Failed to create semantic embedding for the symbol. Please try again.",
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
        defaultErrorMessage: "Failed to store the icon in cloud storage. Please try again.",
        async method(scope){
            // Generate a unique storage path for the icon
            scope.docRef = getNewIconDoc(scope.isTest);
            scope.id = scope.docRef.id;
            scope.embeddingRef = getEmbeddingDoc(scope.id, scope.isTest);

            let finalPath = null;
            if (scope.symbolSet) {
                finalPath = `symbols/sets/${scope.symbolSet}/${scope.symbolSetSourceID || scope.id}`;
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
                    ...(scope.type === "svg" ? {contentEncoding: "gzip"} : {})
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
        defaultErrorMessage: "Failed to save the icon metadata. Please try again.",
        name: "saving",
        async method(scope){
            let sphrase = normaliseSearchPhrase(scope.name);

            let symbol = {
                owner: scope.uid || "unknown",
                public: scope.public || false,
                commercial: scope.commercial || false,
                symbol_set: scope.symbolSet || null,

                search_phrase: sphrase,

                licence: scope.licence || null,

                format: scope.type,
                width: scope.width,
                height: scope.height,

                variant_keys: [],
                variants: {},

                url: scope.url,
                source_id: scope.symbolSetSourceID || null,
            }

            let embeddingMetadata = {
                symbol_set: scope.symbolSet || null,

                owner: scope.uid || "unknown",
                public: scope.public || false,
                commercial: scope.commercial || false,

                variant_id: null,
                symbol_id: scope.id,

                embedding: scope.embedding,
            };

            if (scope.name !== sphrase) {
                symbol.title = scope.name;
            }
            scope.symbol = symbol;
            await Promise.all([
                scope.docRef.set(symbol),
                scope.embeddingRef.set(embeddingMetadata)
            ]);
        },

        async clean(scope) {
            try {
                if (scope.docRef) {
                    await scope.docRef.delete();
                }
                if (scope.embeddingRef) {
                    await scope.embeddingRef.delete();
                }
            } catch (err) { 
                console.error("Error after metadata cleanup:", err);
            }
        }
    },
]
/**
 * Uploads an icon 
 */
async function uploadSymbol(scope = {
    uid: null,
    name: null,
    public: false,
    commercial: false,
    isTest: false,
    uploadID: null,
    dataBuffer: null,
    srcFilename: null,
    symbolSet: null,
    symbolSetSourceID: null,
}) {
    let totalRelativeTime = uploadSymbolSteps.reduce((acc, step) => acc + step.relativeTime, 0);
    let relativeTimeElapsed = 0;
    let status = new FileStatus(scope.uid, scope.uploadID);
    let error = false;
    for (let i = 0; i < uploadSymbolSteps.length; i++) {
        const step = uploadSymbolSteps[i];
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
                const cleanStep = uploadSymbolSteps[j];
                if (cleanStep.clean instanceof Function) {
                    try {
                        await status.update({message: `Cleaning up after ${cleanStep.name}`});
                        await cleanStep.clean(scope);
                    } catch (cleanErr) {
                        warn(`GRID-SYMBOLS: Clean Up: Error during cleanup of step ${j}:`, cleanErr);
                    }
                }
            }
            if (err instanceof CustomError) {
                error = err.message;
            } else {
                error = step.defaultErrorMessage;
            }
            break;
        }
        relativeTimeElapsed += step.relativeTime;
    }
    await status.clear();
    scope.error = error;
    return scope;
}

module.exports = {
    uploadSymbol,
    normaliseSearchPhrase
}