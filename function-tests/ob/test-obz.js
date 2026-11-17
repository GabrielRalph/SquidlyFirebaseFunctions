const { loadOBZ, assignNewIDs, getPaths, getNewBoardID, getDocByPath } = require("../../functions/OBBoards/obz");
const fs = require("fs");
const { Path, OBFileMetadata, uploadBoardSetToStorage} = require("../../functions/OBBoards/shared");
const path = require("path");

async function test(file = "./data/unity60.obz", pathRoot = new Path(["Unity", "Unity 60-R2"])) {
    pathRoot = Path.parse(pathRoot);

    const dataBuffer =  fs.readFileSync(file);
    const setData = loadOBZ(dataBuffer);

    const boardPaths = setData.manifest.paths.boards;
    const path2boardID = Object.fromEntries(
        Object.entries(boardPaths).map(([boardID, path]) => [path, boardID])
    );

    fs.writeFileSync("./data/boards.json", JSON.stringify(setData.boards, null, 2))
    
    // Make sure all load_board objects have corresponding board IDs
    for (let boardID in setData.boards) {
        const board = setData.boards[boardID];
        for (let button of board.buttons) {
            if (button.load_board) {
                const loadBoardID = button.load_board.id;
                if (!(loadBoardID in path2boardID)) {
                    const loadBoardPath = button.load_board.path;
                    if (loadBoardPath in path2boardID) {
                        const correspondingBoardID = path2boardID[loadBoardPath];
                        // You can now use correspondingBoardID as needed
                        button.load_board.id = correspondingBoardID;
                    } else {
                        console.warn(`Load board path ${loadBoardPath} on button ${button.id} in board ${boardID} does not have a corresponding board ID.`);
                    }
                } 
            }
        }
    }


    const oldRootPath = setData.manifest.root;
    const oldRoot = path2boardID[oldRootPath];

    const [newBoards, old2new] = assignNewIDs(setData.boards);
    const newRoot = old2new[oldRoot];
    console.log("Old root:", oldRoot);
    console.log("New root:", newRoot);
    const [paths, roots] = getPaths(newBoards, [newRoot]);

    
    let getButtonLabelThatLinks = (id1, id2) => {
        const board = newBoards[id1];
        const button = board.buttons.find(button => button.load_board?.id === id2);
        if (button) {
            return button.label || button.id;
        }
        return "NULL";
    }

    const metadata = {}
    const boards = {}
    const pathBoardList = [];
    const oneRoot = roots.size === 1;
    for (let boardID in paths) {
        const pagePathParts = []
        const path = paths[boardID];

        if (!oneRoot) {
            const root = newBoards[path[0]];
            const rootName = root.name || root.id
            pagePathParts.push(rootName);
        }

        for (let i = 1; i < path.length; i++) {
            const label = getButtonLabelThatLinks(path[i - 1], path[i]);
            pagePathParts.push(label);
        }

        const pagePath = pathRoot.join(new Path(pagePathParts))
        pathBoardList.push([boardID, pagePath.toString()]);
        metadata[boardID] = OBFileMetadata.make({
            path: pagePath.toString(),
            owner: "squidly",
            isDirectory: false,
        });
        boards[boardID] = newBoards[boardID];
    }


    pathBoardList.sort((a, b) => a[1].localeCompare(b[1]));
    pathBoardList.forEach(([boardID, path]) => {
        console.log(`${boardID}: ${path}`);
    });

    for (let i = 1; i <= (pathRoot.length - (oneRoot ? 1 : 0)); i++) {
        let dirPath = pathRoot.slice(0, i);
        const id = getNewBoardID()
        console.log(`Creating directory for path: ${dirPath.toString()}`);
        metadata[id] = OBFileMetadata.make({
            path: dirPath.toString(),
            owner: "squidly",
            isDirectory: true,
        });
    }


    // await boardCol.where("path", "==", dirPath).where("owner", "==", meta.owner).get();
    // const res = await getDocByPath(new Path(["CommuniKate"]).toString(), "squidly")
    // await uploadBoardSetToStorage(metadata, boards)
}


test(
    "./data/CommuniKate20.obz",
    new Path(["CommuniKate", "CommuniKate 20"])
).then(() => {
    console.log("Test complete");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
}); 