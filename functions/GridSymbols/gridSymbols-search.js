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
 * 
 * @typedef {FirebaseFirestore.Query<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>} Query
 * @typedef {FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>[]} Docs
 * @typedef {FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>} CollectionRef
 * @typedef {("user"|"public"|"all")} SearchMode
 * @typedef {("vector"|"text"|"both")} SearchType
 * */

const {onCall} = require("firebase-functions/v2/https");
const { Filter } = require('firebase-admin/firestore');
const {or, where} = Filter;
const {fstore} = require("../firebase.js");
const { getTextEmbedding, startTimer, unique, docs2iconInfo } = require("./vectorEmbedd.js");
const { debug } = require("firebase-functions/logger");

const MODES = {
    "user": true,
    "public": true,
    "all": true,
}

const TYPES = {
    "vector": true,
    "text": true,
    "both": true,
}

const MAX_TEXT_SIZE = 200;
const SEARCH_LIMIT = 300;


/** Returns a query for either public, user only or both icons
 * @param {CollectionRef} collection 
 * @param {("all"|"public"|"user")} mode
 * @param {string} uid
 * 
 * @return {?Query}
 */
function search_query(collection, mode, uid) {
    let query;
    switch (mode) {
        case "all":
            query = collection.where(or(
                where('public', '==', true),
                where('uid', '==', uid)
            ));
            break;
        case "public":
            query = collection.where('public', '==', true);
            break;
        case "user":
            query = collection.where('uid', '==', uid);
            break;
        default: 
            query = null;
    }
    return query;
}

/** Searches by text value for icons
 * @param {CollectionRef} collection 
 * @param {("all"|"public"|"user")} mode
 * @param {string} uid
 * @param {string} text
 * 
 * @return {Promise<IconInfo[]>}
 */
async function search_text(collection, mode, uid, text) {
    let iconInfo = []
    try {
        let end = startTimer();
        let query = search_query(collection, mode, uid, text);
        let snapshot = await query.where('name', '>=', text).where('name', '<=', text+ '\uf8ff').get();
        iconInfo = docs2iconInfo(snapshot.docs, uid);
        debug(`GRID-SYMBOLS: Text search[${mode}] took ${end()}ms.`)
    } catch (e) {
        debug(`GRID-SYMBOLS: Text search[${mode}] failed:`, e)
    }
    return iconInfo;
    
}


/** Searches by vector embedding for a set number of best matched icons
 * @param {CollectionRef} collection 
 * @param {("all"|"public"|"user")} mode
 * @param {string} uid
 * @param {string} text
 * @param {number} limit
 * 
 * @return {Promise<IconInfo[]>}
 */
async function search_vector(collection, mode, uid, text, limit = SEARCH_LIMIT) {
    let iconInfo = [];
    try {
        // compute vector embedding.
        let end = startTimer();
        let embedding = await getTextEmbedding(text);
        debug(`GRID-SYMBOLS: Embedding phrase ${text} took ${end()}ms`);
    
        let params = {
            vectorField: 'embedding',
            queryVector: embedding,
            limit: limit,
            distanceMeasure: 'EUCLIDEAN',
            distanceResultField: 'vector_distance'
        };
    
        end = startTimer();
        if (mode == "all") {
            // query for public and users in parallel
            let query1 = search_query(collection, "public", uid);
            let query2 = search_query(collection, "user", uid);
            let snapshots = await Promise.all([
                query1.findNearest(params).get(), 
                query2.findNearest(params).get()
            ]);
            
            // combine results
            iconInfo = snapshots.flatMap(snapshot => docs2iconInfo(snapshot.docs, uid, true));
    
            // sort by vector distance
            iconInfo.sort((a, b) => a.match - b.match);
    
            // remove duplicates
            iconInfo = unique(iconInfo);
    
            // limit best results
            iconInfo = iconInfo.slice(0, limit);
    
        } else {
            // Query individual mode
            let query = search_query(collection, mode, uid);
            let snapshot = await query.findNearest(params).get();
            iconInfo = docs2iconInfo(snapshot.docs, uid, true);
        }
        debug(`GRID-SYMBOLS: Vector search[${mode}] took ${end()}ms.`);
    } catch (e) {
        debug(`GRID-SYMBOLS: Vector search[${mode}] failed:`, e);
    }

    return iconInfo;
}


/**
 * @param {{text: string, mode: SearchMode, type: SearchType}} data
 * @param {AuthData} auth
 */
async function searchSymbols(data, auth) {
    let end = startTimer();
    let uid = auth ? auth.uid : "123";
    let {text, mode, type, size} = data;
    size = size || SEARCH_LIMIT;

    debug(`GRID-SYMBOLS: GridSymbol search[${type}][${mode}] for phrase ${text}.`)

    let iconInfo = [];
    if (typeof text === "string" && text.length > 0 && text.length < MAX_TEXT_SIZE && mode in MODES && type in TYPES) {
        let col = fstore.collection("icons");

        let querys = [];
        if (type == "vector" || type == "both") {
            querys.push(search_vector(col, mode, uid, text, size));
        } 
       
        if (type == "text" || type === "both") {
            querys.push(search_text(col, mode, uid, text, size));
        }

        iconInfo = (await Promise.all(querys)).flatMap(i => i);

        iconInfo = unique(iconInfo);
    }
    
    debug(`GRID-SYMBOLS: Search took ${end()}ms.`);

    return iconInfo;
}

module.exports = {
    search: onCall({
        region: "australia-southeast1",
        memory: "512MiB",
    },async ({auth, data}) => {
        return await searchSymbols(data, auth);
    }),
}