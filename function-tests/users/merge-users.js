// const admin = require('firebase-admin');

const { Auth, db } = require("../../functions/firebase");

// Initialize the Firebase Admin SDK
// admin.initializeApp();
const email = "brandon.yeo@cerebralpalsy.org.au"
const oldUID = "44VLRJ7aBBX2DQhB4t66h4GQ6Gt1"
const newUID = "r3lDzaxpNBSNtNu9NSnnvVycq9G2"

async function test() {
    // Update user data
    let userData = (await db.ref(`users/${oldUID}`).get()).val();
    if (userData) {
        await db.set(db.ref(`users/${newUID}`), userData);
    }

    // Update quizzes
    const quizes = (await db.ref(`quizes`).get()).val();
    for (const quizID in quizes) {
        const quiz = quizes[quizID];
        if (quiz.owner === oldUID) {
            console.log(`Updated quiz ${quiz.name}[${quizID}] creator to ${newUID}`);
            await db.ref(`quizzes/${quizID}/owner`).set(newUID);
        }
    }


    // Update grid topics
    const gridTopics = (await db.ref(`grid-topics`).get()).val();
    for (const topicID in gridTopics) {
        const topic = gridTopics[topicID];
        if (topic.owner === oldUID) {
            console.log(`Updated grid topic ${topic.name}[${topicID}] creator to ${newUID}`);
            await db.ref(`grid-topics/${topicID}/owner`).set(newUID);
        }
    }


    // Update sessions
    const sessions = (await db.ref(`sessions`).get()).val();
    for (const sessionID in sessions) {
        const session = sessions[sessionID];
        if (session.hostUID === oldUID) {
            console.log(`Updated session [${sessionID}] creator to ${newUID}`);
            await db.ref(`sessions/${sessionID}/hostUID`).set(newUID);
        }
    }
}



test().then(() => {
    console.log("Test completed successfully.");
}).catch(err => {
    console.error("Test failed:", err);
}).finally(() => {
    console.log("Test attempt completed.");
    process.exit(0);
});