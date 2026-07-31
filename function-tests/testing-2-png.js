const { img2png, img2rgb } = require("../functions/GridSymbols/shared");
const fs = require("fs");
const { uploadIcon } = require("../functions/GridSymbols/uploadIcon");
const { fstore } = require("../functions/firebase");
const data = fs.readFileSync("data/music-score.svg");
async function test() {
    const snap = await fstore.collection("icons").select("name").get()
    console.log(`Found ${snap.size} icons to update.`);
    let updates = []
    for (const doc of snap.docs) {
        const data = doc.data();
        const name = data.name;
        const searchName = name.trim().toUpperCase().replace(/\s+/g, "_");
        if (name !== searchName) {
            console.log(`Updating ${doc.id}: ${name} -> ${searchName}`);
            updates.push(doc.ref.update({
                name: searchName,
                title: name,
            }));

            if (updates.length >= 100) {
                await Promise.all(updates);
                console.log(`Updated ${updates.length} icons.`);
                updates = [];
            }
        }
    }
}


        
    // await uploadIcon({
    //     dataBuffer: data.toString("base64"),
    //     name: "music",
    //     public: true,
    //     similaritySearch: true,
    //     isTest: true,
    //     uid: "s6NoggwP78XlE7LtWnu5Q38VbF32",
    // })
test().then(() => {
    console.log("Upload test completed");
}).catch(err => {
    console.error("Upload test failed:", err);
});