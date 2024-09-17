const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');
const { writeFileSync, appendFileSync } = require('fs');
const { randomInt } = require('crypto');
const { get } = require('https');
const bodyParser = require('body-parser');
const multer = require('multer');
const Gen1Wii = require('./gen1_wii.js');
const sharp = require('sharp');
const { serialize } = require('@jscad/stl-serializer');
const { primitives, booleans } = require('@jscad/modeling');
const { translate, scale, center } = require('@jscad/modeling').transforms;
const { cube } = primitives;
const { union } = booleans;
const stlDeserializer = require('@jscad/stl-deserializer');
const fs = require('fs');

const upload = multer();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '5kb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const processingQueue = {};

app.post('/generate-stamp', upload.none(), async (req, res) => {
    const form = req.body;
    const inputType = form.platform;

    let inputData;
    try {
        inputData = form.data;
    } catch (e) {
        inputData = Buffer.alloc(0);
    }

    const randIntFolder = randomInt(1000000, 2000000);
    const randIntFilename = randomInt(1000000, 2000000);
    const jobId = `${randIntFolder}-${randIntFilename}`;

    processingQueue[jobId] = { status: 'Data received...', result: null };

    res.json({ jobId, status: 'Processing started...' });

    try {
        let origMii;
        if (inputType === 'wii') {
            origMii = Gen1Wii.fromBytes(Buffer.from(inputData, 'base64'));
        } else {
            processingQueue[jobId].status = 'Error...';
            processingQueue[jobId].result = 'Invalid platform';
            logToFile(`Job ID: ${jobId} - Error: Invalid platform, this is not a Wii Mii or a Switch Mii`);
            return;
        }

        let miiData = decodeMii(origMii, inputType);

        processingQueue[jobId].status = 'Decoding Mii data...';
        processingQueue[jobId].result = null;

        fs.mkdirSync(`./stamps/${randIntFolder}`);
        const miipath = `./stamps/${randIntFolder}/${randIntFilename}`;
        const url = `https://studio.mii.nintendo.com/miis/image.png?${new URLSearchParams({ data: miiData.toString('hex'), type: 'face_only', expression: form.expression, width: '512', instanceCount: '1' }).toString()}`;

        await new Promise((resolve, reject) => {
            get(url.toString(), (res) => {
                const data = [];
                res.on('data', (chunk) => data.push(chunk));
                res.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(data);

                        processingQueue[jobId].status = 'Applying effects...';
                        processingQueue[jobId].result = null;

                        writeFileSync(`${miipath}-1.png`, buffer);
                        generateBWImage(miipath);

                        processingQueue[jobId].status = 'Generating STL...';
                        processingQueue[jobId].result = null;
                        sharp(`stamps/${randIntFolder}/${randIntFilename}.png`)
                            .raw()
                            .ensureAlpha()
                            .toBuffer({ resolveWithObject: true })
                            .then(({ data, info }) => {
                                const { width, height } = info;
                                let shapes = [];

                                for (let y = 0; y < height; y++) {
                                    for (let x = 0; x < width; x++) {
                                        const index = (y * width + x) * 4;
                                        const red = data[index];
                                        const brightness = red / 255;

                                        if (brightness > 0) {
                                            const shape = cube({ radius: 0.5, segments: 12 });
                                            const translatedShape = translate([x, y, 0], shape);

                                            shapes.push(translatedShape);
                                        }
                                    }
                                }

                                let model;
                                let stlData;
                                if (form.stamp == 0) {
                                    const stampData = fs.readFileSync('./stamp.stl');
                                    const stamp = stlDeserializer.deserialize({ output: 'geometry', filename: 'file.stl' }, stampData);
                                    var scaledShapes = shapes.map(shape => scale([0.04, 0.04, 1], shape));

                                    const centeredStamp = center({}, stamp);
                                    scaledShapes = translate([-8.5, -22, -19], scaledShapes);
                                    model = union(centeredStamp, ...scaledShapes);

                                    processingQueue[jobId].status = 'Serializing STL (This may take a while)...'; 
                                    processingQueue[jobId].result = null;

                                    stlData = serialize({ binary: false }, model);
                                    resultSTL = stlData[0];
                                } else if (form.stamp == 1) {
                                    model = union(...shapes);
                                    stlData = serialize({ binary: false }, model);
                                    resultSTL = stlData[0];
                                } else {
                                    execSync(`magick ${miipath}.png -negate ${miipath}.bmp`);
                                    execSync(`potrace -s ${miipath}.bmp -o ${miipath}.svg`);
                                    stlData = fs.readFileSync(`${miipath}.svg`, 'utf8');
                                    resultSTL = stlData;
                                }

                                processingQueue[jobId].status = 'Completed';
                                processingQueue[jobId].result = { stl: resultSTL, name: form.filename.replace(/-\(\d{4}-\d{4}-\d{4}\)\.miigx$/, '') };
                                logToFile(`Job ID: ${jobId} - ${form.filename} (${form.stamp == 0 ? 'Stamp' : form.stamp == 1 ? 'Face Only' : 'SVG'}) was completed`);
                                resolve();
                            })
                            .catch(err => {
                                processingQueue[jobId].status = 'Error';
                                processingQueue[jobId].result = err.message + "<br><br><b><i class='fa-solid fa-fingerprint'></i> " + jobId + "</b>";
                                logToFile(`Job ID: ${jobId} - ${form.filename} (${form.stamp == 0 ? 'Stamp' : form.stamp == 1 ? 'Face Only' : 'SVG'}) Error: ${err.message}`);
                                reject(err);
                            });
                    } catch (err) {
                        processingQueue[jobId].status = 'Error';
                        processingQueue[jobId].result = "The file you uploaded is corrupted and is not a valid Mii.<br><br><b><i class='fa-solid fa-fingerprint'></i> " + jobId + "</b>";
                        logToFile(`Job ID: ${jobId} - ${form.filename} (${form.stamp == 0 ? 'Stamp' : form.stamp == 1 ? 'Face Only' : 'SVG'})  Error: ${err.message}`);
                        err = new Error("The file you uploaded is corrupted and is not a valid Mii.");
                        reject(err);
                    }
                });
            }).on('error', (e) => {
                processingQueue[jobId].status = 'Error';
                processingQueue[jobId].result = e.message + "<br><br><b><i class='fa-solid fa-fingerprint'></i> " + jobId + "</b>";
                logToFile(`Job ID: ${jobId} - ${form.filename} (${form.stamp == 0 ? 'Stamp' : form.stamp == 1 ? 'Face Only' : 'SVG'})  Error: ${e.message}`);
                reject(e);
            });
        });
    } catch (e) {
        processingQueue[jobId].status = 'Error';
        processingQueue[jobId].result = e.message + "<br><br><b><i class='fa-solid fa-fingerprint'></i> " + jobId + "</b>";
        logToFile(`Job ID: ${jobId} - ${form.filename} (${form.stamp == 0 ? 'Stamp' : form.stamp == 1 ? 'Face Only' : 'SVG'})  Error: ${e.message}`);
    } finally {
        fs.rmSync(`./stamps/${randIntFolder}`, { recursive: true });
    }
});

