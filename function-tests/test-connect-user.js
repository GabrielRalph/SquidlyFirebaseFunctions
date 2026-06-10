const { Auth } = require("../functions/firebase");
const { connectUserProfile } = require("../functions/Licences/shared");
const { refPath } = require("../functions/Shared/shared");
async function connectAllUsers() {
    let users = (await refPath("users", []).get()).val();
    for (let uid in users) {
        let user = users[uid];
        if (!user.isDummy && !user.licences) {
            try {
                let auth = await Auth.getUser(uid);
                console.log(`Connecting user ${uid} (${auth.email})...`);
                await connectUserProfile({uid, token: auth});
                console.log(`User ${user.info.firstName} (${auth.email}) connected successfully.`);
            } catch (err) {
                console.error(`Failed to connect user ${uid} (${user.info.firstName}):`, err);
            }
        }
    }
}
connectAllUsers().then((user) => {
    console.log("User connected successfully:", user);
}).catch(err => {
    console.error("Failed to connect user:", err);
}).finally(() => {
    console.log("User connection attempt completed.");
    process.exit(0);
});