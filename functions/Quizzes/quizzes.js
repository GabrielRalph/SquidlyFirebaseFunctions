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

const { onValueWritten } = require("firebase-functions/database");
const { Usage } = require("../usage.js");


module.exports = {
    summarise: require("./quizzes-summarise.js").summarise,
    add: require("./quizzes-add.js").add,
    onDelete: onValueWritten({
        ref: "quizes/{qid}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1"
    }, async ({data: {before, after}}) => {
        if (before.exists() && !after.exists()) {
            let ownerUID = before.val().owner;
            await Usage.updateUserUsage(ownerUID, {
                quizzes: -1,
                files: -1
            });
        }
    })
}