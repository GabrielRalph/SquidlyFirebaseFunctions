/** 
 * @typedef {Object} AuthData 
 *  @property {import("firebase-admin/auth").DecodedIdToken} token
 *  @property {string} uid
 *  
 * @typedef {Object} IconInfo 
 *  @property {string} name
 *  @property {string} type
 *  @property {string} url
 *  @property {string} id
 *  @property {number} match
 * 
 * @typedef {Object} UploadRequestData
 *  @property {(string|Buffer)} dataBuffer
 *  @property {string} type
 *  @property {string} name
 *  @property {boolean} public
 *  @property {string} uploadID
 *  
 * 
 * @typedef {FirebaseFirestore.Query<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>} Query
 * @typedef {FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>[]} Docs
 * @typedef {FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>} CollectionRef
 * @typedef {("user"|"public"|"all")} SearchMode
 * @typedef {("vector"|"text"|"both")} SearchType
 * */

const phash = require("sharp-phash");
const { debug } = require("firebase-functions/logger");
const { fstore, sb, db } = require("../firebase.js");
const { getEmbedding, startTimer, docs2iconInfo, unique } = require("./vectorEmbedd");
const { getDownloadURL } = require("firebase-admin/storage");
const {onCall} = require("firebase-functions/v2/https");
const { FieldValue } = require('firebase-admin/firestore');
const sharp = require('sharp');
const { getUsersMaxTier } = require("../Licences/shared.js");

const TEST_MODE = false;

const SEARCH_LIMIT = 12;
const MAX_FILE_SIZE = 1024 * 150;
const MAX_NAME_LENGTH = 1000;
const EMBEDDING_IMAGE_SIZE = 300;
const ACCEPTED_IMAGE_MIMETYPES = {
    "image/bmp": "bmp",
    "image/emf": "emf",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/heic": "heic",
    "image/png": "png",
    "image/svg+xml": "svg+xml",
    "image/webp": "webp",
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
}
const ICONS_DIR = TEST_MODE ? "icons/test" : "icons/all"

/** @type {CollectionRef} */
const SymbolsRef = fstore.collection(TEST_MODE ? "icons-test" : "icons");


class FileStatus {
    /** @type {import("firebase-admin/database").ThenableReference} */
    ref = null;

    /** @type {Promise} */
    lastProm = null;

    constructor(uid, uploadID){
        this.ref = db.ref(`file-status/${uid}`).push();
        this.lastProm = this.ref.set({
            status: 0,
            id: uploadID
        })
    }

    async update(status, update = {}) {
        update.status=status;
        await this.lastProm;
        this.lastProm = this.ref.update(update)
    }

    async clear(){
        await this.lastProm;
        await this.ref.remove();
    }
}


/**
 * Converts image at url to png base64 encoded string
 * @param {Buffer} dataBuffer
 */
async function img2png_base64(dataBuffer) {
    let imgbuff = await sharp(dataBuffer)
    .resize(EMBEDDING_IMAGE_SIZE)
    .png()
    .toBuffer();

    return imgbuff.toString('base64');
}


/**
 * @param {UploadRequestData} data
 * 
 * @return {[boolean, string[]]}
 */
function validateRequestData(data) {
    let valid = true;
    let errors = [];
    if (typeof data !== "object" || data === null) {
        errors.push("No upload request data provided.");
        valid = false;
    } else {
        let {dataBuffer, name, type, uploadID} = data;

        if (typeof dataBuffer !== "string") {
            errors.push("dataBuffer must be encoded as string.");
            valid = false;
        } else if (dataBuffer.length > MAX_FILE_SIZE) {
            errors.push(`File size must be less ${MAX_FILE_SIZE}.`);
            valid = false;
        } else {
            try {
                data.dataBuffer = Buffer.from(dataBuffer, 'base64');
            } catch (e) {
                errors.push(`Buffere could not be created from provided data.`);
                valid = false;
            }

        }


        if (typeof name !== "string") {
            errors.push("Name must be a string.");
            valid = false;
        } else if (name.length == 0) {
            errors.push("Name must be a non empty string.");
            valid = false;
        } else if (name.length > MAX_NAME_LENGTH) {
            errors.push(`Name must be less than ${MAX_NAME_LENGTH} characters long.`);
            valid = false;
        }

        if (typeof type !== "string") {
            errors.push("Type must be a string.");
            valid = false;
        } else if (!(type in ACCEPTED_IMAGE_MIMETYPES)) {
            errors.push(`Type "${type}" must be a valid image mime type (image/[${Object.values(ACCEPTED_IMAGE_MIMETYPES).join("|")}]).`);
            valid = false;
        }


        if (typeof uploadID !== "string") {
            errors.push("uploadID must be a string.");
            valid = false;
        } else if (uploadID.length == 0) {
            errors.push("uploadID must be a non empty string.");
            valid = false;
        } else if (uploadID.length > MAX_NAME_LENGTH) {
            errors.push(`uploadID must be less than ${MAX_NAME_LENGTH} characters long.`);
            valid = false;
        }
    }

    return [valid, errors];
}

