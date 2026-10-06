const { db } = require("../../functions/firebase");

async function test(){
    
    let allUsers = db.ref('users');
    let snapshot = await allUsers.get();
    let users = snapshot.val();
    for (let uid in users) {
        let info = users[uid].info;
        if (!info)  {
            console.error("User with uid", uid, "has no info");
        } else {
            let email = info.email || "";
            if (email.indexOf("@cerebral") !== -1) {
                console.log("CPA user with uid", uid, "and email", email);
                console.log(users[uid].usage)
                console.log(users[uid]["session-history"])
            }
        }
    }
}
test();