
/**
 * @typedef {Object} Answer
 * @property {string} title
 * @property {string} subtitle
 * @property {?string} image
 * @property {boolean} correct
 * @property {string} color
 * 
 * 
 * @typedef {Object} Question
 * @property {string} question
 * @property {?string} image
 * @property {number} n_answers
 * @property {Answer[]} answers
 * 
 * 
 * @typedef {Object} Quiz
 * @property {string} name
 * @property {boolean} public
 * @property {number} n_questions
 * @property {Question[]} questions
 * @property {string} owner
 * @property {string} [ownerName]
 * @property {boolean} [owned]
 * @property {string} [qid]
 */

const {onCall} = require("firebase-functions/v2/https");
const { debug } = require("firebase-functions/logger");
const { validateData, isNonNullObject, refPath} = require("../Shared/shared.js");
const { Usage } = require("../usage.js");
const { getUsersMaxTier } = require("../Licences/shared.js");

function quizesRef(...args){
    return refPath("quizes", args)
}

const MAX_TITLE_LENGTH = 1024;
const MAX_MULTI_LENGTH = 4 * 1024;
const MAX_QUESTIONS = 50;
const MAX_ANSWERS = 9;
const COLORS = new Set([
    "light-red",
    "light-orange",
    "light-gold",
    "light-green",
    "light-teal",
    "light-blue",
    "light-indigo",
    "light-purple",
    "dark-red",
    "dark-orange",
    "dark-gold",
    "dark-green",
    "dark-teal",
    "dark-blue",
    "dark-indigo",
    "dark-purple",
    "white"
])
const {isArray} = Array;
const isString = (s) => typeof s === "string";
const isValidString = (s, key, max, emptyAllowed = false) => {
    if (!isString(s)) {
        throw key + " was not of type string.";
    } else if (s.length == 0 && !emptyAllowed){
        throw key + " was left empty."
    } else  if (s.length > max) {
        throw key + " exceeds the maximum characters: " + max + ".";
    }
}
const ANSWER_VALIDATER = {
    title: (title) => {
        isValidString(title, "Title", MAX_TITLE_LENGTH);
        return title;
    },
    subtitle: (subtitle) => {
        isValidString(subtitle, "Subtitle", MAX_MULTI_LENGTH, true);
        return subtitle;
    },
    utterance: (utt) => {
        if (isString(utt) && utt.length > 0 && utt.length < MAX_MULTI_LENGTH) {
            return utt;
        } else {
            return null;
        }
    },
    image: (img) => {
        if (isString(img) && img.length > 0) {
            return img
        } else {
            return null;
        }
    },
    color: (color) => {
        if (COLORS.has(color)) {
            return color;
        } else {
            throw "Not a valid color";
        }
    },
    correct: (pub) => {
        return !!pub;
    }
}
const QUESTION_VALIDATER = {
    question: (question) => {
        isValidString(question, "Question", MAX_MULTI_LENGTH);
        return question;
    },
    utterance: (utt) => {
        if (isString(utt) && utt.length > 0 && utt.length < MAX_MULTI_LENGTH) {
            return utt;
        } else {
            return null;
        }
    },
    image: (img) => {
        if (isString(img) && img.length > 0 && img.length < MAX_MULTI_LENGTH) {
            return img
        } else {
            return null;
        }
    },
    answers: (answers) => {
        if (!isArray(answers)) {
            throw "Answers is not an array."
        } else if (answers.length == 0) {
            throw "No answers."
        } else if (answers.length > MAX_ANSWERS) {
            throw "There are to many answers."
        } else { 
            return answers.map(a => validate(a, ANSWER_VALIDATER, "Answer"))
        }
    }
}
const QUIZ_VALIDATER = {
    name: (name) => {
        isValidString(name, "Name", MAX_TITLE_LENGTH)
        return name;
    },
    public: (pub) => {
        return !!pub;
    },
    questions: (questions) => {
        if (!isArray(questions)) {
            throw "Questions is not an array."
        } else if (questions.length == 0) {
            throw "No questions."
        } else if (questions.length > MAX_QUESTIONS) {
            throw "There are to many questions."
        } else { 
            return questions.map(q => validate(q, QUESTION_VALIDATER, "Question"))
        }
    },
}
function validate(data, validater, key = "Data") {
    if (typeof data !== "object" || data === null) throw key + " was not object."
    let newData = {}
    for (let key in validater) {
        newData[key] = validater[key](data[key], data);
    }
    return newData;
}



/**
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const REQUEST_VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return "You are not authenticated";
        }
    },
    async ({auth}) => {
        if ((await getUsersMaxTier(auth.uid) === 0)) {
            return "You do not have a licence";
        }
    },
    async ({data}) => {
        if (!isNonNullObject(data)) {
            return "No results data provided.";
        }
    },
    async ({data, auth: {uid}}) => {
        let {qid} = data;
        let qidRef = null;

        // If the quiz id is a non empty string check to see if 
        // a quiz exists with that name.
        if (isString(qid) && qid.length > 0) {
            qidRef = quizesRef(qid)
            let data = await qidRef.get();

            // If the quiz does not exist then we will create a new
            // quiz id. Similarly if quiz is not owned by the user 
            // then create a new quiz id.
            if (!data.exists() || data.val().owner !== uid) {
                qid = null;
            } 
        } else {
            qid = null;
        }

        // Create new quiz id.
        data.isNew = (qid === null);
        if (qid === null) {
            qidRef = quizesRef().push();
            qid = qidRef.key;
        }

        // Store quiz id and reference.
        data.qid = qid;
        data.qidRef = qidRef;
    },

    async ({data}) => {
        let {quiz} = data;
        if (!isNonNullObject(quiz)) {
            return "Invalid quiz object"
        } else {
            try {
                quiz = validate(quiz, QUIZ_VALIDATER);
                data.quiz = quiz;
            } catch (e) {
                return e + "";
            }
        }
    },
]

/**
 * @param {{auth: import("./quizzes-summarise.js").AuthData, data: {quiz: Quiz, qid: string, qidRef: import("firebase-admin/database").Reference}}} req
 */
async function addQuiz(req) {
    let errors = [];
    let quizID = null;
    if (await validateData(req, REQUEST_VALIDATORS, errors)) {
        let {auth: {uid}, data: {quiz, qid, qidRef, isNew}} = req;

        if (isNew) {
            let usage = new Usage();
            await usage.initialise();

            let userUsage = await usage.getUserUsage(uid);
            if (userUsage.used.files >= userUsage.available.files) {
                errors.push(`You have reached your file usage limit.`);
            } else {
                debug(`QUIZZES: User ${uid} addedd quiz.`, quiz, qid, qidRef)
                quiz.owner = uid;
                
                await Promise.all([
                    qidRef.set(quiz),
                    usage.updateUserUsage(uid, {
                        quizzes: 1,
                        files: 1,
                    })
                ]);
                quizID = qid;
            }
        } else {
            debug(`QUIZZES: User ${uid} update quiz.`, quiz, qid, qidRef)
            await qidRef.update(quiz);
            quizID = qid;
        }
    }

    return {errors, quizID}
}

module.exports = {
    add: onCall({
            region: "australia-southeast1"
    },addQuiz)
}