app.get('/check-status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = processingQueue[jobId];

    if (!job) {
        res.status(404).send('Job not found');
        return;
    }

    res.json({ status: job.status, result: job.result });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    fs.rmSync('./stamps', { recursive: true, force: true });
    fs.mkdirSync('./stamps');
});

function generateBWImage(miipath) {
    execSync(`magick ${miipath}-1.png -modulate 0,100,100 ${miipath}-bg.png`);
    execSync(`magick ${miipath}-bg.png -scale 102% ${miipath}-bg.png`);
    execSync(`magick ${miipath}-bg.png ${miipath}-1.png -gravity center -composite ${miipath}-1.png`);
    execSync(`magick ${miipath}-1.png -channel RGB -negate ${miipath}-2.png`);
    execSync(`magick ${miipath}-1.png -bordercolor magenta -border 2 -background magenta -alpha background -channel A -blur 0x3 -level 0,0% ${miipath}-3.png`);
    execSync(`magick ${miipath}-3.png -fuzz 5% -fill transparent +opaque magenta ${miipath}-4.png`);
    execSync(`magick ${miipath}-4.png -fuzz 5% -fill black -opaque magenta ${miipath}-6.png`);
    execSync(`magick ${miipath}-2.png ${miipath}-6.png -gravity center -compose over -composite ${miipath}-7.png`);
    execSync(`magick ${miipath}-7.png -fuzz 30% -fill transparent -draw "color 0,0 floodfill" ${miipath}.png`);
    execSync(`magick ${miipath}.png -resize 80% ${miipath}.png`);
}

