const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'fort-knox-6978d',
});
const db = admin.firestore();

async function main() {
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('subscriptionStatus', '==', 'on_trial').get();
        
        if (snapshot.empty) {
            console.log('No users found with subscriptionStatus "on_trial".');
            return;
        }

        console.log(`Found ${snapshot.size} users with "on_trial" status. Updating...`);
        
        let batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { subscriptionStatus: 'active' });
        });
        
        await batch.commit();
        console.log('Successfully updated all "on_trial" users to "active".');
    } catch (error) {
        console.error('Error updating users:', error);
    }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
