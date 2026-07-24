import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "on_trial" | null;

export interface Subscription {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId?: string;
  currentPeriodEnd?: Date | null;
  lsCustomerId?: string;
  downgradeGracePeriodEnd?: Date | null;
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

    onUpdate({
      plan: (data.plan as Plan) ?? "free",
      subscriptionStatus: (data.subscriptionStatus as SubscriptionStatus) ?? null,
      subscriptionId: data.subscriptionId ?? undefined,
      currentPeriodEnd: periodEnd,
      lsCustomerId: data.lsCustomerId ?? undefined,
      downgradeGracePeriodEnd: graceEnd,
    });
  });
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
