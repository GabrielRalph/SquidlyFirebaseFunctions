const { fstore, sb, FileStatus, FieldValue } = require("../firebase.js");
const { isNonNullObject } = require("../Shared/shared.js");
const { OBBoard, DataClass } = require("./openboard.js");
const fflate = require("fflate");

const BOARD_COLLECTION = "boards";
const DRAFT_COLLECTION = "draft-boards";

async function encodeBoard(boardJSON) {
    const input = fflate.strToU8(JSON.stringify(boardJSON));
    const compressed = await new Promise((resolve, reject) => {
        fflate.gzip(input, {}, (err, data) => {
            if (err) return reject(err);
            else resolve(data);
        });
    });
    return compressed;
}

async function isSquidlyAdmin(uid) {
    const docSS = await fstore.collection("squidly-board-admins").doc(uid).get()
    return docSS.exists && docSS.data().approved === true;
}

async function isAuthenticated({auth}) {
    if (!isNonNullObject(auth) || auth.uid === undefined || auth.uid === null || auth.uid === "") {
        return "User not authenticated";
    }
}

async function parseBoardObject(data) {
    if (isNonNullObject(data) && isNonNullObject(data.board)) { 
        try {
            const board = OBBoard.make(data.board);
            const binary = await encodeBoard(board);
            if (!binary) {
                return "Failed to compress board data.";
            } else {
                data.encoded = binary;
            }
        } catch (e) {
            return "Invalid board data provided." + e.message;
        }
    } else {
        return "No board data provided.";
    }
}

async function isOwner(uid, boardID) {
    const docSS = await fstore.collection(BOARD_COLLECTION).doc(boardID).get();
    if (!docSS.exists) {
        return [false, null];
    }
    const data = docSS.data();
    if (data.owner === uid) {
        return [true, data];
    } else if (data.owner === "squidly") {
        return [await isSquidlyAdmin(uid), data]
    } else {
        return [false, data]
    }
}

async function uploadBoardToStorage(boardID, encoded) {
    const file = sb.file(`boards/${boardID}`);
    await file.save(encoded, {metadata: {
        contentType: "application/json",
        contentEncoding: "gzip"
    }});
}


const PATH_SEPERATOR = "\\"

class Path {
    #parts = [];
    #path = "";

    /**
     * @param {string} path the string representation of the path
     */
    constructor(path, throwError = false) {
        path = path instanceof Path ? path.path : path;

        let pathString = path;
        let parts = [];
        if (path instanceof Path) {
            parts = path.parts;
            pathString = path.path;
        } if (Array.isArray(path)) {
            parts = path.map(p => String(p)).filter(p => p.length > 0);
            pathString = parts.join(PATH_SEPERATOR);
        } else if (typeof path !== "string" || path.length === 0) {
            if (throwError) {
                throw new Error("Path must be a non-empty string");
            } else {
                pathString = "";
            }
        } else {
            parts = path.split(PATH_SEPERATOR).filter(p => p.length > 0);
            path = parts.join(PATH_SEPERATOR);
        }

        this.#parts = parts
        this.#path = pathString ?? "";
    }

    /**
     * @returns {string} the string representation of the path
     */
    get path() {
        return this.#path;
    }

