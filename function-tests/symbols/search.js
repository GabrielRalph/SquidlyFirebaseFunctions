const { validateData } = require("../../functions/Shared/shared");
const { SEARCH_VALIDATORS } = require("../../functions/Symbols/symbols");

async function test() {
    let req = {
        auth: {
            uid: "s6NoggwP78XlE7LtWnu5Q38VbF32"
        },
        data: {
            symbol_sets: ["JELLOW", "MULBERRY", "ARASAAC"],
            query_text: "jelly"
        }
    }

    let errors = [];
    await validateData(req, SEARCH_VALIDATORS, errors);
    console.log("Errors:")
    for (const error of errors) {
        console.log("\t" + error.replace(/\n/g, "\n\t"));
    }

    console.log("Results:" );
    console.table((req?.data?.results ?? []).map(r => ({Name: r.title ?? r.search_phrase, "Symbol Set": r.symbol_set, distance: r.min_distance.toFixed(3), url: r.url})));
}

test().then(() => {
    console.log("Test completed");
}).catch(err => {
    console.error("Test failed", err);
});