const {textToSpeach, setTokenGenerator} = require("./textToSpeachAPI.js")
const {admin, fstore, sb, getUserLicence} = require("../firebase.js");
const { getDownloadURL } = require("firebase-admin/storage");
const { debug } = require("firebase-functions/logger");
const { validateData, parallelChucks, isNonNullObject, tempUsersRef } = require("../Shared/shared.js");
const { onCall } = require("firebase-functions/https");
const { getUsersMaxTier } = require("../Licences/shared.js");

const UtterancesRef = fstore.collection("utterances");
const SEARCH_LIMIT = 500;
const MAX_CONCURENT = 100;
const MAX_PHRASE_LENGTH = 255;
const MY_VOICES = {
    margaret: ["en-GB", "en-GB-Standard-N", "GB"],
    jane: ["en-GB", "en-GB-Standard-A", "GB"],
    peter: ["en-GB", "en-GB-Standard-B", "GB"],
    charles: ["en-GB", "en-GB-Standard-O", "GB"],
    sarah: ["en-AU", "en-AU-Standard-C", "AU"],
    lachlan: ["en-AU", "en-AU-Standard-D", "AU"],
    jeffrey: ["en-US", "en-US-Standard-D", "US"],
    theo: ["en-US", "en-US-Standard-I", "US"],
    lucy: ["en-US", "en-US-Standard-C", "US"],
    holly: ["en-US", "en-US-Standard-F", "US"],
    
    রানী: ["bn-IN", "bn-IN-Standard-A", "IN"],
    প্রদীপ: ["bn-IN", "bn-IN-Standard-B", "IN"],
    ফুয়াদ: ["bn-IN", "bn-IN-Chirp3-HD-Sadachbia", "IN"],
    ফাতেমা: ["bn-IN", "bn-IN-Chirp3-HD-Sulafat", "IN"],

    다빈: ["ko-KR", "ko-KR-Chirp3-HD-Zephyr", "KR"],
    소영:["ko-KR", "ko-KR-Standard-B", "KR"],
    민재: ["ko-KR", "ko-KR-Chirp3-HD-Umbriel", "KR"],
    병준: ["ko-KR", "ko-KR-Standard-C", "KR"],

    louis: ["fr-FR","fr-FR-Chirp3-HD-Charon", "FR"],
    amélie: ["fr-FR","fr-FR-Chirp3-HD-Sulafat", "FR"],
    etienne: ["fr-FR","fr-FR-Standard-G", "FR"],
    julia: ["fr-FR","fr-FR-Standard-F", "FR"],
}

setTokenGenerator(async () => (await admin.credential.applicationDefault().getAccessToken()).access_token)


/**
 * @param {string} phrase
 * @param {string} voiceName
 * 
 * @return {Promise<{errors: string[], url: ?string, utterenceID: ?null}>}
 */
async function createUtterance(phrase, voiceName) {
    let utteranceID = null;
    let utteranceRef = null;
    let url = null;
    let errors = []
    let success = true;

    let name = voiceName + "-" + phrase
    let [langauge, voice] = MY_VOICES[voiceName];

    // Create Firestore Reference
    try {
        utteranceRef = await UtterancesRef.add({name});
        utteranceID = utteranceRef.id;
    } catch (e) {
        const msg = "Creating Utterance: An error occured whilst creating firestore reference.";
        errors.push(msg);
        debug("UTTERANCES:", msg, e);
        success = false;
    }

    if (success) {
        // Get audio data from text-to-speach API
        let audio = null;
        try {
            audio = (await textToSpeach(phrase, langauge, voice)).audioContent;
            audio = Buffer.from(audio, 'base64'); // Ta-da
        } catch (e) {
            const msg = "Creating Utterance: An error occured calling the text-to-speach API.";
            errors.push(msg);
            debug("UTTERANCES:", msg, e);
            success = false;
        } 

        // If successful save data in firebase storage.
        if (success) {
            try {
                const file = sb.file(`utterances/${utteranceID}`);
                await file.save(audio, {
                    metadata: {
                        contentType: "audio/mpeg",
                    }
                });
                url = await getDownloadURL(file);
            } catch (e) {
                const msg = "Creating Utterance: An error occured whist saving the audio data.";
                errors.push(msg);
                debug("UTTERANCES:", msg, e);
                success = false;
            }
        }
    }
    
    if (success) {
        try {
            await utteranceRef.update({url})
        } catch (e) {
            const msg = "Creating Utterance: An error occured whilst updating url.";
            errors.push(msg);
            debug("UTTERANCES:",msg, e);
            success = false;
        }
    } else if (utteranceRef != null){
        try {
            await utteranceRef.delete();
        } catch (e) {
            const msg = "Creating Utterance: An error occured whilst cleaning broken utterance NOT GOOD ERROR.";
            errors.push(msg);
            debug("UTTERANCES:",msg, e);
            success = false;
        }
    }

    return {errors, url, utteranceID};
}