function decodeMii(origMii, inputType) {
    const u8 = (data) => Buffer.from([data]);

    const studioMii = {};

    const makeup = { 1: 1, 2: 6, 3: 9, 9: 10 };
    const wrinkles = { 4: 5, 5: 2, 6: 3, 7: 7, 8: 8, 10: 9, 11: 11 };

    studioMii.facial_hair_color = 8;
    studioMii.beard_goatee = origMii.facialHairBeard;
    studioMii.body_weight = origMii.bodyWeight;
    studioMii.eye_stretch = inputType === 'wii' ? 3 : origMii.eyeStretch;
    studioMii.eye_color = inputType.includes('switch') ? origMii.eyeColor : origMii.eyeColor + 8;
    studioMii.eye_rotation = origMii.eyeRotation;
    studioMii.eye_size = origMii.eyeSize;
    studioMii.eye_type = origMii.eyeType;
    studioMii.eye_horizontal = origMii.eyeHorizontal;
    studioMii.eye_vertical = origMii.eyeVertical;
    studioMii.eyebrow_stretch = inputType === 'wii' ? 3 : origMii.eyebrowStretch;
    studioMii.eyebrow_color = 8;
    studioMii.eyebrow_rotation = origMii.eyebrowRotation;
    studioMii.eyebrow_size = origMii.eyebrowSize;
    studioMii.eyebrow_type = origMii.eyebrowType;
    studioMii.eyebrow_horizontal = origMii.eyebrowHorizontal;
    studioMii.eyebrow_vertical = inputType.includes('switch') ? origMii.eyebrowVertical + 3 : origMii.eyebrowVertical;
    studioMii.face_color = 0;
    studioMii.face_makeup = inputType === 'wii' ? (makeup[origMii.facialFeature] || 0) : origMii.faceMakeup;
    studioMii.face_type = origMii.faceType;
    studioMii.face_wrinkles = inputType === 'wii' ? (wrinkles[origMii.facialFeature] || 0) : origMii.faceWrinkles;
    studioMii.favorite_color = 10;
    studioMii.gender = origMii.gender;
    studioMii.glasses_color = 8;
    studioMii.glasses_size = origMii.glassesSize;
    studioMii.glasses_type = origMii.glassesType;
    studioMii.glasses_vertical = origMii.glassesVertical;
    studioMii.hair_color = 8;
    studioMii.hair_flip = origMii.hairFlip;
    studioMii.hair_type = origMii.hairType;
    studioMii.body_height = origMii.bodyHeight;
    studioMii.mole_size = origMii.moleSize;
    studioMii.mole_enable = origMii.moleEnable;
    studioMii.mole_horizontal = origMii.moleHorizontal;
    studioMii.mole_vertical = origMii.moleVertical;
    studioMii.mouth_stretch = inputType === 'wii' ? 3 : origMii.mouthStretch;
    studioMii.mouth_color = inputType.includes('switch') ? origMii.mouthColor : (origMii.mouthColor < 4 ? origMii.mouthColor + 19 : 0);
    studioMii.mouth_size = origMii.mouthSize;
    studioMii.mouth_type = origMii.mouthType;
    studioMii.mouth_vertical = origMii.mouthVertical;
    studioMii.beard_size = origMii.facialHairSize;
    studioMii.beard_mustache = origMii.facialHairMustache;
    studioMii.beard_vertical = origMii.facialHairVertical;
    studioMii.nose_size = origMii.noseSize;
    studioMii.nose_type = origMii.noseType;
    studioMii.nose_vertical = origMii.noseVertical;

    let miiData = Buffer.alloc(0);
    let n = 256;
    const miiDict = Object.values(studioMii);

    miiData = Buffer.concat([miiData, u8(0)]);
    for (const v of miiDict) {
        const eo = (7 + (v ^ n)) % 256;
        n = eo;
        miiData = Buffer.concat([miiData, u8(eo)]);
    }

    return miiData;
}

function logToFile(message) {
    const timestamp = new Date().toISOString();
    appendFileSync('log.txt', `[${timestamp}] ${message}\n`);
}

app.get('/check-status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = processingQueue[jobId];

    if (!job) {
        res.status(404).send('Job not found');
        return;
    }

    res.json({ status: job.status, result: job.result });
});