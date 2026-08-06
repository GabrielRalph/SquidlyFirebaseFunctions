const { db } = require("../firebase.js");

/**
 * Validators validate the data provided. If nothing is returned 
 * the data is regarded valid otherwise if a string (or anything) 
 * is returned the data is considered not valid, with the string
 * describing the reason why. 
 * @template {any} T
 * @typedef {(data: T) => Promise<(void|string)} Validator
 */

/**
 * @template {any} T
 * @param {T} data to validate.
 * @param {Validator<T>[]} validators list of validators.
 * @param {string[]} errors that where experieced.
 *               
 */
async function validateData(data, validators, errors = []) {
    let valid = true;
    for (let validator of validators) {
        let res = await validator(data);
        valid = valid && (typeof res === "undefined");
        if (!valid) {
            errors.push(res);
            break;
        }
    }

    return valid;
}

/**
 * @param {any} value
 * @return {boolean}
 */
function isNonNullObject(value) {
    return typeof value === "object" && value !== null
}


/**
 * @param {Array<() => Promise>} arr
 * @param {number} chunkSize
 */
async function parallelChucks(arr, chunkSize) {
    let results = new Array(arr.length);
    for (let i = 0; i < arr.length; i+=chunkSize) {
        let end_i = i + chunkSize;
        end_i = end_i <= arr.length ? end_i : arr.length;

        let prom_chunk = arr.slice(i, end_i).map(f => f())
        let result = await Promise.all(prom_chunk);
        for (let j = i; j < end_i; j++) {
            results[j] = result[j-i];
        }
    }
    return results;
}


/**
 * @param {string} rootKey
 * @param {string[]} path
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function refPath(rootKey, path) {
    let sref = db.ref(rootKey);
    path = path.filter(k => typeof k === "string" && k.length != 0);
    path = path.join("/")
    if (path.length > 0) {
        sref = sref.child(path);
    }
    return sref;
}


/**
 * @param {string[]} path
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function usersRef(...path) {
   return refPath("users", path)
}


/**
 * @param {string[]} path
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function tempUsersRef(...path) {
    return refPath("temp-users", path)
}



module.exports = {validateData, parallelChucks, isNonNullObject, refPath, usersRef, tempUsersRef}