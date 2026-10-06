const phash = require("sharp-phash");
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const sharpBMP = require('sharp-bmp'); // Swapped to sharp-bmp

const EMBEDDING_IMAGE_SIZE = 300;
const MIMETYPE_KEY = {
    "image/bmp": "bmp",
    "image/emf": "emf",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/heic": "heic",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "png": "png",
    "jpeg": "jpeg",
    "jpg": "jpeg",
    "bmp": "bmp",
    // "emf": "emf",
    "heic": "heic",
    "heif": "heic",
    "svg": "svg",
    "webp": "webp",
}
const FORMAT_2_MIMETYPE = {
    "bmp": "image/bmp",
    // "emf": "image/emf",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "heic": "image/heic",
    "png": "image/png",
    "svg": "image/svg+xml",
    "webp": "image/webp",
    "heif": "image/heic",
}

const MAX_QUALITY_DROP = 30;
const SIZE_SCALE_OF_MAX_QUALITY_DROP = 5;
const FORMAT_2_QUALITY_KEY = {
    jpeg: "quality",
    jpg: "quality",
    webp: "quality",
}

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

const CONVERSION_TYPES = {
    svg: async (buffer) => {
        return await sharp(buffer)
            .resize({ width: 4000 }) // you can adjust the width as needed
            .toBuffer();
    },
    heic: async (buffer) => {
        return await heicConvert({
            buffer,
            format: 'JPEG',
            quality: 1.0 
        });
    },
    bmp: async (buffer) => {
        const bitmap = sharpBMP.decode(buffer);

        // Feed the raw pixel data directly into Sharp
        const pipe = sharp(bitmap.data, {
            raw: {
                width: bitmap.width,
                height: bitmap.height,
                channels: 4
            }
        })
        if (bitmap.is_with_alpha) {
            return await pipe.png().toBuffer();
        } else {
            return await pipe.jpeg({ quality: 100 }).toBuffer();
        }
    }
}
CONVERSION_TYPES.heif = CONVERSION_TYPES.heic;

/**
 * Converts image at url to png base64 encoded string
 * @param {Promise<Buffer>} dataBuffer
 * @param {string} type
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function img2png(dataBuffer, type, size = EMBEDDING_IMAGE_SIZE) {
    if (type in CONVERSION_TYPES) {
        dataBuffer = await CONVERSION_TYPES[type](dataBuffer);
    }

    const imgbuff = await sharp(dataBuffer)
    .resize(size)
    .png()
    .toBuffer();
    return imgbuff;
}

/**
 * Converts image at url to RGB base64 encoded string
 * @param {Promise<Buffer>} imageBuffer
 * @param {string} type
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function img2rgb(imageBuffer, type, size = EMBEDDING_IMAGE_SIZE) {
    if (type in CONVERSION_TYPES) {
        imageBuffer = await CONVERSION_TYPES[type](imageBuffer);
    }

    imageBuffer = await sharp(imageBuffer)
        .resize(size, size, { fit: 'inside' })
        .toBuffer();

    const backgrounds = [
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 },
    ];

    let best = null;
    for (const background of backgrounds) {
        const candidate = await sharp(imageBuffer)
            .flatten({ background })
            .png()
            .toBuffer();

        const stats = await sharp(candidate).stats();
        const score = stats.channels[0]?.stdev || 0;

        if (!best || score > best.score) {
            best = { score, buffer: candidate };
        }
    }
    return best ? best.buffer : imageBuffer;
}

async function phashHex(rgb) {
    const hash = await phash(rgb);
    let hex = "";
    for (let i = 0; i < hash.length; i += 4) {
        const chunk = hash.slice(i, i + 4);
        const hexDigit = parseInt(chunk, 2).toString(16);
        hex += hexDigit;
    }
    return hex;
}

async function getType(buffer) {
    let type = null;
    if ( buffer[0] === 0x42 && buffer[1] === 0x4D) {
        type = "bmp";
    } else {
        try {
            type = (await sharp(buffer).metadata()).format;
        } catch (err) {
            type = null;
        }
    }

    return type in FORMAT_2_MIMETYPE ? type : null;
}


async function binarySearch(itterate, initialValue, sMin, sMax, tolMin, tolMax, maxIter = 100) {
    let value = initialValue;
    let i = 0;
    let sMid = (sMax + sMin) / 2;
    while (i < maxIter && (value < tolMin || value > tolMax)  ) {
        sMid = (sMax + sMin) / 2;
        value = await itterate(sMid);
        if (value < tolMin) {
            sMax = sMid;
        } else if (value > tolMax) {
            sMin = sMid;
        }
        i++;
    }
    return [sMid, value];
}





/**
 * Resizes an image to fit within a specified maximum file size.
 * If the image is in a format that supports quality-based compression (e.g., JPEG, WebP),
 * it will first attempt to reduce the quality to achieve the target size.
 * If the image is still too large, it will perform scale-based resizing.
 *
 * @param {Buffer} imageBuffer - The original image buffer.
 * @param {number} maxSize - The maximum allowed file size in bytes.
 * @param {number} tol - The tolerance for the file size error (default is 0.03).
 * @returns {Promise<[Buffer, sharp.Metadata]>} - The resized image buffer.
 */
