const { db } = require("../functions/firebase");

db.ref("proxy-links/GabrielsProxy").push({
    hostUID: "s6NoggwP78XlE7LtWnu5Q38VbF32",
    linkedSID: null,
}).then(() => {
    console.log("Proxy created");
}).catch((error) => {
    console.error("Error creating proxy:", error);
})