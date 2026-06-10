
/**
 * @typedef {string} UID
 * 
 * @typedef {import("firebase-admin/auth").DecodedIdToken} AuthToken
 *
 *
 * @typedef {("admin"|"staff"|"owner")} Status
 * 
 * 
 * @typedef {Object} AuthData 
 * @property {string} uid
 * @property {AuthToken} token
 * 
 * 
 * @typedef {Object} FunctionContext
 * @property {?AuthData} auth
 * @property {?Object} data
 * 
 * @typedef {Object} LicenceUser
 * @property {Status} status the status of the user in the licence
 * @property {string} name  the name of the user in the licence
 * @property {string} email the email of the user in the licence
 * @property {boolean} linked  whether the user is linked to a firebase account
 * 
 * 
 * @typedef {Object} LicenceDescriptor
 * @property {number} seats the number of seats available for the licence
 * @property {number} tier the tier of the licence, becomes 0 when suspended
 * @property {number} oldTier  the tier of the licence without suspension
 * @property {string} licenceName  the name of the licence
 * @property {Object<string, LicenceUser>} users  the users of the licence
 * @property {string} customerID represents the stripe customer ID 
 * @property {boolean} disabled  whether the licence is suspended or not
 */

const { refPath, usersRef } = require("../Shared/shared.js");
const {Auth, getUserName } = require("../firebase.js");

const MAX_NAME_LENGTH = 1028;

const STATUSES = {
    "owner": 3,
    "admin": 2,
    "staff": 1,
}
const EDIT_LEVEL = 2;

const EMAIL_CHECKER = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/

const USER_PARSER = {
    name: (name) => {
        if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) {
            throw "Invalid name"
        }
        return name;
    },
    email: (email) => {
        if (typeof email !== "string") {
            throw "Invalid email"
        } else {
            email = email.trim().toLowerCase();
            if (email.match(EMAIL_CHECKER) == null) {
                throw "Invalid email format";
            }
        }
        return email;
    },
    status: (status) => {
        if (typeof status !== "string" || !(status in STATUSES)) {
            status = "staff";
        }
        return status;
    }
}

function isNonEmptyString(str) {return typeof str === "string" && str.length > 0}

/**
 * Parses a licence user data object and returns a new object
 * with the values parsed according to the USER_PARSER.
 * @param {Object} user
 * @return {LicenceUser}
 */
function parseLicenceUserData(user) {
    let parsedUser = {};
    for (let key in USER_PARSER) {
        parsedUser[key] = USER_PARSER[key](user[key])
    }
    return parsedUser;
}

/** Gets a users auth token by their email. If no user is found 
 *  null is returned.
 * @param {string} email
 * 
 * @return {Promise<?AuthToken>}
 */
async function getUserByEmail(email) {
    let token = null;
    if (email == "someonerandom@gmail.com") {
        if ((await usersRef("dummy").get()).exists())
            token = {uid: "dummy", token: {email, uid: "dummy"}}
    } else {
        try {
            token = await Auth.getUserByEmail(email);
        } catch (e) {
            token = null;
        }
    }
    return token;
}

/**
 * @param {string[]} path
 * 
 * @return {import("firebase-admin/database").Reference}
 */
function licencesRef(...path) {
    return refPath("licences", path)
}

/** Checks a given licence and returns the status level of a given user.
 * @param {UID} uid user ui
 * @param {lid} lid licence id
 * @param {boolean} isEmail whether to search user by email
 * 
 * @return {Promise<number>}
 */
async function getStatusLevelOfUser(uid, lid, isEmail = false) {
    let level = 0;

    // If a valid licence id
    if (typeof lid === "string" && lid.length > 0) {
        // If searching by email
        if (isEmail) {
            // Get all users of the licence 
            let users = await licencesRef(lid, "users").get();
            if (users.exists()) {
                users = users.val()
                // Loop through the users and find the user with the given email
                // and return their status level.
                for (let key in users) {
                    if (users[key].email == uid) {
                        level = getStatusLevel(users[key].status);
                    }
                }
            } 
        } else {
            // If searching by uid then get the status of the user
            let snap = await licencesRef(lid, "users", uid, "status").get();
            level = getStatusLevel(snap.val());
        }
    }
    return level;
}

