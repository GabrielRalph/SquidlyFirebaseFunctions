const { resizeImageToFileSize, img2rgb, getType } = require("../../functions/Shared/images");
const fs = require("fs");
const { uploadSymbol } = require("../../functions/Symbols/upload");

const symbolUploadScopes = [
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Fořest-",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.avif",
    // },
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Dolphinś",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.bmp",
    // },
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Driving_In_Car",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.png",
    // },
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Woods##",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.jpeg",
    // },
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Flag of north somewhereland",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.svg",
    // },
    // // {
    // //     uid: process.env.GABRIELS_UID,
    // //     name: "Mountain_View",
    // //     public: Math.random() < 0.5,
    // //     isTest: true,
    // //     srcFilename: "./data/test-images/in/test.tiff",
    // // },
    // {
    //     uid: process.env.GABRIELS_UID,
    //     name: "Mountains",
    //     public: Math.random() < 0.5,
    //     isTest: true,
    //     srcFilename: "./data/test-images/in/test.webp",
    // },
    {
        uid: process.env.GABRIELS_UID,
        name: "My Lounge",
        public: Math.random() < 0.5,
        isTest: true,
        srcFilename: "./data/test-images/in/test.heic",
    }
]


async function test() {

    for (const scope of symbolUploadScopes) {
        console.log(`\n\n\nUploaded symbol: ${scope.name}\n`);
        await uploadSymbol(scope);
        if (scope.error) {
            console.error(`Failed to upload symbol: ${scope.name}`, scope.error);
        }
    }
}
test().then(() => {
    console.log("Test completed successfully");
}).catch((err) => {
    console.error("Test failed", err);
});