
const fs = require("fs");
const lampOB = require("../data/lamp-ob.json");
const lampID = require("../data/lamp-id.json");
const icons = require("../data/icons.json")
const { fstore } = require("../../functions/firebase");
const { BOARD_COLLECTION, Path, OBFileMetadata, uploadBoardSetToStorage, uploadBoardToStorage, encodeBoard } = require("../../functions/OBBoards/shared");
const { OBImage, OBButton, OBBoard } = require("../../functions/OBBoards/openboard");
const { getPaths, boardPathToButtonPath } = require("../../functions/OBBoards/obz");

const iconsByName = {}
for (const [ID, icon] of Object.entries(icons)) {
    const name = icon.name.toUpperCase();
    if (!(name in iconsByName)) iconsByName[name] = new Set();
    iconsByName[name].add(ID);
}

const lampOBp = Object.fromEntries(Object.entries(lampOB).map(([k, v]) => [k, OBBoard.make(v)]));


/**
 * @typedef {Object} ActionData
 * @property {string} key - The normalized key.
 * @property {string} value - The corresponding value.
 * 
 * Parses a string of key-value pairs into an array of objects with normalized keys.
 * @param {string} dataString - The string of key-value pairs, e.g. "Linked Page: 33, Value: 0"
 * @returns {ActionData[]} An array of objects with normalized keys and their corresponding values.
 */
function parseActionData(dataString) {
    return dataString.split(",").map(s => {
        let [key, value] = s.split(":").map(str => str.trim());
        let data = null;
        if (key !== "" && value !== undefined && value !== "") {
            if (key === "Linked Page" || key === "Page") key = "linkedPage";
            else if (key === "Value") key = "value";
            else if (key === "Linked Resource") key = "rid";
            data = { key, value };
        }
        return data;
    }).filter(Boolean);
}

/**
 * @typedef {Object} Action
 * @property {number} code - The action code.
 * @property {number} rank - The action rank.
 * @property {ActionData[]} data - The associated action data.
 * 
 * Parses a string of actions into an array of individual actions.
 * @param {string} actionString - The string e.g. "C34 R0 | C1 R2 Linked Page: 33, Value: 0"
 * @returns {Action[]} An array of individual actions.
 */
function parseActions(actionString) {
    return actionString.split("|").map(str => {
        str = str.trim();
        const match = str.match(/C(\d+)\s+R(\d+)\s*/);
        let action = null;
        if (match) {
            action = {
                code: parseInt(match[1]),
                rank: parseInt(match[2]),
                data: parseActionData(str.slice(match[0].length))
            }
        }
        return action;
    }).filter(Boolean);
}

const INFLECT_MODES = {
    3: "s",
    4: "ing",
    1: "ed",
    5: "er",
    6: "est"
}

