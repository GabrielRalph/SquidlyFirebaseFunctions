const { fstore } = require("../../functions/firebase");

async function removeUtterancesFor(voiceName) {

    // Search for all utterances with the name field ending with the voiceName
    const utteranceSnapshot = await fstore.collection("utterances")
        .where("name", ">=", voiceName)
        .where("name", "<", voiceName + "\uf8ff")
        .get();

    if (utteranceSnapshot.empty) {
        console.log(`No utterances found for voice: ${voiceName}`);
        return;
    }

    // Log the utterances to be deleted
    console.log(`Found ${utteranceSnapshot.size} utterances for voice: ${voiceName}`);
    utteranceSnapshot.forEach(doc => {
        console.log(`- ${doc.id}: ${doc.data().name}`);
    });

    // Delete the utterances
    const batch = fstore.batch();
    utteranceSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${utteranceSnapshot.size} utterances for voice: ${voiceName}`);

}

removeUtterancesFor("minjun").then(() => {}).catch(err => {
    console.error("Error removing utterances:", err);
}).finally(() => {
    process.exit(0);
});