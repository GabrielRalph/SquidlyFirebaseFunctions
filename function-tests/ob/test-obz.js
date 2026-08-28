const { loadOBZ, assignNewIDs, getPaths } = require("../../functions/OBBoards/obz");
const fs = require("fs");
const { Path, OBFileMetadata, uploadBoardSetToStorage} = require("../../functions/OBBoards/shared");

async function test(file = "./data/unity60.obz", pathRoot = new Path(["Unity", "Unity 60-R2"])) {
    pathRoot = Path.parse(pathRoot);

    const dataBuffer =  fs.readFileSync("./data/unity60.obz");
    const setData = loadOBZ(dataBuffer);

    const oldRoot = setData.manifest.root;
    const [newBoards, old2new] = assignNewIDs(setData.boards);
    const newRoot = old2new[oldRoot];
    const [paths, roots] = getPaths(newBoards);

    console.log("Total of", Object.keys(setData.boards).length, "boards")

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
    for (let boardID in paths) {
        const path = paths[boardID];
        if (path[0] == newRoot) {
            let pagePath = []
            for (let i = 1; i < path.length; i++) {
                const label = getButtonLabelThatLinks(path[i - 1], path[i]);
                pagePath.push(label);
            }
            pagePath = pathRoot.join(new Path(pagePath))
            metadata[boardID] = OBFileMetadata.make({
                path: pagePath.toString(),
                owner: "squidly",
                isDirectory: false,
            });
            boards[boardID] = newBoards[boardID];
        }
    }

    await uploadBoardSetToStorage(metadata, boards)
}
test().then(() => {
    console.log("Test complete");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
}); 