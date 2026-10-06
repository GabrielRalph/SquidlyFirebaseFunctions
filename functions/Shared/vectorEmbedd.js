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


async function getEmbedding(data) {
    let vector = null;
    // Get the access token
    try {
        const accessToken = (await admin.credential.applicationDefault().getAccessToken()).access_token;
    
        // Make the POST request
        const response = await axios.post(URL, data, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
        });

        vector =response.data.predictions[0];
    } catch (error) {
        throw `Failed to get embedding:\n\t${error}`;
    } 

    return vector;
}

async function getImageEmbedding(pngBase64) {
    return (await getEmbedding({
        "instances": [ {"image": { "bytesBase64Encoded": pngBase64 }}]
    })).imageEmbedding;
}

async function getTextEmbedding(text) {
    return (await getEmbedding({
        "instances": [ { "text": text } ]
    })).textEmbedding;
}


module.exports = {getTextEmbedding, getEmbedding, getImageEmbedding}