/** Returns the status level for a given status string
 * @type {?Status}
 */
function getStatusLevel(status) {
    let level = 0;
    if (typeof status === "string" && status in STATUSES) level = STATUSES[status];
    return level;
}

/** Returns whether the given status string is of biller level.
 * @type {Status|number} status
 */
function isBillerLevel(status) {
    if (typeof status !== "number" || Number.isNaN(status)) {
        status = getStatusLevel(status);
    } 
    return status >= 3;
}

/** Returns whether the given status is at least edit level.
 * @param {Status|number} status
 * @return {boolean} whether the status is at least edit level
 */
function isEditLevel(status) {
    if (typeof status !== "number" || Number.isNaN(status)) {
        status = getStatusLevel(status);
    } 
    return status >= EDIT_LEVEL;
}


/** Sort users 
 * @param {Object<string, LicenceUser>} users
 * 
 * @return {UID[]}
 */
function sortUsers(users) {
    let uids = Object.keys(users);
    uids.sort((ida, idb) => {
        let ua = users[ida];
        let ub = users[idb];

        let la = getStatusLevel(ua.status);
        let lb = getStatusLevel(ub.status);

        if (la == lb) {
            return ua.name > ub.name ? -1 : 1;
        } else {
            return la - lb;
        }
    });
    return uids;
}

/** ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *  ~~~~~~~~~~~~~~ USER LEVEL ~~~~~~~~~~~~~~ 
 *  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

/** Updates the maximum tier for a given user.
 * @param {UID} uid
 * 
 * @return {Promise<number>}
 */
async function updateUserMaxTier(uid) {
    let maxTier = 0;

    // Get all the licences for the given user
    let licences = await usersRef(uid, "licences").get();

    // If the user has any licences
    if (licences.exists()) {
       
        // Retreive the tiers for all the licences they have
        maxTier = Math.max(...Object.values(licences.val()));
    } 

    // Update the users largest tier
    await usersRef(uid, "max-tier", maxTier).set(maxTier);
    return maxTier;
}

/** Removes a licence from a given user.
 * @param {UID} uid
 * @param {string} licenceID
 * 
 * @return {Promise<void>}
 */
async function removeUsersLicence(uid, licenceID) {
    // if user contains the licence to remove
    let lref = usersRef(uid, "licences", licenceID)

    // remove the licence 
    if ((await lref.get()).exists()) {
        await lref.set(null);

        // Check to see if the user has any licences left
        await updateUserMaxTier(uid);
    }
}

/** Adds a licence from a given user.
 * @param {UID} uid
 * @param {string} licenceID
 * 
 * @return {Promise<void>}
 */
async function addUsersLicence(uid, licenceID) {
    // if user contains the licence to remove
    let lref = usersRef(uid, "licences", licenceID)

    // remove the licence 
    if (!(await lref.get()).exists()) {
        let tier = (await licencesRef(licenceID, "tier").get()).val();
        await lref.set(tier);

        // Check to see if the user has any licences left
        await updateUserMaxTier(uid);
    }
}

/** - Called when a user joins for the first time. Connects 
 * user with licences that may have alloceted seats for them
 * before their account was created.
 * @param {AuthData} auth
 */
