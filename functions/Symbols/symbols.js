const { onCall } = require("firebase-functions/https");
const { validateData, isNonNullObject } = require("../Shared/shared");
const { textVectorSearch } = require("./search");
const { normaliseSearchPhrase, uploadSymbol } = require("./upload");
const MAX_NAME_LENGTH = 255;
const SEARCH_VALIDATORS = [
    ({auth}) => {if (!isNonNullObject(auth)) return "User is not authenticated";},
    ({auth: {uid}}) => {if (!uid) return "User is not authenticated";},
    ({data}) => {if (!isNonNullObject(data)) return "User did not provide search data.";},
    ({data}) => {
                    if (!Array.isArray(data.symbol_sets) 
                        || data.symbol_sets.length === 0 
                        || data.symbol_sets.some(s => typeof s !== "string")
                    ) return "User did not provide valid symbol sets.";
                },
    ({data}) => {
                    if (data.query_text == null || typeof data.query_text !== "string") 
                        return "User did not provide a valid query text.";
                },
    async ({auth: {uid}, data}) => {
        const {symbol_sets, query_text, use_variants} = data;
        try {
            data.results = await textVectorSearch(
                query_text, 
                symbol_sets, 
                uid, 
                Boolean(use_variants)
            );
        } catch (error) {
            return `Failed to perform text vector search:\n\t${(error+"").replace(/\n/g, "\n\t")}`;
        }
    }
];

const UPLOAD_VALIDATORS = [
    ({auth}) => {if (!isNonNullObject(auth)) return "User is not authenticated";},
    ({auth: {uid}}) => {if (!uid) return "User is not authenticated";},
    ({data}) => {if (!isNonNullObject(data)) return "User did not provide upload data.";},
    ({data, auth: {uid}}) => {
        data.srcFilename = null;
        data.symbolSet = null;
        data.symbolSetSourceID = null;
        data.commercial = true;
        data.uid = uid;
        // data.isTest = false;

        const upid = data.uploadID;
        data.uploadID = typeof upid === "string" && upid.length > 0 ? upid : null;
        
        let name = typeof data.name === "string" ? data.name.trim() : "";
        name = name.slice(0, MAX_NAME_LENGTH);
        let sphrase = normaliseSearchPhrase(name);
        data.name = name;
        if (sphrase.length === 0) return "User did not provide a valid name.";
    },
    async({data}) => {
        await uploadSymbol(data);
        if (data.error) {
            return data.error;
        }
    }
];

module.exports = {
    SEARCH_VALIDATORS,
    search: onCall({
        region: "australia-southeast1",
        memory: "512MiB",
    },async (req) => {
        let errors = [];
        await validateData(req, SEARCH_VALIDATORS, errors);
        return { errors, data: req?.data?.results ?? [] };
    }),

    upload: onCall({
        region: "australia-southeast1",
        memory: "1GiB",
    },async (req) => {
        let errors = [];
        await validateData(req, UPLOAD_VALIDATORS, errors);
        let result = null;
        if (errors.length == 0) {
            result = {
                id: req.data.id,
                symbol: req.data.symbol,
            }
        }
        return { errors, result };
    }),
}