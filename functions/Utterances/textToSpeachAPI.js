const { execSync } = require('child_process');
const axios = require('axios');
let PROJECT_ID = "eyesee-d0a42";
let TOKEN_GENERATOR = async () => execSync('gcloud auth print-access-token').toString().trim();

const URLS = {
    getSpeach: ["post", "https://texttospeech.googleapis.com/v1/text:synthesize"],
    getList: ["get", "https://texttospeech.googleapis.com/v1/voices"],
}

async function callAPI(endpoint, data) {
    let [method, url] = URLS[endpoint];
    let token = await TOKEN_GENERATOR();
    const response = await axios({
        url: url,
        method: method,
        headers: {
            "Authorization": `Bearer ${token}`,
            "X-Goog-User-Project": PROJECT_ID,
            'Content-Type': 'application/json; charset=utf-8',
        },
        data: data,
    });

    return response;
}


/** 
 * @param {string} text
 * @param {string} langauge
 * @param {string} voiceName
 * @param {string} encodingType
 * 
 * @return {Promise<{audioContent: string}>}
 */
async function textToSpeach(text, langauge, voiceName, encodingType = "MP3") {
    const data = {
        "input": {text},
        "voice": {
            "languageCode": langauge,
            "name": voiceName,
        },
        "audioConfig": {
            "audioEncoding": encodingType,
        }
    }

    const res = await callAPI("getSpeach", data);
    return res.data;
}

/**
 * @return {Promise<{voices: {languageCodes: string[], name: string, smmlGender: ('FEMALE'|'MALE'), naturalSampleRateHertz: 24000}[]}>}
 */
async function listVoices() {
    const res = await callAPI("getList");
    return res.data;
}


/** @param {() => Promise<string>} tokenGen */
function setTokenGenerator(tokenGen){
    TOKEN_GENERATOR = tokenGen;
}

module.exports = {listVoices, textToSpeach, setTokenGenerator}