    /**
     * @returns {string[]} the parts of the path as an array of strings
     */
    get parts() {
        return [...this.#parts];
    }

    /**
     * @returns {number} the number of parts in the path
     */
    get length() {
        return this.#parts.length;
    }

    /**
     * @returns {string} the name of the last part of the path
     */
    get name() {
        return this.#parts[this.#parts.length - 1] || "";
    }

    /**
     * @returns {?Path} 
     */
    get parent() {
        let parent = null;
        if (this.#parts.length > 0) {
            const parentPathArray = this.#parts.slice(0, this.#parts.length - 1);
            parent = new Path(parentPathArray);
        }
        return parent;
    }

    get isRoot() {
        return this.#parts.length === 0;
    }

    /**
     * @param {string|Path} other the other path to join with this path
     * @returns {Path} a new Path object representing the joined path
     */
    join(other) {
        if (!(other instanceof Path)) {
            other = new Path(other);
        }
        return new Path([...this.#parts, ...other.parts]);
    }

    /**
     * @param {string|Path} otherPath the other path to check if it is contained within this path
     * @returns {boolean} true if the other path is contained within this path, false otherwise
     */
    contains(otherPath) {
        if (!(otherPath instanceof Path)) {
            otherPath = new Path(otherPath);
        }
        return this.#parts.every((p, i) => otherPath.parts[i] === p);
    }

    isParentOf(otherPath) {
        if (!(otherPath instanceof Path)) {
            otherPath = new Path(otherPath);
        }
        return this.#parts.length < otherPath.parts.length && this.contains(otherPath);
    }

    relative(otherPath) {
        otherPath = Path.parse(otherPath);
        if (!otherPath.isParentOf(this)) {
            throw new Error(`Path ${otherPath.path} is not a descendant of ${this.path}`);
        }
        return this.slice(otherPath.length)
    }

    same(otherPath) {
        if (!(otherPath instanceof Path)) {
            otherPath = new Path(otherPath);
        }
        return this.#path === otherPath.path;
    }

    /**
     * @param {...number} args the arguments to slice the path parts
     * @returns {Path} a new Path object representing the sliced path
     * 
     * Example:
     * let path = new Path("folderA\\subfolderA\\file1.txt");
     * let slicedPath = path.slice(0, 2); // returns a new Path object with path "folderA\\subfolderA"
     */
    slice(...args) {
        let slicedParts = this.#parts.slice(...args);
        return new Path(slicedParts.join(PATH_SEPERATOR));
    }

    /**
     * @returns {string} the string representation of the path
     */
    toString() {
        return this.path;
    }

    /**
     * @returns {Path} a new Path object that is a clone of this path
     */
    clone() {
        return new Path(this.path);
    }


    static parse(path, throwError = false) {
        if (path instanceof Path) {
            return path;
        } else {
            return new Path(path, throwError);
        }
    }
}

class OBFileMetadata extends DataClass {
    /** @type {string} */
    path;

    /** @type {string} */
    owner;

    /**
     * @type {FieldValue.Timestamp}
     */
    createdAt = FieldValue.serverTimestamp();
    updatedAt = null;
    deletedAt = false;

    isDirectory = false;
    public = false;
    favourite = false;
    effectivePublic = false;

    static get includedDefaultProperties() {
        return [
            "path",
            "owner",
            "createdAt",
            "updatedAt",
            "deletedAt",
            "isDirectory",
            "public",
            "favourite",
            "effectivePublic"
        ];
    }
}


/**
 * @param {Object<string, OBFileMetadata>} metadata
 * @param {Object<string, OBBoard>} boards
 */
async function uploadBoardSetToStorage(metadata, boards) {
    const uploadPromises = Object.entries(metadata).map(async ([boardID, boardMetadata]) => {
        const board = boards[boardID];
        const meta = OBFileMetadata.make(boardMetadata).toJSON();
        meta.updatedAt = FieldValue.serverTimestamp();
        const path = meta.path;
        if (board) {
            try {
                const encoded = await encodeBoard(board);
                try {
                    await uploadBoardToStorage(boardID, encoded);
                    try {
                        await fstore.collection(BOARD_COLLECTION).doc(boardID).set(meta, {merge: true});
                        console.log(`Successfully uploaded board ${path} to storage and updated metadata.`);
                    } catch (e) {
                        console.error(`Failed to update metadata for board ${path}: ${e.message}`);
                    }
                } catch (e) {
                    console.error(`Failed to upload board ${path}: ${e.message}`);
                }
            } catch (e) {
                console.error(`Failed to encode board ${path}: ${e.message}`);
            }
        }
    })
    return Promise.all(uploadPromises);
}

async function deleteBoardPermanently(boardID) {
    try {
        await sb.file(`boards/${boardID}`).delete();
    } catch (e) {
        console.error(`Failed to delete board ${boardID} from storage: ${e.message}`);
    }

    try {
        await fstore.collection(BOARD_COLLECTION).doc(boardID).delete();
    } catch (e) {
        console.error(`Failed to delete board ${boardID} from Firestore: ${e.message}`);
    }

    try {
        await fstore.collection(DRAFT_COLLECTION).doc(boardID).delete();
    } catch (e) {
        console.error(`Failed to delete board ${boardID} from Drafts in Firestore: ${e.message}`);
    }
}

module.exports = {
    encodeBoard,
    isSquidlyAdmin,
    isAuthenticated,
    parseBoardObject,
    isOwner,
    uploadBoardToStorage,
    BOARD_COLLECTION,
    DRAFT_COLLECTION,
    PATH_SEPERATOR,
    Path,
    uploadBoardSetToStorage,
    deleteBoardPermanently,
    OBFileMetadata
};