async function resizeImageToFileSize(imageBuffer, maxSize, tol = 0.03) {
    let buffer = imageBuffer;
    let isBMP = buffer[0] === 0x42 && buffer[1] === 0x4D;


    // If the image is already larger than the max size, we need to resize it
    if (buffer.length > maxSize) {
        let metadata = isBMP ? { format: 'bmp', size: buffer.length } : await sharp(buffer).metadata();

        // If the image is an SVG, we need to convert it to a raster format first
        // as it is impossible to directly control the file size of an SVG
        if (metadata.format in CONVERSION_TYPES) {
            // const oldFormat = metadata.format;
            buffer = await CONVERSION_TYPES[metadata.format](buffer);
            metadata = await sharp(buffer).metadata();
            // console.log(`Converted image from format ${oldFormat} to ${metadata.format}`);
        }

        // console.log(`Metadata before resizing:\n\tsize: ${metadata.size}\n\twidth: ${metadata.width}\n\theight: ${metadata.height}\n\tformat: ${metadata.format}\n\tcompression: ${metadata.compression}`);

        const {width, height, format} = metadata;
        const isQualityBasedFormat = format in FORMAT_2_QUALITY_KEY;
        
        let resizedBuffer = buffer;
        let error = (maxSize - buffer.length) / maxSize;

        // Calculate the initial quality based on the maximum quality
        // drop and the size of the image relative to the max size
        let quality = 100 - Math.round( 
            MAX_QUALITY_DROP * Math.max(Math.min(
                1, 
                -error / SIZE_SCALE_OF_MAX_QUALITY_DROP
            ), 0)
        );


        if (isQualityBasedFormat) {
            resizedBuffer = await sharp(buffer)[format]({quality}).toBuffer();
            error = (maxSize - resizedBuffer.length) / maxSize;
            // console.log(`\n\tQuality changed\n\t\tsize: ${resizedBuffer.length}\n\t\tquality: ${quality}\n\t\tnew error: ${error}`);
        }

        if (error < 0){
            // console.log(`   - Starting binary search for scale-based resizing with initial error: ${error}`);
            await binarySearch(async (scale) => {
                // Calculate the new dimensions based on the scale factor
                const newWidth = Math.floor(width * scale);
                const newHeight = Math.floor(height * scale);
                resizedBuffer = await sharp(buffer)
                                      .resize(newWidth, newHeight)
                                      [format]({quality})
                                      .toBuffer();

                let error = (maxSize - resizedBuffer.length) / maxSize;
                // console.log(`\tResized buffer\n\t\tsize: ${resizedBuffer.length}\n\t\tscale: ${scale}\n\t\tnew error: ${error}`);
                return error;
            }, error, 0, 1, 0, tol, 10)
        }
        buffer = resizedBuffer;
    }
    
    return [buffer, await sharp(buffer).metadata()];
}

async function testAVIF(buffer) {
    const metadata = await sharp(buffer).metadata();
    const jpeg = await sharp(buffer).jpeg().toBuffer();
    return [metadata, jpeg];
}

async function getImageDimensions(buffer, type) {
    if (type != "svg" && type in CONVERSION_TYPES) {
        buffer = await CONVERSION_TYPES[type](buffer);
    }
    const metadata = await sharp(buffer).metadata();
    return [metadata.width, metadata.height];
}


module.exports = {
    img2png,
    img2rgb,
    phashHex,
    getType,
    resizeImageToFileSize,
    getImageDimensions,
    testAVIF,
    MIMETYPE_KEY,
    FORMAT_2_MIMETYPE
}