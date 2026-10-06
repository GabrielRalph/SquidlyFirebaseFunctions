const inquirer =  require('inquirer');
const { textToSpeach } = require('../../functions/Utterances/textToSpeachAPI');
const fs = require('fs');


async function text2SpeachTest() {
    res = await inquirer.default.prompt([
            {
            type: "input",
            name: "text",
            message: "Text to convert to speech:",
            default: null,
        },
        {
            type: "input",
            name: "lang",
            message: "Language code (e.g., en-US):",
            default: "en-US",
        },
        {
            type: "input",
            name: "voice",
            message: "Voice name (e.g., en-US-Wavenet-D):",
            default: "en-US-Wavenet-D",
        },
        {
            type: "input",
            name: "output",
            message: "Output file name:",
            default: "output.mp3",
        }
    ]);
    let {text, lang, voice, output} = res;
    
    let t2sRes = await textToSpeach(text, lang, voice);
    let audio_64 = t2sRes.audioContent;
    let audio = Buffer.from(audio_64, 'base64'); 
    fs.writeFileSync(output, audio);
}

text2SpeachTest().then(() => {
    console.log("\n\nSuccess.");
}).catch(err => {
    console.error("\n\nFailed.\n\n", err);
}).finally(() => {
    process.exit(0);
});