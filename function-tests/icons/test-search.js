const { fstore } = require("../../functions/firebase");
const { getTextEmbedding, startTimer } = require("../../functions/GridSymbols/vectorEmbedd");

async function getQuerySize(query) {
    const snapshot = await query.get();
    const payload = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    const jsonBytes = Buffer.byteLength(
        JSON.stringify(payload),
        "utf8"
    );
    return jsonBytes;
}

async function getQueryStats(query) {
    const [responseSize, stats] = await Promise.all([
        getQuerySize(query),
        query.explain({
            analyze: "true"
        }),
    ]);
    const documentsReturned = stats.metrics.executionStats.resultsReturned;
    const readOperations = stats.metrics.executionStats.readOperations;
    const indexEntriesScanned = stats.metrics.executionStats.debugStats.index_entries_scanned;
    return { 
        responseSize,
        documentsReturned,
        readOperations,
        indexEntriesScanned
    };
}

async function printTable(objList) {
    console.table(objList);
}



const COL = fstore.collection("icons");
async function search_vector(text) {
    let iconInfo = [];
    try {
        let end = startTimer();
        let embedding = await getTextEmbedding(text);
        console.log(`GRID-SYMBOLS: Embedding phrase ${text} took ${end()}ms`);
        end = startTimer();
        
        const tests = [
            ["L50", 50],
        ];
        
        const stats = Object.fromEntries(await Promise.all(tests.map(async ([name, limit]) => {
              // query for public and users in parallel
            let q = COL
                .where("public", "==", true)
                .where("iconSetPath", ">", "SCHS")
            q = q.select("name", "url", "uid", "title", "iconSetPath");
                // .select("name", "url", "uid")
            q = q.findNearest({
                vectorField: 'embedding',
                queryVector: embedding,
                limit: limit,
                distanceMeasure: 'EUCLIDEAN',
                distanceResultField: 'vector_distance'
            });
            
            const stats = await getQueryStats(q);
            return [name, {...stats, limit}]
        })));
        printTable(stats)
    } catch (e) {
        console.log(e);
    }

    return iconInfo;
}


search_vector("big tower").then(results => console.log(results));

