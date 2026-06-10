/**
 * @typedef {Object} GTopicDescriptor
    * @property {string} name
    * @property {GridSize} size
    * @property {string} topicUID
    * @property {boolean} owned
    * @property {boolean} public
    * @property {string} ownerName
    * @property {string} owner
 * 
 * 
 * @typedef {Object} AuthData 
    * @property {import("firebase-admin/auth").DecodedIdToken} token
    * @property {string} uid
 */

const {onCall} = require("firebase-functions/v2/https");
const {getUserLicence, db} = require("../firebase.js");
const { debug } = require("firebase-functions/logger");
const { validateData, isNonNullObject} = require("../Shared/shared.js");


const SEARCH_SIZE_LIMIT = 512;


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
        if (!(await getUserLicence(auth.uid))) {
            return "User does not have a licence";
        }
    },
    async ({data}) => {
        if (!isNonNullObject(data) || !("text" in data)) {
            return "No search data provided.";
        }
    },
    async ({data}) => {
        if (typeof data.text !== "string" || data.text.length == 0 || data.text.length > SEARCH_SIZE_LIMIT) {
            return `Search phrase must be a non empty string, no more than ${SEARCH_SIZE_LIMIT} characters long.`
        }
    }
]

/**
 * @param {{text: string}} data
 * @param {AuthData} auth
 */
async function searchTopics(data, auth) {
    let valid = true;
    let errors = [];
    let results = [];
    
    // Valid auth and data.
    valid = await validateData({auth,data}, VALIDATORS, errors)

    // Auth and data was validated.
    if (valid) {

        debug("GRID-TOPICS: Search topics for", data.text)
    
        try {
            let searchPhrase = data.text;
            let snapshot = await db.ref("grid-topics").orderByChild("name").startAt(searchPhrase).endAt(searchPhrase + "~").get();
            let topics = snapshot.val();


            if (topics !== null) {
                // Convert to array and store keys in topics
                topics = Object.keys(topics).map(topicUID => {
                    let topic = topics[topicUID]
                    topic.topicUID = topicUID;
                    return topic;
                })
            
                // Remove private unonwed topics.
                topics = topics.filter(topic => topic.public || topic.owner === auth.uid);
            
                // Retreive onwer names from database.
                let topicOwners = [...new Set(topics.map(topic => topic.owner))];
                let nameByID = {}
                await Promise.all(topicOwners.map(async uid => {
                    // Display Name
                    let name = (await db.ref(`users/${uid}/info/displayName`).get()).val();
                    // Otherwise first and last name
                    if (name == null) {
                        let names = await Promise.all([
                            db.ref(`users/${uid}/info/firstName`).get(), 
                            db.ref(`users/${uid}/info/lastName`).get()
                        ]);
                        name = names.filter(n => n!=null).join(" ");
                    }
                    nameByID[uid] = name;
                }));
            
                // Get topic infor from topics
                results = topics.map(topic => {
                    return {
                        public: topic.public,
                        ownerName: nameByID[topic.owner],
                        owned: topic.owner == auth.uid,
                        owner: topic.owner,
                        topicUID: topic.topicUID,
                        size: topic.size,
                        name: topic.name,
                    }
                })

            } else {
                debug("GRID-TOPICS: No topics found.")
                errors.push("No topics found.")
                valid = false;
            }
        
        } catch (e) {
            debug("GRID-TOPICS: An error occured searching", e)
            errors.push(e + "");
            valid = false;
        }
    } else {
        debug("GRID-TOPICS: Search topics invalid auth or data", errors.join(", "))
    }

    if (valid) {
        debug(`GRID-TOPICS: Search topics was successfull with ${results.length} results.`)
    }

    return {valid, errors, results};
}

module.exports = {
    search: onCall({
        region: "australia-southeast1"
    },async ({auth, data}) => {
        return await searchTopics(data, auth);
    }),
}