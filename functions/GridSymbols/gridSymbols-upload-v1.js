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

const { onCall } = require("firebase-functions/v2/https");
const { getUsersMaxTier } = require("../Licences/shared.js");
const { MIMETYPE_KEY } = require("./shared.js");
const { validateData } = require("../Shared/shared.js");
const { uploadIcon } = require("./uploadIcon.js");

const TEST_MODE = false;
const MAX_NAME_LENGTH = 1000;
const UPLOAD_VALIDATORS = [
    async ({auth}) => {if (!auth) return "User not authenticated.";},
    async ({data}) => {if (!data) return "No data provided.";},
    async ({data: {dataBuffer}}) => {
        if (typeof dataBuffer !== "string") {
            return "dataBuffer must be encoded as string.";
        }
    },
    async ({data: {name}}) => {
        if (typeof name !== "string") {
            return "Name must be a string.";
        } else if (name.length == 0) {
            return "Name must be a non empty string.";
        } else if (name.length > MAX_NAME_LENGTH) {
            return `Name must be less than ${MAX_NAME_LENGTH} characters long.`;
        }
    },
    async ({data: {type}}) => {
        if (typeof type !== "string") {
            return "Type must be a string.";
        } else if (!(type in MIMETYPE_KEY)) {
            return `Type "${type}" must be a valid image mime type (image/[${Object.values(MIMETYPE_KEY).join("|")}]).`;
        }
    },
    async ({data}) => {
        let uploadID = data.uploadID;   
        if (typeof uploadID !== "string") {
            data.uploadID = null;
        } else if (uploadID.length == 0) {
            data.uploadID = null;
        } else if (uploadID.length > MAX_NAME_LENGTH) {
            return `uploadID must be less than ${MAX_NAME_LENGTH} characters long.`;
        }
    },
    async ({auth}) => {
        if (!auth.token.email_verified) {
            return "User has not verified their email.";
        }
    },
    async ({auth}) => {
        try {
            let tier = await getUsersMaxTier(auth.uid);
            if (!(tier >= 1)) {
                return "User does not have a licence to upload Grid Symbols.";
            }
        } catch (e) {
            debug("GRID-SYMBOLS: Error getting licence", e)
            return "Colud not check if user has licence to upload Grid Symbols.";
        }
    }
]

module.exports = {
    upload: onCall({
        region: "australia-southeast1"
    },async (req) => {
        let errors = [];
        let results = {valid: false}
        if (await validateData(req, UPLOAD_VALIDATORS, errors)) {
            const scope = req.data;
            scope.srcFilename = null;
            scope.storagePath = null;
            scope.similaritySearch = req.data ?? true;
            scope.uid = req.auth.uid;
            await uploadIcon(scope)
            results = {
                valid: !scope.error,
                errors: [scope.error],
                symbolID: scope.id,
                url: scope.url,
                similar: scope.similar || [],
            }
        } else {
            results.errors = errors;
        }
        return results;
    }),
}