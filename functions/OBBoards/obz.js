const { fstore, FieldValue } = require("../firebase");
const { OBBoard, DataClass, OBLoadBoard, OBButton } = require("./openboard");
const { BOARD_COLLECTION, Path, encodeBoard, uploadBoardToStorage } = require("./shared");
const fflate = require("fflate");


class GraphGeneric {
    constructor(getChildren, getParents) {
        this.getChildren = getChildren;
    }

    *breadthFirstSearch(rootID, includeRoot = true) {
        let queue = [rootID];
        let visited = new Set();

        while (queue.length > 0) {
            const current = queue.shift();
            if (!visited.has(current)) {
                visited.add(current);

                if (includeRoot || current !== rootID) {
                    yield current;
                }

                const children = this.getChildren(current);
                for (const child of children) {
                    if (!visited.has(child)) {
                        queue.push(child);
                    }
                }
            }
        }
    }
}

class OBManifestPaths extends DataClass {
    /** 
     * A mapping of board IDs to their corresponding file paths in the manifest.
     * @type {Object.<string, string>} */
    boards;

    /**
     * A mapping of image IDs to their corresponding file paths in the manifest.
     * @type {Object.<string, string>}
     */
    images = null;

    /**
     * A mapping of sound IDs to their corresponding file paths in the manifest.
     * @type {Object.<string, string>}
     */
    sounds = null;
}

class OBManifest extends DataClass {
    /** 
     * The ID of the root board to load when the manifest is loaded,
     * which should correspond to a board ID 
     * or board path in the manifest paths.
     * @type {string} */
    root;

    /** 
     * The paths to the boards, images, and sounds used in the board set,
     * where each path is a string that can be relative to the manifest URL.
     * @type {OBManifestPaths} */
    paths;
    static paths_parser(value) { return OBManifestPaths.make(value); }

    // /** @type {OBImage[]} */
    // images = [];
    // static images_parser(value) { return value ? value.map(i => OBImage.make(i)) : []; }

    /** 
     * The open-board-set format version, which should be 
     * "open-board-set-0.1" for this version of the manifest.
     * @type {string} */
    format = "open-board-set-0.1";

}   

/**
 * @param {Buffer} dataBuffer - The OBZ data buffer to load.
 * @property {OBManifest} manifest - The manifest loaded from the OBZ.
 * @property {Object.<string, OBBoard>} boards - A mapping of board IDs to their corresponding OBBoard objects loaded from the OBZ.
 * @returns {{manifest: OBManifest, boards: Object.<string, OBBoard>}} An object containing the manifest and boards loaded from the OBZ.
 */
function loadOBZ(dataBuffer) {
    // Unzip the data buffer using fflate
    const unzipped = fflate.unzipSync(dataBuffer);
     const nOBF = Object.keys(unzipped).filter(a => a.endsWith("obf")).length;
    const nMani = Object.keys(unzipped).filter(a => a.endsWith("manifest.json")).length;
    console.log(`Zip file contains ${Object.keys(unzipped).length} files, including ${nOBF} board files and ${nMani} manifests.`);

    // Find the manifest file in the unzipped data
    const manifestFile = Object.keys(unzipped).find(key => key.endsWith("manifest.json"));
    if (!manifestFile) {
        throw new Error("Manifest file not found in OBZ.");
    }
    // Parse the manifest JSON
    const manifestJSON = JSON.parse(fflate.strFromU8(unzipped[manifestFile]));
    const manifest = OBManifest.make(manifestJSON);

   

    // Load the boards, images, and sounds from the unzipped data
    const boards = {};
    for (const [boardID, boardPath] of Object.entries(manifest.paths.boards)) {
        const boardFile = Object.keys(unzipped).find(key => key.endsWith(boardPath));
        if (!boardFile) {
            throw new Error(`Board file not found for board ID ${boardID}.`);
        }
        const boardJSON = JSON.parse(fflate.strFromU8(unzipped[boardFile]));
        boards[boardID] = OBBoard.make(boardJSON);
    }

    return {
        manifest,
        boards,
    }
}



/**
 * @param {Object<string, OBBoard>} oldBoards - The mapping of old board IDs to their corresponding OBBoard objects.
 * @returns {Object<string, OBBoard>} A mapping of new board IDs to their corresponding OBBoard objects with updated IDs.
 */
