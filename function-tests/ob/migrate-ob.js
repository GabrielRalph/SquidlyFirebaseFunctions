const { fstore, FieldValue } = require("../../functions/firebase");
const { GraphGeneric } = require("../../functions/OBBoards/obz");
const { OBBoard, OBButton, OBImage } = require("../../functions/OBBoards/openboard");
const { BOARD_COLLECTION, OBFileMetadata, Path, uploadBoardSetToStorage } = require("../../functions/OBBoards/shared");
const newTOPICS = require("../data/gtopics-new.json");
const fs = require("fs");

const boardsRef = fstore.collection(BOARD_COLLECTION);

const TYPE_2_STYLES = {
    verb: {
        background_color: "#ff9ea9",
        feature_color: "#e36d7b",
    },
    starter: {
        background_color: "#b0ef95",
        feature_color: "#80e156",
    },
    noun: {
        background_color: "#d7c7ff",
        feature_color: "#8d70d7",
    },
    adjective: {
        background_color: "#ffe894",
        feature_color: "#cdb047",
    },
    normal: {
        background_color: "#a0d4ff",
        feature_color: "#5eb1e6",
    },
    topic: {
        background_color: "#ffddad",
        feature_color: "#d59b48",
    },
    action: {
        background_color: "#a81f00",
        feature_color: "#801700",
    }
}

/**
 * @typedef {Object} GridTopicItem
 * @property {string} displayValue - The display value of the button.
 * @property {boolean} hidden - Whether the button is hidden or not.
 * @property {Object} symbol - The symbol associated with the button.
 * @property {string} symbol.id - The ID of the symbol.
 * @property {string} symbol.url - The URL of the symbol image.
 * @property {string} [topicUID] - The UID of the topic associated with the button.
 * @property {string} type - The type of the button (e.g., "topic", "verb", etc.).
 * @property {string} utterance - The utterance associated with the button.
 */

/**
 * @param {GridTopicItem} squidlyButton - The Squidly button object to convert.
 * @returns {OBButton} - The converted OpenBoard button object.
 */
function gridTopicItemToOBButton(squidlyButton) {
    const { displayValue, hidden, symbol, topicUID, type, utterance } = squidlyButton;

    if (hidden) {
        return [null, null];
    } else {
        let typeFixed = type.replace(/^topic-/, "")
        const styles = TYPE_2_STYLES[typeFixed] || TYPE_2_STYLES.normal;
    
        const button = OBButton.make({
            id: OBButton.newID(),
            ...styles,
            label: displayValue,
            ...(symbol ? {
                image_id: symbol.id,
            }: {}),
            ...(topicUID ? {
                load_board: {
                    id: topicUID,
                }
            }: {}),
            font_size: "medium",
            label_at_bottom: true,
            actions: ["&"],
            vocalization: utterance ?? null,
        })
    
        const image = symbol ? OBImage.make({
            id: symbol.id,
            url: symbol.url,
            width: 100,
            height: 100,
        }) : null;
    
        return [button, image]
    }
}

/**
 * @param {Object} gridTopic - The Squidly grid topic object to convert.
 * @param {string} topicID - The ID to assign to the converted OpenBoard board.
 * @returns {OBBoard} - The converted OpenBoard board object.
 */
function gridTopicToOBBoard(gridTopic, topicID) {
    const {size, items} = gridTopic;
    const [cols, rows] = size.split("x").map(Number);
    let grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
    let images = []
    let buttons = items.map((item, i) => {
        let row = Math.floor(i / cols);
        let col = i % cols;

        let [button, image] = gridTopicItemToOBButton(item);
        if (button) {
            grid[row][col] = button.id;
            images.push(image);
        }   
        return button;
    }).filter(Boolean)

    images = Object.values(Object.fromEntries(images.map(img => [img.id, img])));

    return OBBoard.make({
        id: topicID,
        grid: {
            rows: rows,
            columns: cols,
            order: grid,
        },
        images: images,
        buttons: buttons,
    })
}


function reIDGridTopics(oldTopics) {
    let oldID2NewID = {};
    for (const oldID in oldTopics) {
        const newID = boardsRef.doc().id;
        oldID2NewID[oldID] = newID;
    }

    let newTopics = {};
    for (const oldID in oldTopics) {
        const oldTopic = oldTopics[oldID];

        const newID = oldID2NewID[oldID];
        const newTopic = JSON.parse(JSON.stringify(oldTopic));
        for (const item of newTopic.items) {
            if (item.topicUID) {
                item.topicUID = oldID2NewID[item.topicUID];
            }
        }
        newTopics[newID] = newTopic;
    }

    return newTopics;
}

