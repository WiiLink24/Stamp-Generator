import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import multer from 'multer';
import { Buffer } from 'buffer';
import Gen1Wii from './gen1_wii.js';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer();

app.post('/cgi-bin/mii', upload.single('data'), async (req, res) => {
    let inputType = req.body.platform;

    let inputData;
    let id;

    try {
        inputData = req.body.data || '';
        id = req.body.id;
    } catch (err) {
        return res.json({ error: "Invalid input" });
    }

    try {
        let origMii;

        if (inputType === 'wii') {
            origMii = Gen1Wii.fromBytes(Uint8Array.from(atob(inputData), c => c.charCodeAt(0)));
        } else {
            return res.status(400).json({ error: 'Invalid platform type' });
        }

        const studioMii = generateStudioMii(origMii, inputType);

        const miiDict = Object.values(studioMii);
        let miiData = [];
        let n = 256;

        miiData.push(0);  // Add the initial value to the array

        miiDict.forEach(v => {
            const eo = (7 + (v ^ n)) % 256;  // Perform the encoding operation
            n = eo;
            miiData.push(eo);  // Add the encoded value to the array
        });

        // Convert miiData to hexadecimal representation
        const hexlify = arr => arr.map(num => num.toString(16).padStart(2, '0')).join('');

        // Result in hexadecimal format
        const resultHex = hexlify(miiData);
        console.log(resultHex);


        const miiStudio = miiDict.map(m => Buffer.from([m]).toString('hex')).join('');

        const favoriteColors = {
            0: "Red",
            1: "Orange",
            2: "Yellow",
            3: "Lime Green",
            4: "Forest Green",
            5: "Royal Blue",
            6: "Sky Blue",
            7: "Pink",
            8: "Purple",
            9: "Brown",
            10: "White",
            11: "Black",
        };

        return res.json({
            mii: resultHex,
            miistudio: miiStudio,
            name: origMii.miiName,
            creator_name: origMii.creatorName,
            birthday: `${String(origMii.birthMonth).padStart(2, '0')}/${String(origMii.birthDay).padStart(2, '0')}`,
            favorite_color: favoriteColors[origMii.favoriteColor],
            height: origMii.bodyHeight,
            build: origMii.bodyWeight,
            gender: origMii.gender ? 'Male' : 'Female',
            mingle: inputType.includes('switch') ? 'N/A' : origMii.mingle === 1 ? 'Yes' : 'No',
            copying: inputType.includes('switch') || inputType === 'wii' ? 'N/A' : origMii.copying === 1 ? 'Yes' : 'No',
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            mii: "000f165d65747981878c8e94a3a8b4acb3b7bec5cbd2dfe6f5f8fffc040b1c232b313f3a405a60697178808f9198a4",
            studio: "Error!"
        });
    }
});

function generateStudioMii(origMii, inputType) {
    const studioMii = {};

    // Lookup tables
    const makeup = { 1: 1, 2: 6, 3: 9, 9: 10 };
    const wrinkles = { 4: 5, 5: 2, 6: 3, 7: 7, 8: 8, 10: 9, 11: 11 };

    studioMii.facial_hair_color = origMii.facialHairColor;
    studioMii.beard_goatee = origMii.facialHairBeard;
    studioMii.body_weight = origMii.bodyWeight;
    studioMii.eye_stretch = 3;
    studioMii.eye_color = origMii.eyeColor;
    studioMii.eye_rotation = origMii.eyeRotation;
    studioMii.eye_size = origMii.eyeSize;
    studioMii.eye_type = origMii.eyeType;
    studioMii.eye_horizontal = origMii.eyeHorizontal;
    studioMii.eye_vertical = origMii.eyeVertical;
    studioMii.eyebrow_stretch = 3;
    studioMii.eyebrow_color = origMii.eyebrowColor;
    studioMii.eyebrow_rotation = origMii.eyebrowRotation;
    studioMii.eyebrow_size = origMii.eyebrowSize;
    studioMii.eyebrow_type = origMii.eyebrowType;
    studioMii.eyebrow_horizontal = origMii.eyebrowHorizontal;
    studioMii.eyebrow_vertical = origMii.eyebrowVertical + 3;
    studioMii.face_color = origMii.faceColor;
    if (makeup[origMii.facialFeature]) {
        studioMii.face_makeup = makeup[origMii.facialFeature];
    } else {
        studioMii.face_makeup = 0;
    }
    studioMii.face_type = origMii.faceType;
    if (wrinkles[origMii.facialFeature]) {
        studioMii.face_wrinkles = wrinkles[origMii.facialFeature];
    } else {
        studioMii.face_wrinkles = 0;
    }
    studioMii.favorite_color = origMii.favoriteColor;
    studioMii.gender = origMii.gender;
    studioMii.glasses_color = origMii.glassesColor;
    studioMii.glasses_size = origMii.glassesSize;
    studioMii.glasses_type = origMii.glassesType;
    studioMii.glasses_vertical = origMii.glassesVertical;
    studioMii.hair_color = origMii.hairColor;
    studioMii.hair_flip = origMii.hairFlip;
    studioMii.hair_type = origMii.hairType;
    studioMii.body_height = origMii.bodyHeight;
    studioMii.mole_size = origMii.moleSize;
    studioMii.mole_enable = origMii.moleEnable;
    studioMii.mole_horizontal = origMii.moleHorizontal;
    studioMii.mole_vertical = origMii.moleVertical;
    studioMii.mouth_stretch = 3;
    studioMii.mouth_color = origMii.mouthColor;
    studioMii.mouth_size = origMii.mouthSize;
    studioMii.mouth_type = origMii.mouthType;
    studioMii.mouth_vertical = origMii.mouthVertical;
    studioMii.beard_size = origMii.facialHairSize;
    studioMii.beard_mustache = origMii.facialHairMustache;
    studioMii.beard_vertical = origMii.facialHairVertical;
    studioMii.nose_size = origMii.noseSize;
    studioMii.nose_type = origMii.noseType;
    studioMii.nose_vertical = origMii.noseVertical;
    return studioMii;
}

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