function assignNewIDs(oldBoards) {
     const boardsRef = fstore.collection(BOARD_COLLECTION);

    let oldID2NewID = {};
    for (const oldID in oldBoards) {
        const newID = boardsRef.doc().id;
        oldID2NewID[oldID] = newID;
    }

    const newBoards = {};
    for (const oldID in oldBoards) {
        const oldBoard = oldBoards[oldID];
        const newID = oldID2NewID[oldID];

        const newBoard = OBBoard.make({
            ...oldBoard.toJSON(),
            id: newID,
        })

        newBoard.buttons = newBoard.buttons.map(button => {
            const buttonJSON = button.toJSON();
            if (button.load_board) {
                const oldLinkedID = button.load_board.id;
                if (oldLinkedID in oldID2NewID) {
                    return OBButton.make({
                        ...buttonJSON,
                        load_board: {
                            id: oldID2NewID[oldLinkedID]
                        },
                    });
                } else {
                    console.warn(`Warning: Board ${newID} has a button that references a non-existent board ID ${oldLinkedID}.`);
                    buttonJSON.load_board = null;
                    return OBButton.make(buttonJSON);
                }
            }

            return OBButton.make(buttonJSON);
        });
        
        newBoards[newID] = newBoard;
    }

    return [newBoards, oldID2NewID];
}


/**
 * @param {Object<string, OBBoard>} boards
 * @returns {[Object<string, string[]>, Set<string>]}
 */
function getPaths(boards, specifiedRootBoards = []) {
    const nB = Object.keys(boards).length;
    console.log("Finding paths for", nB, "boards.");
    specifiedRootBoards = Array.isArray(specifiedRootBoards) ? specifiedRootBoards : [];

    let getLinkedBoards = id => (boards[id]?.linkedBoards ?? []).map(b => b.id)
    

    let allBoardIDs = Object.keys(boards);
    
    // Create a mapping of topics that lead to each topic (i.e., parent connections)
    let boardsThatLeadTo = {}
    for (const boardID in boards) {
        const linkedBoards = getLinkedBoards(boardID);

        for (const linkedBoardID of linkedBoards) {
            if (!(linkedBoardID in boards)) {
                console.warn(`Warning: Board ${boardID} links to a non-existent board ID ${linkedBoardID}.`);
            } else {
                if (!boardsThatLeadTo[linkedBoardID]) {
                    boardsThatLeadTo[linkedBoardID] = new Set();
                }
                boardsThatLeadTo[linkedBoardID].add(boardID);
            }
        }
    }

    let getBoardsThatLeadTo = boardID => boardsThatLeadTo[boardID] ? Array.from(boardsThatLeadTo[boardID]) : [];

    // Identify root topics (topics that are not led to by any other topic)
    let rootBoards = [...new Set([
        ...allBoardIDs.filter(id => !boardsThatLeadTo[id]),  // Root by lack of incoming links
        ...specifiedRootBoards // Root by explicit specification
    ])];
    console.log("Identified", rootBoards.length, "root boards out of", nB, "total boards.");

    // Build a graph representation of the topics for easier traversal
    const G = new GraphGeneric(
        getLinkedBoards,
        getBoardsThatLeadTo
    );

    // For every root topic, compute the paths from the root to all reachable topics
    let pathesPerRoot = rootBoards.map(id => {
        const pathGroup = {[id]: [id]};

        let getPath = (boardID) => {
            let p = getBoardsThatLeadTo(boardID)
                .filter(id => id in pathGroup)
                .map(id => pathGroup[id]);

            if (p.length === 0) {
                throw new Error("No path found for " + boardID);
            }
              
            let bestPath = p.reduce((a, b) => a.length <= b.length ? a : b, p[0]);
            
            return [...bestPath, boardID];
        }

        for (const id2 of G.breadthFirstSearch(id, false)) {
            if (id2 in boards) {
                pathGroup[id2] = getPath(id2);
            }
        }

        return pathGroup
    });

    const finalTopicPaths = {}
    for (const boardID in boards) {
        const pGroups = pathesPerRoot.filter(paths => boardID in paths);
        // If there are multiple paths to the same topic, 
        // we need to decide which one to keep as the final path.
        if (pGroups.length > 1) {
            console.log("Multiple path groups found for boardID:", boardID);
            let sizes = pGroups.map(pGroup => Object.keys(pGroup).length);
            let biggestGroup = pGroups[sizes.indexOf(Math.max(...sizes))];
            for (const pGroup of pGroups) {
                console.log("\t", pGroup === biggestGroup ? "+" : "-", pGroup[boardID]);
            }
            finalTopicPaths[boardID] = biggestGroup[boardID];
        } else if (pGroups.length === 1) {
            finalTopicPaths[boardID] = pGroups[0][boardID];
        } else {
            console.warn("No path found for boardID:", boardID);
        }
    }

    return [finalTopicPaths, new Set(rootBoards)];
}


function boardPathToButtonPath(path, boards) {
    let getButtonLabelThatLinks = (id1, id2) => {
        const board = boards[id1];
        const button = board.buttons.find(button => button.load_board?.id === id2);
        if (button) {
            return button.label || button.id;
        }
        return "NULL";
    }
    let newPath = []
    for (let i = 1; i < path.length; i++) {
        const label = getButtonLabelThatLinks(path[i - 1], path[i]);
        newPath.push(label);
    }
    return new Path(newPath);
}



module.exports = {
    loadOBZ,
    getPaths,
    assignNewIDs,
    GraphGeneric,
    boardPathToButtonPath
}