const ACTION_CODES = {
    65: {
        description: 'inflect',
        toOBActions: (a) => [":inflect_" + (INFLECT_MODES[a.data[0]?.value]??"s")]
    },

    4: {
        description: 'play audio file',
    },

    6: {
        description: 'Go back',
        toOBActions: () => [":back"]
    },

    7: {
        description: 'Go back',
        toOBActions: () => [":back"]
    },

    8: {
        description: 'Goto page and hold the page',
        toOBActions: () => [`:hold`]
    },

    39: {
        description: 'placeholder',
    },

    10: {
        description: 'Add word and return',
        toOBActions: (a, b) => {
            let res = []
            if (b.message !== undefined) {
                if (b.message === " ") {
                    res = [":space"]
                } else {
                    let m = b.message;
                    if (m[0] === " ")  res.push(":space");

                    let mt = m.trim();
                    res.push("+" + ((mt === (b.label ?? "")) ? "" : mt))

                    if (m[m.length-1] === " ")   res.push(":space");
                }
            }
            res.push(":return")
            res.push(":speak_last_word")
            return res;
        }
    },

    40: {
        description: 'Volume up',
        toOBActions: () => [":volume_up"]
    },

    41: {
        description: 'Volume down',
        toOBActions: () => [":volume_down"]
    },

    42: {
        description: 'adds phonics',
        toOBActions: (a, b) => {
            let res = []
            if (b.message !== undefined) {
                if (b.message === " ") {
                    res = [":space"]
                } else {
                    let m = b.message;
                    if (m[0] === " ")  res.push(":space");

                    let mt = m.trim();
                    res.push("+" + ((mt === (b.label ?? "")) ? "" : mt))

                    if (m[m.length-1] === " ")   res.push(":space");
                }
            }
            res.push(":return")
            res.push(":speak_last_word")
            return res;
        },
    },

    43: {
        description: 'Delete currently typed word',
        toOBActions: () => [":delete_word"],
    },

    73: {
        description: 'Goto to page',
    },

    16: {
        description: 'Backspace',
        toOBActions: () => [":backspace"]
    },

    74: {
        description: 'Open Word finder',
        toOBActions: () => [":open_word_finder"]
    },
    20: {
        description: 'speaks everythin',
        toOBActions: () => [":speak"]
    },
    28: {
        description: 'Clear everything',
        toOBActions: () => [":clear"]
    },
    29: {
        description: 'speaks last word',
        toOBActions: () => [":speak_last_word"]
    },
    30: {
        description: '',
    }
}

const FONT_HEIGHTS =  {
    6: "tiny",
    7: "tiny",
    9: "small",
    30: "giant",
}

function assignNewIDs(lampdata) {
    const boardRef = fstore.collection(BOARD_COLLECTION);

    const newData = {};
    const oldID2newIDs = {}
    for (const pageID in lampdata) {
        const newID = boardRef.doc().id;
        oldID2newIDs[pageID] = newID;

        const newPage = JSON.parse(JSON.stringify(lampdata[pageID]));
        newData[newID] = newPage;
    }


    for (const newID in newData) {
        const newPage = newData[newID];
        for (const button of newPage.buttons) {
            if (button.linked_page) {
                if (button.linked_page in oldID2newIDs) {
                    button.linked_page = oldID2newIDs[button.linked_page];
                } else {
                    console.warn(`Linked page ${button.linked_page} not found in oldID2newIDs`);
                }
            }
        }
    }


    return newData;
}
function lampButtonToOBButton(button) {
    let image = null;
    let buttonJSON = {}


    let iconName = button.icon_file
    if (iconName) {
        iconName = iconName.toUpperCase();
        if (iconName in iconsByName) {
            const iconID = iconsByName[iconName];
            const url = icons[iconID].url;
            image = OBImage.make({
                url: url,
                id: iconID,
                width: 222,
                height: 186,
            });
            buttonJSON.image_id = iconID
        } else {
            console.log(`Icon ${iconName} not found in iconsByName`);
        }
    }

    if (button.style) {
        const style = button.style;
        if (style.body_color) {
            const bodyColor = button.style.body_color;
            buttonJSON.background_color = "#" + bodyColor.toString(16).padStart(6, '0');
        }

        if (style.font_height) {
            const fontHeight = style.font_height;
            buttonJSON.font_size = FONT_HEIGHTS[fontHeight] ?? "medium";
        }
    }

    if (button.actions) {
        const actions = parseActions(button.actions);
        let obActions = actions.flatMap(action => {
            const code = action.code;
            const mapper = ACTION_CODES[code]?.toOBActions ?? (() => []);
            return mapper(action, button);
        });

        let spaceIndex = obActions.findIndex(action => action === ":space");
        let backspaceIndex = obActions.findIndex(action => action === ":backspace");
        if (spaceIndex !== -1 && backspaceIndex !== -1 && spaceIndex < backspaceIndex) {
            obActions = obActions.filter((a, i) => i !== spaceIndex && i !== backspaceIndex);
        }

        buttonJSON.actions = obActions;
    }

    if (button.linked_page) {
        buttonJSON.load_board = {
            id: button.linked_page
        }
    }

    if (button.label) {
        buttonJSON.label = button.label;
    }

    buttonJSON.id = "B"+button.pos;

    return [OBButton.make(buttonJSON), image];
}
function lampPageToOBBoard(page, id) {
    const [columns, rows] = page.layout;


    const buttonByID = {};
    const imagesByID = {};

    for (const button of page.buttons) {
        const [obButton, image] = lampButtonToOBButton(button);
        buttonByID[obButton.id] = obButton;
        if (image) {
            imagesByID[image.id] = image;
        }
    }

    return OBBoard.make({
        id,
        grid: {
            columns,
            rows,
            order: order = Array.from({ length: rows}, (_, r) => 
                Array.from({ length: columns}, (_, c) => {
                    let id = `B${r}-${c}`;
                    return id in buttonByID ? id : null;
                })
            )
        },
        buttons: Object.values(buttonByID),
        images: Object.values(imagesByID),
    })
}