function getLinkedTopics(topic) {
    return topic.items.filter(item => item.topicUID).map(item => item.topicUID);
}

function getPaths(topics) {
    let getName = (topicID) => topics[topicID]?.name ?? '';
    let getStr = (topicID) => `[${topicID.slice(0,5)}|${getName(topicID)}]`;
    let pathStr = path => path.map(getStr).join(" -> ");
    let getOwner = (topicID) => topics[topicID]?.owner ?? null;

    
    // Create a mapping of topics that lead to each topic (i.e., parent connections)
    let topicsThatLeadTo = {}
    for (const topicID in topics) {
        const linkedTopics = getLinkedTopics(topics[topicID]);
        for (const linkedTopicID of linkedTopics) {
            if (!topicsThatLeadTo[linkedTopicID]) {
                topicsThatLeadTo[linkedTopicID] = new Set();
            }
            topicsThatLeadTo[linkedTopicID].add(topicID);
        }
    }

    // Identify root topics (topics that are not led to by any other topic)
    let rootTopics = Object.keys(topics).filter(topicID => !topicsThatLeadTo[topicID]);

    // Build a graph representation of the topics for easier traversal
    const G = new GraphGeneric(
        topicID => getLinkedTopics(topics[topicID]),
        topicID => topicsThatLeadTo[topicID] ? Array.from(topicsThatLeadTo[topicID]) : []
    );
    // For every root topic, compute the paths from the root to all reachable topics
    let pathesPerRoot = rootTopics.map(id => {
        const pathGroup = {[id]: [id]};
        // console.log("~~ Getting paths for root topic ~~\n\t" + getStr(id));
        let getPath = (topicID) => {
            let parents = [...(topicsThatLeadTo[topicID] || new Set())];
            let p = [...(topicsThatLeadTo[topicID] ?? [])]
                .filter(id => id in pathGroup)
                .map(id => pathGroup[id]);

            if (p.length === 0) {
                throw new Error("No path found for " + getStr(topicID));
            }
              
            let bestPath = p.reduce((a, b) => a.length <= b.length ? a : b, p[0]);
            
            return [...bestPath, topicID];
        }

        for (const id2 of G.breadthFirstSearch(id, false)) {
            pathGroup[id2] = getPath(id2);
            // console.log("\t\t"+pathStr(pathGroup[id2]));
        }

        return pathGroup
    });

    const finalTopicPaths = {}
    for (const topicID in topics) {
        const pGroups = pathesPerRoot.filter(paths => topicID in paths);
        // If there are multiple paths to the same topic, 
        // we need to decide which one to keep as the final path.
        if (pGroups.length > 1) {
            console.log("Multiple path groups found for topicID:", getStr(topicID));
            let sizes = pGroups.map(pGroup => Object.keys(pGroup).length);
            let biggestGroup = pGroups[sizes.indexOf(Math.max(...sizes))];
            for (const pGroup of pGroups) {
                console.log("\t", pGroup === biggestGroup ? "+" : "-", pathStr(pGroup[topicID]));
            }
            finalTopicPaths[topicID] = biggestGroup[topicID];
        } else if (pGroups.length === 1) {
            finalTopicPaths[topicID] = pGroups[0][topicID];
        } else {
            console.warn("No path found for topicID:", topicID);
        }
    }
    return [finalTopicPaths, new Set(rootTopics)];
}



function generateUpdates(topics) {
    let [paths, rootTopics] = getPaths(topics);
    let metadata = {};
    let boards = {}

    for (const topicID in topics) {
        let topic = topics[topicID];
        let isVoco = paths[topicID][0] === "JLYix9KezJaosLusUhkl"
        metadata[topicID] = OBFileMetadata.make({
            path: new Path(paths[topicID].map(id => topics[id].name)).toString(),
            owner: isVoco ? "squidly" : topic.owner,
            isDirectory: false,
            favourite: rootTopics.has(topicID)
        })
        boards[topicID] = gridTopicToOBBoard(topic, topicID);
    }

    return {metadata, boards};
}


// Promise.all(proms).then(() => {
//     console.log("All updates complete");
// }).catch(err => {
//     console.error("Some updates failed", err);
// });
const data = generateUpdates(newTOPICS);
uploadBoardSetToStorage(data.metadata, data.boards).then(() => {
    console.log("Upload complete");
}).catch(err => {
    console.error("Upload failed", err);
});