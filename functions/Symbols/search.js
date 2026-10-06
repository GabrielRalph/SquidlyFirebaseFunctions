const { fstore, FieldValue } = require("../firebase");
const { getTextEmbedding } = require("../Shared/vectorEmbedd");

const EMB_COLLECTION = fstore.collection("symbol-embeddings");
const SYM_COLLECTION = fstore.collection("symbols");
const LIMIT_PERCENTAGE = 0.0025
const LIMIT_MINIMUM = 10
const LIMIT_MAX = 250
const COUNT_CACHE = {}


function getQuery(symbol_set, uid, use_variants = false){
    let query = EMB_COLLECTION;
    if (symbol_set == "PUBLIC"){
        query = query.where("symbol_set", "==", null).where("public", "==", true);
    } else if (symbol_set == "PRIVATE") {
        query = query.where("owner", "==", uid);
    } else {
        query = query.where("symbol_set", "==", symbol_set);
        if (!use_variants) {
            query = query.where("variant_id", "==", null);
        }
    }
    return query
}

/**
 * Get the count of symbols for a given symbol set and user.
 * Utilizes caching to reduce repeated queries. 
 * Private/Public symbol sizes are cached per 
 * hour to optimize performance, but other symbol sets 
 * are cached permanently (or until the server restarts).
 * 
 * @param {string} symbol_set - The symbol set ("PUBLIC", "PRIVATE", or custom).
 * @param {string} uid - The user ID (required for "PRIVATE" symbol set).
 * @param {boolean} use_variants - Whether to include variant symbols.
 * @returns {Promise<number>} - The count of symbols.
 */
async function getCount(symbol_set, uid, use_variants = false){
    let cache_key = null;
    let currentHour = Math.floor(Date.now() / 3600000); 
    if (symbol_set == "PUBLIC") {
        cache_key = `PUBLIC_${currentHour}`;
    } else if (symbol_set == "PRIVATE") {
        cache_key = `PRIVATE_${uid}_${currentHour}`;
    } else {
        cache_key = `${symbol_set}_${use_variants? 1 : 0}`;
    }

    let count = 0;

    if (cache_key in COUNT_CACHE) {
        count = COUNT_CACHE[cache_key];
    } else {
        let query = getQuery(symbol_set, uid, use_variants);
        let results = await query.count().get();
        count = results.data().count;
        COUNT_CACHE[cache_key] = count;
    }

    return count;
}


/**
 * Get the limit for the number of symbols to retrieve based on the symbol set 
 * and user. The limit is calculated as a percentage of the total count, 
 * constrained by minimum and maximum values.
 * 
 * @param {string} symbol_set - The symbol set ("PUBLIC", "PRIVATE", or custom).
 * @param {string} uid - The user ID (required for "PRIVATE" symbol set).
 * @param {boolean} use_variants - Whether to include variant symbols.
 * @returns {Promise<number>} - The calculated limit for the
 *                              number of symbols to retrieve.
 */
async function getLimit(symbol_set, uid, use_variants = false){
    let count = await getCount(symbol_set, uid, use_variants);
    let limit = null;
    if (count > 0) {
        limit = Math.floor(count * LIMIT_PERCENTAGE);
        limit = Math.max(limit, LIMIT_MINIMUM);
        limit = Math.min(limit, LIMIT_MAX);
    }
    return limit;
}



async function searchSet(vector, symbol_set, uid, use_variants = false){
    let results = [];
    let limit = await getLimit(symbol_set, uid, use_variants);
    if (limit !== null) {
        // console.log(`Searching\n\tsymbol set ${symbol_set}\n\tuid: ${uid}\n\tuse_variants: ${use_variants}\n\tLimit: ${limit}`);
        try {
            let query = getQuery(symbol_set, uid, use_variants);
            let sn = await query
                .select("symbol_id", "variant_id", "distance")
                .findNearest({
                    vectorField: "embedding",
                    queryVector: vector,
                    distanceMeasure: "EUCLIDEAN",
                    distanceResultField: "distance",
                    limit
                }).get();
            results = sn.docs.map(doc => ({
                symbol_id: doc.get("symbol_id"),
                variant_id: doc.get("variant_id"),
                distance: doc.get("distance")
            }));
        } catch (error) {
            console.log(`Error searching symbol set ${symbol_set}:`, error);
        }
    } 
    return results;
}


async function search(vector, symbol_sets, uid, use_variants = false) {
    let all_results = await Promise.all(
        symbol_sets.map(symbol_set => searchSet(vector, symbol_set, uid, use_variants))
    );

    let sv_distances = {};
    for (let result_set of all_results) {
        for (let {symbol_id, distance, variant_id} of result_set) {
            if (!(symbol_id in sv_distances)) { sv_distances[symbol_id] = {} }
            if (variant_id == null) { variant_id = "default"; }
            sv_distances[symbol_id][variant_id] = distance;  
        }
    }

    
    let symbols = await fstore.getAll(
        ...Object.keys(sv_distances)
            .map(symbol_id => SYM_COLLECTION.doc(symbol_id))
    );

    symbols = symbols.map(doc => {
        let res = null;
        if (doc.exists) {
            let distances = sv_distances[doc.id] || {};
            res = {
                ...doc.data(),
                id: doc.id,
                variant_distances: distances,
                min_distance: Math.min(...Object.values(distances))
            }
        }
        return res;
    }).filter(symbol => symbol !== null)
      .sort((a, b) => a.min_distance - b.min_distance);

    return symbols;
}



async function textVectorSearch(text, symbol_sets, uid, use_variants = false) {
    let vector = await getTextEmbedding(text);
    vector = FieldValue.vector(vector);
    return await search(vector, symbol_sets, uid, use_variants);
}


async function imageVectorSearch(image, symbol_sets, uid, use_variants = false) {
    let vector = await getImageEmbedding(image);
    vector = FieldValue.vector(vector);
    return await search(vector, symbol_sets, uid, use_variants);
}


module.exports = {
    search,
    getTextEmbedding,
    textVectorSearch,
    imageVectorSearch
};