const [IDPaths, roots] = getPaths(lampOBp);
const root = new Path("LAMP");
const paths = Object.fromEntries(Object.entries(IDPaths).map(([id, path]) => [id, root.join(boardPathToButtonPath(path, lampOBp)).toString()]));
const boards = {};
const metadata = {};



function getCorrectIcon(iset) {
    return [...iset].find(id => {
        const icon = icons[id];
        return typeof icon.iconSetPath === "string" && icon.iconSetPath.length > 0;
    } );
}


const flags = {}
let errorCount = 0;
for (let pageID in lampID) {
    const page = lampID[pageID];
    const board = lampOBp[pageID];
    for (const button of page.buttons) {
        if (button.icon_file) {
            const obbutton = board.getButtonByID("B"+button.pos);

            let file = button.icon_file.toUpperCase();
            if (file in iconsByName) {
                let iset = iconsByName[file];
                if (iset.size > 1) {
                    const correctIconID = getCorrectIcon(iset);
                    if (obbutton.image_id !== correctIconID) {
                        errorCount++;
                        if (!(board.id in flags)) {
                            flags[board.id] = {}
                        }
                        flags[board.id][button.pos] = [
                            obbutton.image_id,
                            correctIconID
                        ]
                    }
                }
            }
        }
    }
}

function iconStr(id) {
    return `${icons[id].iconSetPath ?? "x"}|${(icons[id].uid??"x").slice(0, 5)}`;
}

const boards2update = {}
for (let fPageID in flags) {
    const pagePath = paths[fPageID];
    const board = lampOBp[fPageID];
    console.log(`\nIcon mismatches for ${pagePath}`);
    for (let button of board.buttons) {
        if (button.background_color) {
            let oc = button.background_color;
            button.background_color =  "#" + oc.slice(5) + oc.slice(3, 5) + oc.slice(1,3)
        }
    }
    for (let buttonPos in flags[fPageID]) {
        const [currentIconID, correctIconID] = flags[fPageID][buttonPos];
        // console.log(`\tButton ${buttonPos}\n\t\tcurrent icon = ${iconStr(currentIconID)}\n\t\tcorrect icon = ${iconStr(correctIconID)}`);
        board.images.push(OBImage.make({
            id: correctIconID,
            url: icons[correctIconID].url,
            width: 222,
            height: 186,
        }))
        board.getButtonByID("B"+buttonPos).image_id = correctIconID;
    }
    let usedImages = new Set(board.buttons.map(button => button.image_id??null).filter(Boolean));
    board.images = board.images.filter(image => usedImages.has(image.id));
    boards2update[fPageID] = board;
}

Promise.all(Object.entries(boards2update).map(async ([fPageID, board]) => {
    const encoded = await encodeBoard(board);
    await uploadBoardToStorage(fPageID, encoded);
    console.log(`Successfully uploaded board ${paths[fPageID]} to storage.`);
})).then(() => {
    console.log("All boards successfully uploaded.");
});