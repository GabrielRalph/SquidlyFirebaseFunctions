const { debug } = require("firebase-functions/logger");
const { refPath } = require("./Shared/shared");

const DEBUG = debug
const DEFAULTS = {
    leaseMs: 45000,
    acquireTimeoutMs: 45000,
};

function normalizePath(path) {
    if (typeof path !== "string") {
        throw new Error("Lock path must be a string.");
    }
    const parts = path
        .split("/")
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length === 0) {
        throw new Error("Lock path cannot be empty.");
    }
    return parts;
}

function createOwnerID(prefix = "lock") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class RTDBLock {
    #owner = null;
    #locked = false;
    constructor(path, options = {}) {
        options = options || {};
        this.aquireTimeoutMs = Number.isFinite(options.acquireTimeoutMs)
            ? Math.max(0, Math.floor(options.acquireTimeoutMs))
            : DEFAULTS.acquireTimeoutMs;
        this.leaseMs = Number.isFinite(options.leaseMs)
            ? Math.max(1000, Math.floor(options.leaseMs))
            : DEFAULTS.leaseMs;

        this.path = normalizePath(path);
        this.ref = refPath("rtdb-locks", this.path);
        this.id = 0;
    }


    log(arg, prefix = "") {
        DEBUG(prefix + `\tL${this.id}:`, arg);
    }


    async _setLock() {
        const now = Date.now();
        const {leaseMs} = this;
        const owner = this.#owner;
        const result = await this.ref.transaction(current => {
            const isExpired = !current || typeof current.expiresAt !== "number" || current.expiresAt <= now;
            const isOwnedByCaller = current && current.owner === owner;
            if (isExpired || isOwnedByCaller) {
                return {
                    owner,
                    acquiredAt: now,
                    expiresAt: now + leaseMs,
                };
            }
            return;
        });

        if (result.committed && result.snapshot?.val()?.owner === owner) {
            return true;
        }
        return false;
    }

    async _waitForLock(timeoutMs) {
        let tStart = Date.now();
        let timeouts = []
        let onValue;
        const noTimeout = await new Promise((resolve, reject) => {
            onValue = snapshot => {
                const data = snapshot.val();
                if (data) {
                    // If the lock is held by us, we can proceed
                    if (data.owner === this.#owner) {
                        resolve(true);

                    // We don't own the lock
                    } else {
                        let {expiresAt} = data;

                        if (typeof expiresAt === "number") {
                            let timeLeft = expiresAt - Date.now();
                            if (timeLeft <= 0) {
                                resolve(true);
                            
                            // If the lock is still held by someone else, 
                            // but it will expire before our timeout, 
                            // wait for it to expire
                            } else if (timeLeft < timeoutMs - (Date.now() - tStart)){
                                // Wait for the lock to expire or be released
                                timeouts.push(setTimeout(() => {
                                    resolve(true);
                                }, timeLeft));
                            }
                        
                        // If the lock has an invalid expiresAt, we can proceed
                        } else {
                            resolve(true);
                        }
                    }

                // No lock is held, we can proceed
                } else {
                    resolve(true);
                }
            }
            this.ref.on("value", onValue);
            timeouts.push(setTimeout(() => resolve(false), timeoutMs))
        })
        this.ref.off("value", onValue);
        timeouts.forEach(t => clearTimeout(t));

        if (!noTimeout) {
            throw new Error(`L${this.id}: Timeout waiting for lock at path: ${this.path.join("/")}`);
        }
    }


    async acquire() {
        if (this.#locked) {
            throw new Error("Lock is already acquired by this instance.");
        }

        this.#owner = createOwnerID("rtdb");
        let totalTime = this.aquireTimeoutMs
        while (true) {
            let startTime = Date.now();
            // Wait for the lock to be released or timeout
            this.log(`Waiting for lock`)
            await this._waitForLock(totalTime);
            this.log(`Lock released, trying to acquire`);


            // The lock should now be available, try to set it
            if (await this._setLock()) {
                this.log(`Lock acquired`);
                this.#locked = true;
                return true;
            }
            
            // If we failed to set the lock, it means someone else 
                // acquired it before us. Loop and try again.
            totalTime -= (Date.now() - startTime);

            if (totalTime <= 0) {
                throw new Error(`L${this.id}: Failed to acquire lock at path: ${this.path.join("/")}`);
            } else {
                this.log(`Failed to acquire lock, retrying... [${totalTime}ms left]`);
            }
        }
    }

    async release() {
        const result = await this.ref.transaction(current => {
            let now = Date.now();
            let str = current ? `Current: ${current.owner} \n\t\t\tacquiredAt: ${current.acquiredAt - now} \n\t\t\texpiresAt: ${current.expiresAt - now}` : "No current lock";
            this.log(`Releasing lock\n\t\t\t${str}`, "\t");
            if (current ? current.owner === this.#owner : true) {
                return null;
            }
            return;
        });

        if (!!result.committed) {
            this.#locked = false;
            this.log(`Lock released`);
        } else {
            this.log(`Failed to release lock, it may have been released or expired already.`);
        }
    }
}


module.exports = {
    RTDBLock
};