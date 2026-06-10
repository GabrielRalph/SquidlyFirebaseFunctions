const { onCall } = require("firebase-functions/https");
const { Auth, db } = require("../firebase");
const { isNonNullObject, validateData } = require("../Shared/shared");
const { connectUserProfile, addLicenceUser, removeLicenceUser, getStatusLevelOfUser, isEditLevel, getStatusLevel, parseLicenceUserData } = require("./shared");
const { onValueCreated } = require("firebase-functions/database");
const { debug } = require("firebase-functions/logger");
const { sendEmail, emailerPrivateKey } = require("../Emailer/sendEmail.js");

/**
 * 
 */
const BASE_VALIDATERS = [
    async ({auth}) => {if (!isNonNullObject(auth)) return "User not authenticated.";},

    async ({data}) => {if (!isNonNullObject(data)) return "No data provided.";},

    async ({data: {lid}}) => {if (typeof lid !== "string" || lid.length == 0) return "Invalid licence ID.";},

    async ({data: {user}}) => {if (!isNonNullObject(user)) return "Invalid user to add."},

    // Check if the user is a valid user object.
    async ({data}) => {
        try {
            let user = parseLicenceUserData(data.user);
            data.user = user;
        } catch (e) {
            return e + "";
        }
    },


    // Check if the user is trying to add/edit or remove themselves.
    /** @param {import("./shared").FunctionContext} context */
    async (context) => {
        let token = context.auth.token;
        if (token.email === context.data.user.email) {
            return "Cannot change your own position in a licence.";
        }
    },

    // Check if the user has permission to edit the licence.
    /** @param {import("./shared").FunctionContext} context */
    async (context) => {
        let {auth: {uid}, data} = context;
        let editorsStatus = await getStatusLevelOfUser(uid, data.lid);
        if (!isEditLevel(editorsStatus)) {
            return "User does not have permission to edit this licence.";
        }
        data.editorsStatus = editorsStatus;
    },

    // Check a user isn't asigning a status that is higher than their own
    // or demoting a user of higher status.
    /** @param {import("./shared").FunctionContext} context */
    async (context) => {
        let {data: {editorsStatus, user, lid}} = context;
        let usersStatus = getStatusLevel(user.status);
        if (usersStatus > editorsStatus) {
            return "Cannot assign a status higher than your own.";
        } else {
            let usersOldStatus = await getStatusLevelOfUser(user.email, lid, true);
            if (usersOldStatus > editorsStatus) {
                return "Cannot demote a user of higher status.";
            }
        }
    }
]


async function sendSignupEmail(email, data) {
    try {
        let response = await sendEmail({
            from: "joshua@squidly.com.au",
            to: email,
            templateName: "licence-creation",
            data,
            subject: 'Welcome to Squidly',
        });
        if (response.error) {
            debug("LICENCES: checkAdminAndLicence: Failed to send licence creation email:", response.message);
        }
    } catch (e) {
        debug("LICENCES: checkAdminAndLicence: Error sending licence creation email.", e);
    }
}


module.exports = {
    addUser: onCall({
        region: "asia-southeast1"
    },async (req) => {
        let errors = [];
        if (await validateData(req, BASE_VALIDATERS, errors)) {
            let {data:{lid, user}} = req;
            try {
                if (!(await addLicenceUser(lid, user))) {
                    errors.push("The user was not added to the licence.");
                    debug(`LICENCES: FAILED to add user ${user.name} with email ${user.email} to licence ${lid}`);
                } else {
                    debug(`LICENCES: SUCCESSFULLY added user ${user.name} with email ${user.email} to licence ${lid}`);
                }
            } catch (e) {
                errors.push("error: " + e + "");
            }
        }
        return {errors};
    }),

    removeUser: onCall({
        region: "asia-southeast1"
    },async (req) => {
        let errors = [];
        if (await validateData(req, BASE_VALIDATERS, errors)) {
            let {data:{lid, user}} = req;
            try {
                if (!(await removeLicenceUser(lid, user))) {
                    errors.push("The user was not removed from the licence, likely because they where not found in the licence.");
                    debug(`LICENCES: FAILED to remove user ${user.name} with email ${user.email} from licence ${lid}: `, errors);
                } else {
                    debug(`LICENCES: SUCCESSFULLY removed user ${user.name} with email ${user.email} from licence ${lid}`);
                }
            } catch (e) {
                errors.push("error: " + e + "");
            }
        }
        return {errors};
    }),

    checkForAdminAndLicence: onValueCreated({
        ref: "users/{uid}",
        instance: "eyesee-d0a42-default-rtdb",
        region: "asia-southeast1",
        secrets: [emailerPrivateKey],
    }, async ({data, params: {uid}}) => {
        let token = await Auth.getUser(uid);
        let creationTime = token.metadata?.creationTime ? new Date(token.metadata.creationTime).getTime() : Date.now();
        let email = token.email;
        await connectUserProfile({uid, token});
        await sendSignupEmail(email, data.val().info);
        await db.ref(`users/${uid}/metrics`).update({
            creationTime,
            email,
        });
    })
}