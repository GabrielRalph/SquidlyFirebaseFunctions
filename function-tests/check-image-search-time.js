const { fstore } = require("../functions/firebase");
const { search_vector, search } = require("../functions/GridSymbols/gridSymbols-search");
const { getEmbedding, getTextEmbedding } = require("../functions/GridSymbols/vectorEmbedd");

const collection = fstore.collection("icons");
async function searchImage() {
    const t0 = performance.now();
    const embedding = await getTextEmbedding("test")
    console.log("Embedding:", embedding);
    const dt = performance.now() - t0;
    console.log(`Time taken to get embedding: ${dt} ms`);

    // Perform the search using the embedding
    const t1 = performance.now();
    collection.findNearest({
        vectorField: 'embedding',
        queryVector: embedding,
        limit: 100,
        distanceMeasure: 'EUCLIDEAN',
        distanceResultField: 'vector_distance'
    })
    const dt2 = performance.now() - t1;
    console.log(`Time taken to perform search: ${dt2} ms`);

    return dt;
}
searchImage().then(() => {
    console.log("Search completed.");
}).catch((error) => {
    console.error("Error during search:", error);
});