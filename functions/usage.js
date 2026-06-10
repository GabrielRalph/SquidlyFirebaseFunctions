const { getUserData } = require("./firebase.js");
const { refPath, usersRef } = require("./Shared/shared.js");

/**
 * @typedef {Object<string, number>} TUsage
 * @property {number} sessions
 * @property {number} minutes
 * @property {number} storage
 * @property {number} quizzes
 * @property {number} files
 * @property {number} [grids]
 * 
 */

/**
 * @typedef {Object} TUsageTemplateValue
 * @property {number} default
 * @property {boolean} resets
 * 
 * @typedef {Object<string, TUsageTemplateValue>} TUsageTemplate
 */

/**
 * @typedef {Object} UsageStats
 * @property {number} month
 * @property {number} year
 * @property {TUsage} used
 * @property {TUsage} available
 * @property {TUsage} remaining
 * @property {boolean} exceeded
 * @property {string} message
 */

/**
 * @typedef {TUsage} UserUsage
 * @property {number} month
 * @property {number} year
 */


function toNumber(value) {
    if (typeof value === "string") {
        value = parseFloat(value);
    } else if (typeof value !== "number") {
        value = null;
    }
    if (value != null && Number.isNaN(value)) {
        value = 0;
    }

    return value;
}

/**
 * @param {UserUsage} usage
 * @param {TUsageTemplate} template
 * @return {UserUsage}
 */
function parseUserUsage(usage, template) {
    // Validate usage helper functions
    let usageIsObject = (typeof usage === "object") && (usage !== null);
    let usageValueIsValid = (key) => {
        let value = null;
        if (usageIsObject && (key in usage)) {
            value = toNumber(usage[key])
        };
        return value;
    }

    let parsedUsage = {
        month: usageValueIsValid("month") !== null ? usage.month : (new Date()).getMonth(), 
        year: usageValueIsValid("year") !== null ? usage.year : (new Date()).getFullYear()
    };

    for (let key in template) {
        let value = usageValueIsValid(key);
        if (value === null) {
            value = toNumber(template[key].default);
            if (value === null) {
                value = 0
            }
        }
        parsedUsage[key] = value
    }
    return parsedUsage
}

/** * Add two usage objects together.
 * @param {TUsage} usage1
 * @param {TUsage} usage2
 * @param {TUsageTemplate} template
 * @return {TUsage}
 */
function addUsages(usage1, usage2, template) {
    let result = {};
    for (let key in template) {
        result[key] = usage1[key] + usage2[key];
    }
    return parseUserUsage(result, template);
}

function subtractUsages(usage1, usage2, template) {
    let result = {};
    for (let key in template) {
        result[key] = usage1[key] - usage2[key]
    }
    return parseUserUsage(result, template);
}

class Usage {
    /** Get the tier information and usage limits.
     * @return {Promise<void>}
     */
    async initialise() {
        let snapshots = await Promise.all([
            refPath("licences-settings", ["tier-usage"]).get(),
            refPath("licences-settings", ["usage-template"]).get()
        ]);
        [this.tierUsage, this.usageTemplate] = snapshots.map(snapshot => snapshot.val() || {});
        for (let tier in this.tierUsage) {
            this.tierUsage[tier] = parseUserUsage(this.tierUsage[tier], this.usageTemplate);
        }
    }

    parseUserUsage(usage) {
        return parseUserUsage(usage, this.usageTemplate);
    }

    /** Get available usage for a given user
     * @param {string} uid
     * @return {Promise<Usage>}
     */
    async getUsersAvailableUsage(uid) {
        // get licences and tiers for the user
        let licences = await usersRef(uid, "licences").get();
        
        let usage = this.parseUserUsage(null);

        if (licences.exists()) {
            licences = licences.val();
            let tiers = Object.values(licences);
            tiers = tiers.filter(t => (typeof t === "number") && !Number.isNaN(t) && (t > 0));
            const { tierUsage } = this;

            for (let tier of tiers) {
                if (tier in tierUsage) {
                    usage = addUsages(usage, tierUsage[tier], this.usageTemplate);
                }
            }
        } 
        return usage;
    }

    /** Get available usage for a given user
     * @param {string} uid
     * @return {Promise<TUsage>}
     */
    static async getUsersAvailableUsage(uid) {
        let usageInstance = new Usage();
        await usageInstance.initialise();
        return await usageInstance.getUsersAvailableUsage(uid);
    }

    /** Get the usage statistics for a user.
     * @param {string} uid
     * @return {Promise<UsageStats>}
     */
    async getUserUsage(uid) {
        if (typeof uid !== "string" || uid.length === 0) {
            throw new Error("Invalid user ID provided.");
        }
        let [usage, available] = await Promise.all([
            getUserData(uid, "usage"),
            this.getUsersAvailableUsage(uid)
        ]);
        usage = this.parseUserUsage(usage);
        let stats = {
            month: usage.month,
            year: usage.year,
            used: usage,
            available,
            remaining: subtractUsages(available, usage, this.usageTemplate)
        };
        stats.message = `minutes: ${stats.used.minutes}/${stats.available.minutes}, sessions: ${stats.used.sessions}/${stats.available.sessions}, storage: ${stats.used.storage}/${stats.available.storage}`;
        stats.exceeded = stats.remaining.sessions < 0 || stats.remaining.minutes < 0 || stats.remaining.storage < 0;
        return stats;
    }

    /** Get the usage statistics for a user.
     * @param {string} uid
     * @return {Promise<UsageStats>}
     */
    static async getUserUsage(uid) {
        let usageInstance = new Usage();
        await usageInstance.initialise();
        return await usageInstance.getUserUsage(uid);
    }


    /**
     * Update the usage for a user.
     * @param {string} uid
     * @param {TUsage} usageDelta
     */
    async updateUserUsage(uid, usageDelta) {
        if (typeof uid !== "string" || uid.length === 0) {
            throw new Error("Invalid user ID provided.");
        }
        usageDelta = this.parseUserUsage(usageDelta);
        let res = await usersRef(uid, "usage").transaction(lastUsage => {

            let newUsage = this.parseUserUsage(null);
            lastUsage = this.parseUserUsage(lastUsage);

    
            // Check if we need to refresh the usage
            let refresh = lastUsage.month !== usageDelta.month || lastUsage.year !== lastUsage.year;
            for (let key in this.usageTemplate) {
                let isResetable = this.usageTemplate[key].resets;
                newUsage[key] = (refresh && isResetable ? 0 : lastUsage[key]) + usageDelta[key];
            }

            return newUsage;
        });
        return res.committed;
    }

    /**
     * Update the usage for a user.
     * @param {string} uid
     * @param {TUsage} usageDelta
     */
    static async updateUserUsage(uid, usageDelta) {
        let usageInstance = new Usage();
        await usageInstance.initialise();
        return await usageInstance.updateUserUsage(uid, usageDelta);
    }

    /**
     * Check if a user's usage has exceeded their limits.
     * @param {string} uid
     * @return {Promise<boolean>}
     */
    async isUserUsageExceeded(uid) {
        let usage = await getUserUsage(uid);
        return usage.exceeded;
    }
}

module.exports = {
    Usage
};