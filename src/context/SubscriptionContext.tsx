import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { listenToSubscription } from "../services/subscriptionService";
import type { Plan, SubscriptionStatus } from "../services/subscriptionService";
import { auth, db } from "../firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";

// ─── Constants ───────────────────────────────────────────────────────────────

export const FREE_CREDENTIAL_LIMIT = 10;
export const PRO_CREDENTIAL_LIMIT = 1000;

// ─── Context shape ───────────────────────────────────────────────────────────

interface SubscriptionContextValue {
  plan: Plan;
  status: SubscriptionStatus;
  /** True when the user has an active Pro subscription */
  isPro: boolean;
  /** Maximum number of credentials allowed (Infinity for Pro) */
  credentialLimit: number;
  /** True when the user has reached or exceeded their limit */
  isAtLimit: boolean;
  /** True when the user is within 2 of their limit (show soft warning) */
  isNearLimit: boolean;
  subscriptionId?: string;
  currentPeriodEnd?: Date | null;
  /** Whether the subscription data has been loaded from Firestore */
  loaded: boolean;
  /** Whether the user is manually exempted by an admin */
  isExempt: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  plan: "free",
  status: null,
  isPro: false,
  credentialLimit: FREE_CREDENTIAL_LIMIT,
  isAtLimit: false,
  isNearLimit: false,
  loaded: false,
  isExempt: false,
});

// ─── Provider ────────────────────────────────────────────────────────────────

interface SubscriptionProviderProps {
  children: ReactNode;
  uid: string | null;
  credentialCount: number;
}

export function SubscriptionProvider({
  children,
  uid,
  credentialCount,
}: SubscriptionProviderProps) {
  const [plan, setPlan] = useState<Plan>("free");
  const [status, setStatus] = useState<SubscriptionStatus>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | undefined>(undefined);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<Date | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [isExempt, setIsExempt] = useState(false);

  useEffect(() => {
    if (!uid) {
      // Reset when user signs out
      setPlan("free");
      setStatus(null);
      setSubscriptionId(undefined);
      setCurrentPeriodEnd(undefined);
      setLoaded(false);
      setIsExempt(false);
      return;
    }

    const unsub = listenToSubscription(uid, (sub) => {
      setPlan(sub.plan);
      setStatus(sub.subscriptionStatus);
      setSubscriptionId(sub.subscriptionId);
      setCurrentPeriodEnd(sub.currentPeriodEnd);
      setLoaded(true);
    });

    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid || !auth.currentUser?.email) {
      setIsExempt(false);
      return;
    }
    const email = auth.currentUser.email;
    const unsub = onSnapshot(doc(db, "exemptions", email), (snap) => {
      setIsExempt(snap.exists() && snap.data()?.exempt === true);
    }, (err) => {
      console.warn("Could not check exemption status:", err);
      setIsExempt(false);
    });
    return unsub;
  }, [uid]);

  // Some webhook events or manual entries might use a hyphen instead of an underscore
  const isPro = (plan === "pro" && (status === "active" || status === "on_trial" || status === "on-trial")) || isExempt;
  const credentialLimit = isPro ? PRO_CREDENTIAL_LIMIT : FREE_CREDENTIAL_LIMIT;
  const isAtLimit = credentialCount >= credentialLimit;
  // Warn when 2 or fewer slots remain (only meaningful on Free)
  const isNearLimit = credentialCount >= credentialLimit - 2;

  const value: SubscriptionContextValue = {
    plan,
    status,
    isPro,
    credentialLimit,
    isAtLimit,
    isNearLimit,
    subscriptionId,
    currentPeriodEnd,
    loaded,
    isExempt,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription() {
  return useContext(SubscriptionContext);
}
