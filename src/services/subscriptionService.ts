import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "on_trial" | "on-trial" | null;

export interface Subscription {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId?: string;
  currentPeriodEnd?: Date | null;
  lsCustomerId?: string;
  downgradeGracePeriodEnd?: Date | null;
  storageUsed?: number;
}

// ─── Real-time subscription listener ────────────────────────────────────────

/**
 * Subscribes to the user's Firestore doc and returns plan/subscription data.
 * Calls `onUpdate` whenever the subscription fields change.
 * Returns an unsubscribe function.
 */
export function listenToSubscription(
  uid: string,
  onUpdate: (sub: Subscription) => void
): () => void {
  const userRef = doc(db, "users", uid);

  return onSnapshot(userRef, (snap) => {
    if (!snap.exists()) {
      onUpdate({ plan: "free", subscriptionStatus: null });
      return;
    }
    const data = snap.data();
    const periodEnd = data.currentPeriodEnd?.toDate?.() ?? null;
    const graceEnd = data.downgradeGracePeriodEnd?.toDate?.() ?? null;
    const rawPlan = (data.plan as Plan) ?? "free";
    const rawStatus = (data.subscriptionStatus as SubscriptionStatus) ?? null;
    const storageUsed = typeof data.storageUsed === "number" ? data.storageUsed : undefined;

    const isExpiredByDate = periodEnd !== null && periodEnd <= new Date();
    const isCancelledOrExpired =
      rawStatus === "cancelled" || rawStatus === "expired" || isExpiredByDate;

    if (rawPlan === "pro" && isCancelledOrExpired) {
      const nextStatus: SubscriptionStatus = isExpiredByDate ? "expired" : rawStatus;
      updateDoc(userRef, {
        plan: "free",
        subscriptionStatus: nextStatus,
      }).catch((err) => console.warn("Failed to sync downgraded plan:", err));

      onUpdate({
        plan: "free",
        subscriptionStatus: nextStatus,
        subscriptionId: data.subscriptionId ?? undefined,
        currentPeriodEnd: periodEnd,
        lsCustomerId: data.lsCustomerId ?? undefined,
        downgradeGracePeriodEnd: graceEnd,
        storageUsed,
      });
      return;
    }

    onUpdate({
      plan: rawPlan,
      subscriptionStatus: rawStatus,
      subscriptionId: data.subscriptionId ?? undefined,
      currentPeriodEnd: periodEnd,
      lsCustomerId: data.lsCustomerId ?? undefined,
      downgradeGracePeriodEnd: graceEnd,
      storageUsed,
    });
  });
}

// ─── Sync Subscription Status ────────────────────────────────────────────────

/**
 * Calls the `syncSubscriptionStatus` Cloud Function to verify the latest
 * subscription status with Lemon Squeezy and downgrade if cancelled/expired.
 */
export async function syncSubscriptionStatus(): Promise<void> {
  try {
    const fn = httpsCallable<void, { plan: Plan; status: SubscriptionStatus }>(
      functions,
      "syncSubscriptionStatus"
    );
    await fn();
  } catch (err) {
    // Ignore if function is not yet deployed or offline
    console.debug("Subscription sync skipped:", err);
  }
}

// ─── Checkout ────────────────────────────────────────────────────────────────

/**
 * Calls the `createCheckoutSession` Cloud Function and redirects to
 * the Lemon Squeezy hosted checkout page.
 */
export async function createCheckout(variantId: string): Promise<void> {
  const fn = httpsCallable<{ variantId: string }, { checkoutUrl: string }>(
    functions,
    "createCheckoutSession"
  );
  const result = await fn({ variantId });
  window.location.href = result.data.checkoutUrl;
}

// ─── Billing Portal ──────────────────────────────────────────────────────────

/**
 * Calls the `createBillingPortalSession` Cloud Function and opens the
 * Lemon Squeezy billing portal in a new tab.
 */
export async function openBillingPortal(subscriptionId: string): Promise<void> {
  const fn = httpsCallable<{ subscriptionId: string }, { portalUrl: string }>(
    functions,
    "createBillingPortalSession"
  );
  const result = await fn({ subscriptionId });
  window.location.href = result.data.portalUrl;
}