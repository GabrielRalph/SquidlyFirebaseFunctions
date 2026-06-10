const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require("firebase-admin/auth");
const admin = require("firebase-admin");

if (process.env.TEST === "true") {
    // DEBUG
    const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
    const serviceAccount = require(process.env.KEY_FILE);
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: "eyesee-d0a42.appspot.com",
        databaseURL: "https://eyesee-d0a42-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
} else {
    // PRODUCTION
    admin.initializeApp();
}



const db = getDatabase();
const Auth = getAuth();
const Storage = getStorage();
const sb = Storage.bucket("gs://eyesee-d0a42.appspot.com");
const fstore = getFirestore();


async function getUserData(uid, ...path){
    let lref = db.ref(`users/${uid}`);
    path = path.join("/");
    if (typeof path === "string" && path.length > 0) lref = lref.child(path);
    let data = (await lref.get()).val();
    return data;
}

async function updateUserData(uid, value, path){
    let lref = db.ref(`users/${uid}`);
    if (typeof path === "string") lref = lref.child(path);
    await lref.update(value);
}

async function setUserData(uid, value, path){
    let lref = db.ref(`users/${uid}`);
    if (typeof path === "string") lref = lref.child(path);
    await lref.set(value);
}

const PAID_LICENCES = {
    "Standard": true,
    "Pro": true
}

async function getUserLicence(uid){
    let licence = await getUserData(uid, 'licence/tier');
    if (!(licence in PAID_LICENCES)) licence = null
    return licence;
}

async function getUserName(uid) {
    let name = await getUserData(uid, "info", "displayName");
    if (name == null) {
        let first = await getUserData(uid, "info", "firstName");
        let last = await getUserData(uid, "info", "lastName");
        name = (first || "") + " " + (last || "");
    }
    return name;
}


module.exports = {admin, db, Auth, Storage, sb, fstore, getUserName, getUserData, setUserData, updateUserData, getUserLicence};