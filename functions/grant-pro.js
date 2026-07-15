const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'fort-knox-6978d',
});
const db = admin.firestore();

async function main() {
    const email = 'thriftedukay1@gmail.com';
    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        console.log('Successfully fetched user data:', userRecord.toJSON());
        const uid = userRecord.uid;
        
        await db.collection('users').doc(uid).set({
            plan: 'pro',
            subscriptionStatus: 'active',
            // It would be better to have the subscriptionId but we don't have it here. We'll set it manually as active.
        }, { merge: true });
        
        console.log('Successfully upgraded user to pro');
    } catch (error) {
        console.log('Error fetching user data:', error);
    }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
