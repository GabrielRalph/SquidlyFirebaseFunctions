/** 
 * @typedef {Object} AuthData 
 *  @property {import("firebase-admin/auth").DecodedIdToken} token
 *  @property {string} uid
 * 
 * @typedef {import("./vectorEmbedd.js").IconInfo} IconInfo
 */

/**
 * @typedef {Object} DeleteResults
 * @property {boolean} success
 * @property {string[]} errors
 * @property {IconInfo[]} multiples
 */

const { onCall } = require("firebase-functions/https");
const {fstore, sb } = require("../firebase.js");
const { debug } = require("firebase-functions/logger");
const { docs2iconInfo } = require("./vectorEmbedd.js");

/** Deletes a symbol by its name. If multiple symbols are found
 *  then the multiples will be returned in delete results and the 
 *  deletion will be unsuccessful, same if no symbols are found.
 *  
 * @async
 * @param {string} name
 * @param {string} uid 
 * 
 * @return {Promise<DeleteResults>}
 */
async function deleteSymbolByName(name, uid) {
    // Results if no symbol is found with the given name.
    let results = {
        success: false,
        errors: ["No symbol exists with that name."],
        multiples: []
    };

    // Get all symbols with the name provided
    let query = fstore.collection("icons");
    query = query.where("uid", "==", uid);
    query = query.where("name", "==", name);
    let symbols = await query.get();

    // If there are multiple symbols then no deletion occurs 
    // and those symbols are returned in array
    if (symbols.docs.length > 1) {
        results.multiples = docs2iconInfo(symbols.docs, uid);
        results.errors = ["Multiple symbols exist with that name."];

    // If there is only one symbol then we will delete it
    } else if (symbols.docs.length == 1) {
        let symbolID = symbols.docs[0].id;
        await deleteSymbolByID(symbolID);
        results.success = true;
        results.errors = [];
    }
    return results
}

/** Deletes a symbol by its ID. Removes its file
 *  and deletes is firestore reference.
 * @async
 * @param {string} id
 * 
 * @return {Promise<void>}
 */
async function deleteSymbolByID(id) {
    // Get file storage ref
    let file = sb.file(`icons/all/${id}`);

    // Get document ref
    let docRef = fstore.collection("icons").doc(id);

    let delFile = async () => {
        try {
            if (await file.exists()) {
                await file.delete();
            }
        } catch (e) {
            debug("GRID-SYMBOLS: Delete file failed", e)
        }
    }

    // Delete both document and file
    await Promise.all([
        docRef.delete(),
        delFile()
    ])
}


/** Checks the status of a symbol based on a users UID.
 *  See results below.
 * @async
 * @param {string} id
 * @param {string} uid
 * 
 * @return {Promise<(-1|0|1)>} -1 = exists but not owned
 *                     0 = doesn't exits
 *                     1 = exists and is owned
 */
async function checkStatus(id, uid) {
    let symbol = await fstore.collection("icons").doc(id).get();
    let status = symbol.exists ? 1 : 0;
    if (status == 1) {
        let ownerUID = symbol.get("uid");
        status = uid === ownerUID ? 1 : -1;
    }
    return status
}

/** Delete symbol is a function called by a http request. The deletion
 *  type must be specied in the request data and athentication must be 
 *  provided. Users can delete by name or by ID. Results of the deletion
 *  include whether it was successful and if not the reasons why.
 * @async
 * @param {{type: string, value: string}}
 * @param {AuthData} auth
 * 
 * @return {Promise<{errors: string[], multiples: IconInfo[], success: boolean}>}
 */
async function deleteSymbol(data, auth) {
    let results = {
        success: true,
        errors: [],
        multiples: []
    };

    // Check for authentication
    if (typeof auth !== "object" || auth === null) {
        results.success = false;
        let error = "User is not authenticated";
        results.errors.push(error);
        debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`);
    }

    // Check for data
    if (results.success && (typeof data !== "object" || data === null)) {
        results.success = false;
        let error = "User did not provide any delete information.";
        results.errors.push(error);
        debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`)
    }

    // Validate deletion type and value parameters
    if (results.success) {
        if (!(data.type == "id" || data.type == "name")) {
            results.success = false;
            let error = "User did not provide a valid delete type. Delete type must be either 'id' or 'name'.";
            results.errors.push(error);
            debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`);
        }

        if (typeof data.value !== "string" || data.value.length == 0) {
            results.success = false;
            let error = "Delete value must be non empty string.";
            results.errors.push(error);
            debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`);
        }
    }

    if (results.success) {
        // Deletion by ID
        if (data.type == "id") {

            // Get the symbol status
            let status = await checkStatus(data.value, auth.uid);

            // Symbol exists and is owned by the user so perform the deletion.
            if (status == 1) {
                try {
                    await deleteSymbolByID(data.value);
                } catch (e) {
                    results.success = false;
                    results.errors.push(e);
                    debug(`GRID-SYMBOLS: Delete Symbol Failed: ${e}`);
                }
            
            // Either symbol doesn't exist or isn't owned
            } else {
                results.success = false;
                let error = status == -1 ? "User is not the owner of the icon." : "No Icon exists with this ID.";
                results.errors.push(error);
                debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`);
            }

        // Deletion by Name
        } else {
            // Attempt deletion by name
            let delRes = null;
            try {
                delRes = await deleteSymbolByName(data.value, auth.uid);
            } catch (e) {
                results.success = false;
                results.errors.push(e);
                debug(`GRID-SYMBOLS: Delete Symbol Failed: ${e}`);
            }

            // If deletion was unsuccessful it was either because there 
            // where multiple icons with the some name or no icons at all.
            if (delRes !== null && !delRes.success) {
                results.multiples = delRes.multiples;
                results.success = false;
                let error = results.multiples.length > 0 ? 
                    "Multiple icons exist with this name." : "No Icon exists with this name.";
                results.errors.push(error);
                debug(`GRID-SYMBOLS: Delete Symbol Failed: ${error}`);
            }
        }
    }

    return results;
}


module.exports = {
    delete: onCall({
        region: "australia-southeast1"
    },async ({auth, data}) => {
        return await deleteSymbol(data, auth);
    }),
}