async function connectUserProfile(auth){
    let {uid, token: {email}} = auth;

    let userLicences = []

    // Search through all licences and find licences who have 
    // a user with the same email as the user token provided.
    let licences = (await licencesRef().get()).val();
    if (licences) {
        for (let lid in licences) {
            let licence = licences[lid];
            for (let dummyUID in licence.users) {
                let user = licence.users[dummyUID]
                if (user.email == email) {
                    userLicences.push([lid, dummyUID, user]);
                    break;
                }
            }
        }
    }

    let userLicencesInfo = {};

    // If there is a default licence then add the user to it.
    let defaultLicenceID = await refPath("licences-settings", ["default-licence"]).get();
    if (defaultLicenceID.exists()) {
        let lid = defaultLicenceID.val();
        let defaultLicence = await licencesRef(lid).get();
        if (defaultLicence.exists()) {
            let name = (await getUserName(uid)).trim() || "New User";
            // If the licence exists then add the user to the licence
            let userData = {
                name: name,
                email,
                status: "staff",
                linked: true
            }
            await addLicenceUser(lid, userData);
            userLicencesInfo[lid] = defaultLicence.val().tier;
        }
    }
    

    // Update licences with new user uid.
    await Promise.all(userLicences.map(async ([lid, dummyUID, userData]) => {
        userData.linked = true;

        // remove the old user from the licences users
        await licencesRef(lid, "users", dummyUID).set(null);

        // add user under their uid.
        await licencesRef(lid, "users", uid).set(userData);

        userLicencesInfo[lid] = licences[lid].tier;
    }))

    let tiers = Object.values(userLicencesInfo);
    let maxTier = tiers.length == 0 ? 0 : Math.max(...tiers);
    
    // Update users licences and max tier.
    await usersRef(uid).update({
        licences: userLicencesInfo,
        "max-tier": maxTier,
    })
}

/** ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *  ~~~~~~~~~~~~~~ LICENCE LEVEL ~~~~~~~~~~~~~~ 
 *  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

/** Creates a new licence.
 * @param {AuthToken} auth
 * @param {number} tier 
 * @param {number} seats
 * @param {string} billerID
 * @param {string} licenceName
 * @param {string} [licenceID=null] if provided then the licence will be created with this id
 * 
 * @return {Promise<string>} returns the new licence id
 */
async function createLicence(authToken, tier, seats, customerID, licenceName, licenceID = null, isTest) {
    if (typeof tier === "string") {
        tier = parseInt(tier);
    }
    if (typeof tier !== "number" || Number.isNaN(tier)) throw "Tier must be a valid number."
    if (typeof seats !== "number" || Number.isNaN(seats) || seats < 1) throw "Seats must be a valid number at least 1."
    if (typeof licenceName !== "string" || licenceName.length == 0) throw `Licence '${licenceName}' name must be a non empty string.`
    let name = await getUserName(authToken.uid);
    let licence = {
        seats,
        tier: 0,
        oldTier: tier,
        licenceName,
        isTest: isTest || false,
        users: {
            [authToken.uid]: {
                status: "owner",
                name,
                email: authToken.email,
                linked: true
            }
        },
        customerID,
        disabled: true
    };
    
    // store licence
    let pushRef = licencesRef().push();
    if (isNonEmptyString(licenceID)) {
        pushRef = licencesRef(licenceID)
    }

    try {
        let result = await pushRef.transaction((old) => {
            if (old == null) {
                return licence;
            } 
        });
        if (result.committed) {
            // update owner licence 
            await addUsersLicence(authToken.uid, pushRef.key);
        } else {
            pushRef = {key:null}
        }
    } catch (e) {
        pushRef = {key:null}

    }

    
    return pushRef.key;
} 


/** Deletes a licence
 * @param {string} lid
 */
async function deleteLicence(lid){
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }

    let licence = await licencesRef(lid).get();

    // If the licence exists
    if (licence.exists()) {
        licence = licence.val();

        // Update every user
        await Promise.all(Object.keys(licence.users).map(async uid => {
            let user = licence.users[uid];
            if (user.linked) {
                await removeUsersLicence(uid, lid);
            }
        }));

        //Remove the licence
        await licencesRef(lid).set(null);
    }
}

/** Add licence user adds a new user to the given licence.
 * @param {string} lid licence id
 * @param {{name: string, email: string, status: Status}} user user info 
 * 
 * @return {Promise<boolean>}
 */
