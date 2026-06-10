/** 
    * @typedef {Object} AuthData 
    * @property {import("firebase-admin/auth").DecodedIdToken} token
    * @property {string} uid
 */

const axios = require("axios");
const { onCall } = require("firebase-functions/v2/https");
const { db } = require("../firebase.js");
const { debug } = require("firebase-functions/logger");
const { validateData, isNonNullObject} = require("../Shared/shared.js");
const { ActionHistory } = require("./actions.js");
const { formatReport } = require("./format-report.js");
const { JobsClient } = require('@google-cloud/run').v2;

const project = "eyesee-d0a42";
const location = "asia-southeast1";


const MAX_OUTPUT_TOKENS = 1000;

/**
 * @type {Array.<({data: ?{text: string}, auth: ?AuthData}) => Promise>}
 */
const VALIDATORS = [
    async ({auth}) => {
        if (!isNonNullObject(auth)) {
            return "User not authenticated";
        }
    },

    async ({data}) => {
        if (!isNonNullObject(data) || !("sid" in data)) {
            return "No results data provided.";
        }
    },
    async ({data}) => {
        let {sid} = data;
        let quizData = await db.ref(`session-data/${sid}/quiz`).get();
        if (!quizData.exists()) {
            return "No quiz results found for the provided session ID.";
        }

        quizData = quizData.val();

        if (!quizData.state || !quizData.state.actions) {
            return "No quiz actions found in the provided session data.";
        }

        data.quizData = quizData;
    },
]

/**
 * @param {import("./actions.js").QuizResults} results
 * @returns {Promise<string>}
 */
async function summarise(results) {
     let response = await axios.post('https://api.openai.com/v1/chat/completions', 
        {
            "model": "gpt-4o",
            "messages": [
                {"role": "system", "content": `You are a helpful assistant that summarises quiz results. A user has participated in a quiz, each interaction they have made with the quiz has been recorded in this csv table:\n${results.actions_csv}\n\nThe results of the quiz are presented in this table:\n${results.results_csv}\n\nPlease provide a summary of the quiz results. Format in a latex style without a section header, so that it can be inserted in a report template. The summary should be concise and informative, highlighting key points and trends in the data.`},
            ],
            max_completion_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.2,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + process.env.OPEN_AI_API_KEY,
            },
        }
    )
    return response.data?.choices[0]?.message?.content;
}

/**
 * @param {string} sid session ID
 * @param {Promise<void>} 
 */
async function processTex(sid) {
    // Instantiates a client
    const runClient = new JobsClient();

    const parent = `projects/${project}/locations/${location}/jobs/tex2pdf`;

    // Pass sessionID as an environment variable
    const [operation] = await runClient.runJob({
        name: parent,
        overrides: { 
            taskCount: 1,
            containerOverrides: [{
            env: [{ name: "SESSION_ID", value: sid }],
            }],
        },
    });
    await operation.promise();
}



async function onSummariseCall(req) {
    let errors = [];
    if (await validateData(req, VALIDATORS, errors)) {
        try {
            const { data: {quizData, sid, onlySummary} } = req;

            if (!quizData.processing) {
                // Set the quiz data to processing state
                await db.ref(`session-data/${sid}/quiz/proccessing`).set(true);


                // Get the quiz results
                let actions = ActionHistory.parse(quizData.state.actions);
                let results = actions.getResults(quizData.state.quiz);

                let {summary} = quizData
                if (!summary) {
                    // Prepare the AI summary and store it in the database
                    summary = `AI summary is temporarily unavailable.` //await summarise(results);
                    await db.ref(`session-data/${sid}/quiz/summary`).set(summary);
                }
                results.summary = summary;

                if (!onlySummary && !quizData.pdf) {
                    // Create a latex report
                    let tex = formatReport(results);
                    await db.ref(`session-data/${sid}/quiz/tex`).set(tex);            

                    // Process the tex to pdf
                    await processTex(sid);
                }

                // Porcessing is done, set the quiz to not processing
                await db.ref(`session-data/${sid}/quiz/proccessing`).set(false);
            }

        } catch (e) {
            await db.ref(`session-data/${req.data.sid}/quiz/proccessing`).set(false);
            errors.push("Unexpected error occured " + e);
        }
    } 

    if (errors.length > 0) {
        debug("QUIZZES: The quiz summary was unsuccessfull: ", errors)
    } else {
        debug("QUIZZES: Successfully summarised quiz results.");
    }

    return {errors}
}

module.exports = {
    summarise: onCall({
            region: "australia-southeast1"
    },onSummariseCall)
}
// Run terminal cmd: firebase deploy --only functions:quizzesSummarise