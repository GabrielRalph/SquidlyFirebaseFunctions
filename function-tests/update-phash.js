const { fstore } = require("../functions/firebase");
const { img2png, phashHex } = require("../functions/GridSymbols/gridSymbols-upload");
const fs = require("fs");
const EMBEDDING_IMAGE_SIZE = 300;

async function downloadImageAndComputePHash(imageUrl, saveForTesting = false) {
    try {
        // Download the image from the URL
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        const imageData = Buffer.from(buffer);

        // Convert the image to PNG format
        const pngImageData = await img2png(imageData);

        // Compute the pHash of the image
        const pHash = await phashHex(pngImageData);

        if (saveForTesting) {
            // Save the PNG image to a file for testing purposes
            fs.writeFileSync("test.png", pngImageData);
        }
        return pHash;
    } catch (error) {
        console.error('Error downloading image or computing pHash:', error);
        throw error;
    }
}

async function updateIcon(doc) {
    const data = doc.data();
    if (!data.url) {
        console.warn(`Document ${doc.id} does not have a URL field.`);
        return;
    }
    const oldPhash = data.phash || null;
    try {
        const pHash = await downloadImageAndComputePHash(data.url);
        await doc.ref.update({ phash: pHash });
        // console.log(`${doc.id}: ${oldPhash} -> ${pHash}`);
    } catch (error) {
        console.error(`Failed to update document ${doc.id}:`, error);
    }
}

async function updateSVGPhashes() {
    const url = "https://firebasestorage.googleapis.com/v0/b/eyesee-d0a42.appspot.com/o/icons%2Fall%2FGTPjL0fX2FVPgkFUzApN?alt=media&token=6005b149-97bb-48d8-a5ed-1ef891f59147";
    const phash = await downloadImageAndComputePHash(url, true);
    const snap = await fstore.collection("icons").select("url", "phash").get()
    console.log(`Found ${snap.size} SVG icons to update.`);
    let promBatch = [];
    for (const doc of snap.docs) {
        promBatch.push(updateIcon(doc));
        if (promBatch.length >= 100) { // Limit concurrent updates to 5
            await Promise.all(promBatch);
            console.log(`Updated ${promBatch.length} SVG icons.`);
            promBatch = [];
        }
    }
    if (promBatch.length > 0) {
        await Promise.all(promBatch);
        console.log(`Updated ${promBatch.length} SVG icons.`);
        
    }
    console.log("SVG pHash update completed.");
}

updateSVGPhashes().then(() => {
    console.log("All done.");
}).catch((error) => {
    console.error("Error updating SVG pHashes:", error);
});