async function addLicenceUser(lid, user) {
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }

    let token = await getUserByEmail(user.email);
    let pushKey = licencesRef(lid, "users").push().key;
    let limitExceeded = false;
    let success = false;

    let result = await licencesRef(lid).transaction((licence) => {
        if (licence !== null) {
            let nUsers = Object.keys(licence.users).length;
            let maxUsers = licence.seats;

            // Check that the user hasn't already been added.
            // If they have update their status and name.
            let alreadyAdded = false;
            for (let uid in licence.users) {
                let other = licence.users[uid]
                if (other.email == user.email) {
                    other.name = user.name;
                    other.status = user.status;
                    alreadyAdded = true;
                    success = true;
                    break;
                }
            }

            // If the user has not been added, add them the to the users
            // provided they wont exceed the seating limit.
            if (!alreadyAdded) {
                if (nUsers < maxUsers) {
                    let key = token ? token.uid : pushKey;
                    while (key in licence.users)  key = key + Math.round(Math.random() * 100);
                    licence.users[key] = {
                        name: user.name,
                        email: user.email,
                        status: user.status,
                        linked: !!token
                    }
                    success = true;
                
                // If users will exceed seats transaction is aborted.
                } else {
                    limitExceeded = true;
                    licence = undefined;
                }
            }
        } 
        
        return licence;
    })
    success = success && result.committed;

    // If the limit was exceeded then throw an error.
    if (limitExceeded) {
        throw `Added ${user.name} would exceed the number of seats available.`
    }
    
    // If a user was successfully added, add the 
    // licence to their acount.
    if (success && token) {
        await addUsersLicence(token.uid, lid);
    }

    // Return the success of the addition
    return success;
}

/** Remove licence user removes a user from the given licence.
 * @param {string} lid licence id
 * @param {{email: string, name: string}} user user info 
 * 
 * @return {Promise<boolean>}
 */
async function removeLicenceUser(lid, {email, name}) {
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }

    let limitExceeded = false;
    let success = false;
    let result = await licencesRef(lid).transaction((licence) => {
        if (licence !== null) {
            // Check that the user exists and if they 
            // do keep reference to the key (i.e. uid) 
            // and remove them from the licence users.
            let uid = null;
            for (let id in licence.users) {
                let user = licence.users[id]
                if (user.email == email) {  
                    uid = id;
                    delete licence.users[id];
                }
            }
            
            // If the users exists and removing them will create a
            // licence with no users then we will abort the transaction
            let nUsers = Object.keys(licence.users).length;
            if (nUsers > 0 && uid !== null) {
                success = uid;
            } else {
                limitExceeded = nUsers == 0;
                licence = undefined;
            }
        }

        return licence;
    })

    // Throw error to alert limits
    if (limitExceeded) {
        throw `Removing ${name} would result in an empty licence.`
    }

    // If a user was successfully removed then remove the licence
    // from their account.
    if (success && result.committed) {
        await removeUsersLicence(success, lid);
    }

    // Return the result of the removal.
    return success !== false && result.committed;
}

/** Updates the tier for a given licence. Users
 * under the licence are also updated too.
 * @param {string} lid
 * @param {string} tier
 * 
 */
async function updateLicenceTier(lid, tier) {
    if (typeof tier === "string") {
        tier = parseInt(tier);
    }
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }

    let users = null;
    let result = await licencesRef(lid).transaction((licence) => {
        if (licence != null) {
            // If there is a change to the tier.
            if (tier !== licence.tier) {
                // Set the licence tier accordingly and store the
                //  users so that we can update their max tier.
                licence.tier = tier;
                users = licence.users;
            
            // No change to the tier so abort the transaction
            } else {
                licence = undefined;
            }
        }
        return licence;
    }) 

    // If the licence was successfully suspended/unsuspended.
    if (result.committed && users !== null) {

        // For each user of the licence, if the user is linked
        // then we will update the tier for that licence in the 
        // user and we will update the users maximum tier.
        await Promise.all(Object.keys(users).map(async uid => {
            let user = users[uid];
            if (user.linked) {
                await usersRef(uid, "licences", lid).set(tier);
                await updateUserMaxTier(uid);
            }
        }));
    }
}

