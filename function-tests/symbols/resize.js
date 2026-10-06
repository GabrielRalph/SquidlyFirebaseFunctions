const { resizeImageToFileSize, testAVIF } = require("../../functions/Shared/images");
const fs = require("fs");


function logMemory(label = '') {
    const m = process.memoryUsage();

    console.log(`Memory ${label}:`, {
        rss: `${(m.rss / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(m.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(m.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        external: `${(m.external / 1024 / 1024).toFixed(1)} MB`,
        arrayBuffers: `${(m.arrayBuffers / 1024 / 1024).toFixed(1)} MB`,
    });
}


async function test() {
    logMemory('at start of test');
    const files = fs.readdirSync("./data/test-images/in"); // replace with your directory containing images
    logMemory('after reading files');
  
    for (const file of files) {
    if (!file.endsWith("avif")) continue; // skip macOS system files
        const buffer = fs.readFileSync(`./data/test-images/in/${file}`);
        console.log(`\n\nProcessing file: ${file}`);
        try {
            // const [newBuffer, metadata] = await resizeImageToFileSize(buffer, 20000);
            const [newBuffer, metadata] = await testAVIF(buffer);
            fs.writeFileSync(`./data/test-images/out/${file}.${metadata.format}`, newBuffer);
        } catch (err) {
            console.error(`Failed to process file: ${file}`, err);
        }
        // try {
        //     const type = await getType(buffer);
        //     const rgb = await img2rgb(buffer, type, 512);
        //     fs.writeFileSync(`./data/test-images/rgb/${file}.png`, rgb);
        // } catch (err) {
        //     console.error(`Failed to process RGB for file: ${file}`, err);
        // }
    } 
}
test().then(() => {
    console.log("Test completed successfully");
}).catch((err) => {
    console.error("Test failed", err);
});