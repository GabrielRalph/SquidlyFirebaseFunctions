
/**
 * @typedef {Object} SessionInfo
 * @property {number} scheduledTime - The session ID.
 * 
 */


/**
 * @typedef {Object} SessionHistory
 * @property {number} startTime - The session start time in milliseconds.
 * @property {number} duration - The session duration in milliseconds.
 * @property {SessionInfo} info - The session information.
 */

/** 
 * @typedef {Object} SessionDescriptor
 * @property {string} hostUID - The session ID.
 * @property {boolean} active - The session ID.
 * @property {SessionInfo} info
*/


module.exports = {
    create: require("./sessions-create.js").create,
    end: require("./sessions-end.js").end,
    start: require("./sessions-start.js").start,
    watch: require("./sessions-watch.js").watch,
    watchData: require("./sessions-watch.js").watchData,
    approveRequest: require("./sessions-approveRequest.js").approveRequest,

    getSIDFromProxy: require("./session-get-from-proxy.js").getSIDFromProxy,
    watchForProfileCreation: require("./session-get-from-proxy.js").watchForProfileCreation,
    watchForProfileDeletion: require("./session-get-from-proxy.js").watchForProfileDeletion,
}