/**
 * @param {AuthData} auth
 * 
 * @return {Primise<[boolean, string[]]>}
 */
async function validateAuth(auth) {
    let errors = [];
    let valid = true;

    if (typeof auth !== "object" || auth === null) {
        errors.push("Upload request is not authenticated.");
        valid = false;
    } else {
        if (!auth.token.email_verified) {
            errors.push("User has not verified their email.");
            valid = false;
        } else {
            try {
                let tier = await getUsersMaxTier(auth.uid);
                if (!(tier >= 1)) {
                    errors.push("User does not have a licence to upload Grid Symbols.");
                    valid = false;
                }
            } catch (e) {
                debug("GRID-SYMBOLS: Error getting licence", e)
                errors.push("Colud not check if user has licence to upload Grid Symbols.");
                valid = false;
            }
        }
    }

    return [valid, errors]
}


async function attempt(n, func) {
    let error = null;
    for (let i = 0; i < n; i++) {
        try {
            return await func()
        } catch (error) {}
    }
    throw error;
}

/**
 * @param {number[]} vector
 * @param {string} uid
 * @param {number} limit = 9
 * 
 * @return {Promise<IconInfo[]>}
 */
async function searchSimilar(vector, uid, limit = SEARCH_LIMIT-1) {
    let params = {
        vectorField: 'embedding',
        queryVector: vector,
        limit: limit,
        distanceMeasure: 'EUCLIDEAN',
        distanceResultField: 'vector_distance'
    };
    let col = fstore.collection("icons")
    let snapshots = await Promise.all([
        col.where("uid", "==", uid).findNearest(params).get(),
        col.where("public", "==", true).findNearest(params).get()
    ])

    let similar = snapshots.flatMap(sn => docs2iconInfo(sn.docs, uid, true));

    similar = unique(similar);
    similar.sort((a, b) => a.match - b.match);

    return similar.slice(0, limit);
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


/**
 * @param {UploadRequestData} data
 * @param {AuthData} auth
 */
async function uploadSymbol(data, auth){
    let end = startTimer();
    let end0 = startTimer();
    let symbolID = null;
    let url = null;
    let similar = null;
    let symbolRef = null;


    /* ~~~~~~~~~~~~~~~: stage 0 ~~~~~~~~~~~~~~~
    /*               validate request          */
    let [valid, errors] = await validateAuth(auth);
    if (valid) {
        [valid, errors] = validateRequestData(data);
    }
    let {dataBuffer, type, name, public, uploadID} = data;
    
    if (valid) {
        debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: Creating ${public?"public":"private"} icon ${name}.`);

        let status = new FileStatus(auth.uid, uploadID);
        
        /* ~~~~~~~~~~~~~~~~: stage 1 ~~~~~~~~~~~~~~~~
        /*    convert image to png base64 string    */
        let pngBase64 = null;
        if (valid) {
            try {
                end = startTimer();
                pngBase64 = await img2png_base64(dataBuffer)
                debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: ${name} converted to png.`)
            } catch (e) {
                valid = false;
                errors.push(`Image conversion failed`);
                debug("GRID-SYMBOLS: Failed to convert image to base64 string");
            }
        }
    
    
        await status.update(1)
    
    
        /* ~~~~~~~~~~~~~~~~: stage 2 ~~~~~~~~~~~~~~~~
        /*                embedd image               */
        let vectorEmbedding = null;
        if (valid) {
            try {
                // embed image
                end = startTimer();
                let pred = await getEmbedding({"instances": [
                    {"image": { "bytesBase64Encoded": pngBase64 } }
                ]});
                
                // get field vectorEmbedding
                vectorEmbedding = FieldValue.vector(pred.imageEmbedding);
                debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: ${name} vector embedd.`)
            } catch (e) {
                valid = false;
                errors.push("Failed to embedd image");
                debug("GRID-SYMBOLS: Failed to embedd image");
            }
        }
    
    
        await status.update(2)
    
    
        /* ~~~~~~~~~~~~~~~~: stage 3 ~~~~~~~~~~~~~~~~
        /*            check for duplicates           */
        if (valid) {
            end = startTimer();
            try {
                similar = await searchSimilar(vectorEmbedding, auth.uid);
            } catch (e) {
                debug("GRID-SYMBOLS: Simalarity check failed.")
            }
            debug(`GRID-SYMBOLS: Upload Symbol [${end()}]: Similar images checked.`)
        }
    
    
        await status.update(3)
    
    
        /* ~~~~~~~~~~~~~~~~: stage 4 ~~~~~~~~~~~~~~~~
        /*   Upload image and create document data.    */
    
        /* stage 4.1: Create collection document reference */
        if (valid) {
            try {
                // try 3 times if an error occurs
                end = startTimer();
                const hash = await phash(dataBuffer);
                const hexHash = hashToHex(hash);
                await attempt(3, async () => {
                    symbolRef = await SymbolsRef.add({
                        name: name,
                        type: MIMETYPE_KEY[type],
                        uid: auth.uid,
                        public: !!public,
                        phash: hexHash,
                    })
                    symbolID = symbolRef.id;
                })
                debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: ${name} document reference created.`)
            } catch (e) {
                valid = false;
                errors.push("Failed to create document reference.");
                debug("GRID-SYMBOLS: Failed to create document reference.", e);
            }
        }
    
    
        await status.update(3.3)
    
            
        /* Stage 4.2: Save the icon to storage and get download url. */
        if (valid) {
            try {
                end = startTimer();
                let iconFile = sb.file(`${ICONS_DIR}/${symbolID}`);
                await iconFile.save(dataBuffer, {
                    metadata: {
                        contentType: type,
                    }
                });
                url = await getDownloadURL(iconFile);
                debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: ${name} file saved.`)
            } catch (e) {
                valid = false;
                errors.push("Failed to create collection reference");
                debug("GRID-SYMBOLS: Failed to save file", e);
            }
        }
        
    
        await status.update(3.6, {url})
    
    
        /* stage: 4.3: Update document data */
        if (valid) {
            try {
                // try 3 times if an error occurs
                end = startTimer();
                await attempt(3, async () => {
                    await symbolRef.update({
                        url: url,
                        embedding: vectorEmbedding
                    })
                })
                debug(`GRID-SYMBOLS: Upload Symbol [${end()}ms]: ${name} document updated.`)
    
            } catch (e) {
                valid = false;
                debug("GRID-SYMBOLS: Failed to save collection", e);
                errors.push("Failed to save collection.");
            }
        }
    
    
        await status.update(4)
    
    
        /* ~~~~~~~~~~~~~~~~: stage 5* ~~~~~~~~~~~~~~~~
        /*       cleanup if errors occured            */
        if (!valid && symbolRef != null) {
            await symbolRef.delete();
        }   
    
    
        await status.clear();
    }


    if (valid) {
        debug(`GRID-SYMBOLS: Upload Symbol [${end0()}ms total]: ${name} uploaded successfully id=${symbolID}.`)
    } else {
        debug(`UGRID-SYMBOLS: pload Symbol [${end0()}ms total]: FAILED`, errors);
    }
    
    return {valid, url, symbolID, errors, similar}
}


module.exports = {
    upload: onCall({
        region: "australia-southeast1"
    },async ({auth, data}) => {
        return await uploadSymbol(data, auth);
    }),
}