/** 
 * @typedef {Object} IconInfo 
 *  @property {string} name
 *  @property {string} type
 *  @property {string} url
 *  @property {string} id
 *  @property {number} match
 *  
 * 
 * @typedef {FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>[]} Docs
 * */

const axios = require('axios');
const {admin} = require("../firebase.js");

const PROJECT_ID = "eyesee-d0a42";
const LOCATION = "australia-southeast1";
const MODAL = "multimodalembedding@001";
const URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODAL}:predict`;



/**
 * @param {Docs} docs
 * @param {boolean} isVec
 * 
 * @return {IconInfo[]}
 */
function docs2iconInfo(docs, uid, isVec = false) {
    return docs.map(doc => {
        return {
            name: doc.get("name"),
            url: doc.get("url"),
            type: doc.get("type"),
            id: doc.id,
            phash: doc.get("phash"),
            owned: uid === doc.get("uid"),
            match: isVec ? doc.get("vector_distance") : 0
        }
    })
}

/** Return a list of only unique icons
 * @param {IconInfo[]}
 * 
 * @return {IconInfo[]}
 */
function unique(iconInfo) {
    // remove duplicates
    let isUsed = new Set();
    let isUsedHash = new Set();
    return iconInfo.filter(info => {
        let isIn = isUsed.has(info.id) || (info.phash && isUsedHash.has(info.phash));
        if (!isIn) {
            isUsed.add(info.id);
            isUsedHash.add(info.phash);
        }
        return !isIn;
    })
}


/** @return {() => Number} endTime */
function startTimer() {
    // Start timing
    const startTime = process.hrtime();

    // Perform some operation
    // ...
    return () => {
        // End timing
        const endTime = process.hrtime(startTime);
    
        // Calculate the elapsed time
        const elapsedSeconds = endTime[0];
        const elapsedNanoseconds = endTime[1];
        const elapsedTimeInMilliseconds = (elapsedSeconds * 1000) + (elapsedNanoseconds / 1000000);
        return elapsedTimeInMilliseconds;
    }
}


async function getEmbedding(data) {
    // Get the access token
    const accessToken = (await admin.credential.applicationDefault().getAccessToken()).access_token;

    // Make the POST request
    const response = await axios.post(URL, data, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
    });

    // Extract resulting predictions
    if (response.data && response.data.predictions) {
        return response.data.predictions[0];
    } else {
        throw "No predictions found"
    }
}


async function getTextEmbedding(text) {
    return (await getEmbedding({
        "instances": [ { "text": text } ]
    })).textEmbedding;
}


module.exports = {getTextEmbedding, getEmbedding, startTimer, unique, docs2iconInfo}