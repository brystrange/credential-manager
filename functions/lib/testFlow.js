"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDowngradeFlow = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
exports.testDowngradeFlow = (0, https_1.onRequest)(async (req, res) => {
    var _a;
    try {
        const testUid = "test_downgrade_" + Date.now();
        console.log(`[1] Creating test user (Pro) with UID: ${testUid}`);
        const db = admin.firestore();
        await db.collection("users").doc(testUid).set({
            email: "test@example.com",
            plan: "pro",
            subscriptionStatus: "active",
            subscriptionId: "sub_12345"
        });
        console.log(`[2] Adding 12 credentials...`);
        const credRef = db.collection("users").doc(testUid).collection("credentials");
        for (let i = 1; i <= 12; i++) {
            await credRef.add({
                platform: `Platform ${i}`,
                createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + i * 1000))
            });
        }
        console.log(`[3] Simulating 'subscription_expired'...`);
        const credCountSnap = await credRef.count().get();
        const credCount = credCountSnap.data().count;
        let gracePeriodEnd = null;
        if (credCount > 10) {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            gracePeriodEnd = admin.firestore.Timestamp.fromDate(d);
        }
        await db.collection("users").doc(testUid).update({
            plan: "free",
            subscriptionStatus: "expired",
            downgradeGracePeriodEnd: gracePeriodEnd
        });
        console.log(`[4] Simulating time travel...`);
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        await db.collection("users").doc(testUid).update({
            downgradeGracePeriodEnd: admin.firestore.Timestamp.fromDate(pastDate)
        });
        console.log(`[5] Running 'autoDeleteExcessData' cron job logic inline...`);
        const now = admin.firestore.Timestamp.now();
        const expiredUsersSnap = await db.collection("users")
            .where("downgradeGracePeriodEnd", "<=", now)
            .get();
        for (const doc of expiredUsersSnap.docs) {
            const uid = doc.id;
            const cSnap = await db.collection("users").doc(uid).collection("credentials").count().get();
            let cCount = cSnap.data().count;
            if (cCount > 10) {
                const excessCount = cCount - 10;
                const newestCreds = await db.collection("users").doc(uid).collection("credentials")
                    .orderBy("createdAt", "desc")
                    .limit(excessCount)
                    .get();
                const batch = db.batch();
                newestCreds.docs.forEach(c => batch.delete(c.ref));
                await batch.commit();
            }
            await db.collection("users").doc(uid).update({
                downgradeGracePeriodEnd: admin.firestore.FieldValue.delete()
            });
        }
        console.log(`[6] Verifying...`);
        const finalCredCountSnap = await credRef.count().get();
        const finalCredCount = finalCredCountSnap.data().count;
        const finalUser = await db.collection("users").doc(testUid).get();
        const graceCleared = ((_a = finalUser.data()) === null || _a === void 0 ? void 0 : _a.downgradeGracePeriodEnd) === undefined;
        res.json({
            success: finalCredCount === 10 && graceCleared,
            finalCredCount,
            graceCleared
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=testFlow.js.map