/**
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return "User not authenticated";
        }
    },
    async ({auth}) => {
        let a = async () => (await getUsersMaxTier(auth.uid) != 0);
        let b = async () => (await tempUsersRef(auth.uid).get()).exists();
        let [licence, tempUser] =  await Promise.all([a(), b()])
        if (!(licence || tempUser)){
            return "User does not have a licence";
        }
    },
    async ({data}) => {
        if (!isNonNullObject(data)) {
            return "No search data provided.";
        }
    },
    async ({data}) => {
        if (!Array.isArray(data.phrases)) {
            return `Search phrases must be an array.`
        }
    },
    async ({data}) => {
        if (typeof data.voiceName !== "string" || !(data.voiceName in MY_VOICES)) {
            return `The voice name is not valid.`
        }
    },
    async ({data}) => {
        if (data.phrases.length == 0) return "Empty list of phrases";
        if (data.phrases.length > SEARCH_LIMIT) return `Only ${SEARCH_LIMIT} phrases can be retreived at once.`
    },
    async ({data}) => {
        let isValid = data.phrases.map(p => typeof p === "string" && p.length > 0 && p.length < MAX_PHRASE_LENGTH);
        if (!isValid.reduce((a, b) => a && b)) return "Some phrases where invalid."
    },
]


async function getWhere(allNames, ref) {
    let nGroupsOf25 = Math.ceil(allNames.length / 25);
    let groups = []
    for (let i = 0; i < nGroupsOf25; i++) {
        let start = i * 25;
        let end = start + 25;
        end = end > allNames.length ? allNames.length : end;
        let group = allNames.slice(start, end);
        groups.push(group);
    }
    
    let all = await Promise.all(groups.map(async g => {
        let snapshot = await ref.where("name", "in", g).get();
        return snapshot.docs.map(d => [d.get("name"), d.get("url")]);
    }));

    all = all.flat();

    return all;
}


async function getUtterances(data, auth) {
    let utterances = {};
    let errors = [];

    // validate data
   if (await validateData({data, auth}, VALIDATORS, errors)) {
       let {phrases, voiceName} = data;

       phrases = phrases.map(p => p.trim().toLowerCase());
    
       // Get the name for each pharse 
       let nameToPhrase = {};
       phrases.forEach(p => {
           let name = voiceName+"-"+p;
           nameToPhrase[name] = p;
       });
       let allNames = Object.keys(nameToPhrase);
    //    debug("Getting utterences " + allNames.join(", "))
    
       try {
           // Get all utterances allready contained in the database.
           let all = await getWhere(allNames, UtterancesRef);
    
           // Get name of each fetched utterance and store url 
           // in utterances result object.
           let fetchedNames = new Set(all.map(([name, url]) => {
               utterances[nameToPhrase[name]] = {url}
               return name;
           }));

        //    debug("Fetched utterences " + [...fetchedNames].join(", "))
       
           // Get a list of all names that where not fetched
           let missingNames = allNames.filter(name => !fetchedNames.has(name));

           debug("UTTERANCES: Creating uetterances " + missingNames.join(", "))

           // Create utterances for all missing names
           if (missingNames.length > 0) {
               let promFuncs = missingNames.map(name => {
                   return async () => {
                       let res = await createUtterance(nameToPhrase[name], voiceName);
                       utterances[nameToPhrase[name]] = res;
                   }
               })
            
               await parallelChucks(promFuncs, MAX_CONCURENT);
           }
       } catch (e) {
           debug("UTTERANCES: An error occured getting/creating utterances", e);
           errors.push("Failed to get utterances " + e);
       }
   }

   return {utterances, errors}
}

module.exports = {
    get: onCall({
        region: "australia-southeast1"
    },async ({auth, data}) => {
        return await getUtterances(data, auth);
    }),
}