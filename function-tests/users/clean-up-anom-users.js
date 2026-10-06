const { Auth } = require("../../functions/firebase");


/**
 * @param {UserRecord}
 */
function isAnonymous(record) {
    return record.providerData.length === 0 && record.email === undefined && !record.emailVerified
}
function isOld(record, date) {
    let rDate = new Date(record.metadata.lastSignInTime);
    return rDate < date
}

async function deleteOldAnonymousUsers() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let nextPageToken;
  let totalDeleted = 0;

  try {
    do {
      // 2. Fetch users in batches of 1000
      let {users, pageToken} = await Auth.listUsers(1000, nextPageToken);
      const usersToDelete = users.filter(u => isAnonymous(u) && isOld(u, thirtyDaysAgo))

      console.log(`fetched ${users.length} users of which ${usersToDelete.length} are old anonymous accounts`)

      // 4. Delete the filtered users in a batch
      if (usersToDelete.length > 0) {
        console.log(`Deleting a batch of ${usersToDelete.length.toFixed(1)} anonymous users...`);
        const deleteResult = await Auth.deleteUsers(usersToDelete.map(u => u.uid));
        
        totalDeleted += deleteResult.successCount;
        console.log(`Successfully deleted ${deleteResult.successCount} users.`);
        
        if (deleteResult.failureCount > 0) {
          console.error(`Failed to delete ${deleteResult.failureCount} users.`);
          deleteResult.errors.forEach(err => console.error(`Error: ${err.error.message}`));
        }
      }

      nextPageToken = pageToken;
    } while (nextPageToken);

    console.log(`Cleanup finished. Total anonymous users deleted: ${totalDeleted}`);
  } catch (error) {
    console.error('Error listing or deleting users:', error);
  }
}

// Run the function
deleteOldAnonymousUsers().then(() => {
    process.exit(0)
})