/** Updates the number of seats for a given licence. 
 * Users under the licence are also updated too.
 * @param {string} lid
 * @param {string} tier
 * 
 */
async function updateLicenceSeats(lid, seats) {
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }

    if (seats == 0) return;

    let removedUser = null;
    let result = await licencesRef(lid).transaction((licence) => {
        if (licence != null) {

            // If there is a change in seats
            if (licence.seats != seats) {
                let {users} = licence;

                // Sort users by status and name
                let uidsSorted = sortUsers(users);

                // If there are more users than seats
                if (uidsSorted.length > seats) {

                    // Update the licence users
                    newUsers = {};
                    uidsSorted.slice(0, seats).forEach(uid => newUsers[uid] = users[uid]);
                    licence.users = newUsers;

                    // These users will be removed
                    removedUser = uidsSorted.slice(seats);
                }

                // Update the seats
                licence.seats = seats;

            // No change so abort the transaction
            } else {
                licence = undefined;
            }
        }

        return licence;
    }) 

    // If the seats was changed and users removed
    // remove licences from users who were removed.
    if (result.committed && removedUser !== null) {
        await Promise.all(removedUser.map(async uid => {
            removeUsersLicence(uid, lid)
        }))
    }
}

/** Suspends or unsuspends a licence
 * @param {string} lid
 * @param {string} tier
 * 
 */
async function suspendLicence(lid, isSuspended) {
    if (!isNonEmptyString(lid)) {
        throw "Invalid licence ID.";
    }
    
    let users = null;
    let currentTier = 0;
    let result = await licencesRef(lid).transaction((licence) => {
        if (licence != null) {

            // If the licence is changing from suspended to unsuspended
            // or the other way around.
            if (licence.disabled !== isSuspended) {
                // If suspended then set the licence tier to 0, store
                // the old tier and set the licence to disabled.
                if (isSuspended) {
                    licence.oldTier = licence.tier;
                    licence.tier = 0;
                    licence.disabled = true;
                    currentTier = 0;

                // Otherwise the licence is being unsuspended so set 
                // the tier to the stored tier and set disabled false.
                } else {
                    licence.tier = licence.oldTier;
                    licence.disabled = false;
                    currentTier = licence.tier;
                }

                // Store the users so that we can update their max tier
                users = licence.users;
            
            // Otherwise no change so abort the transaction.
            } else {
                licence = undefined;
            }
        }

        return licence;
    }) 

    // If the licence tier was successfully changed.
    if (result.committed && users !== null) {
        
        // For each user of the licence, if the user is linked
        // then we will update the current tier for that licence
        // in the user and we will update the users maximum tier.
        await Promise.all(Object.keys(users).map(async uid => {
            let user = users[uid];
            if (user.linked) {
                await usersRef(uid, "licences", lid).set(currentTier);
                await updateUserMaxTier(uid);
            }
        }));
    }
}

/** ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *  ~~~~~~~~~~~~~~ UTILITIES  ~~~~~~~~~~~~~~ 
 *  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

/** Returns the maximum tier for a given user.
 * @param {UID} uid
 * 
 * @return {Promise<number>}
 */
async function getUsersMaxTier(uid) {
    let maxTier = 0;
    let licences = await usersRef(uid, "max-tier").get();
    if (licences.exists()) {
        maxTier = licences.val();
    }
    return maxTier;
}

module.exports = {
    EDIT_LEVEL,
    isBillerLevel,
    getStatusLevel,
    isEditLevel,
    getStatusLevelOfUser,

    parseLicenceUserData,

    licencesRef,

    getUserByEmail,
    connectUserProfile,

    createLicence,
    deleteLicence,

    addLicenceUser,
    removeLicenceUser,

    updateLicenceTier,
    updateLicenceSeats,
    suspendLicence,

    getUsersMaxTier,
    
}