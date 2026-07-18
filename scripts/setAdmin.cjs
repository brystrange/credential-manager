const admin = require("firebase-admin");
// You will need to generate a private key JSON file from the Firebase Console (Service Accounts)
// and place it in the same directory as this script, or update the path below.
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = process.argv[2];
const action = process.argv[3] || "grant"; // "grant" or "revoke"

if (!uid) {
  console.error("Usage: node setAdmin.cjs <UID> [grant|revoke]");
  process.exit(1);
}

async function updateAdminRole() {
  try {
    const isAdmin = action !== "revoke";
    await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
    console.log(`Success! Admin claim ${isAdmin ? 'granted to' : 'revoked from'} user: ${uid}`);
    console.log("The user must sign out and sign back in for the changes to take effect.");
    process.exit(0);
  } catch (error) {
    console.error("Error setting admin claim:", error);
    process.exit(1);
  }
}

updateAdminRole();
