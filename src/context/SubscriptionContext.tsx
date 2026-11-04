import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { listenToSubscription, syncSubscriptionStatus } from "../services/subscriptionService";
import type { Plan, SubscriptionStatus } from "../services/subscriptionService";
import { auth, db } from "../firebaseConfig";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";

// ─── Constants ───────────────────────────────────────────────────────────────

export const FREE_CREDENTIAL_LIMIT = 10;
export const PRO_CREDENTIAL_LIMIT = 1000;
export const FREE_STORAGE_LIMIT = 500 * 1024 * 1024; // 500 MB
export const PRO_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB

// ─── Context shape ───────────────────────────────────────────────────────────

interface SubscriptionContextValue {
  plan: Plan;
  status: SubscriptionStatus;
  /** True when the user has an active Pro subscription */
  isPro: boolean;
  /** Current number of saved credentials */
  credentialCount: number;
  /** Maximum number of credentials allowed (Infinity for Pro) */
  credentialLimit: number;
  /** True when the user has reached or exceeded their limit */
  isAtLimit: boolean;
  /** True when the user is within 2 of their limit (show soft warning) */
  isNearLimit: boolean;
  /** Total storage used in bytes */
  storageUsed: number;
  /** Maximum storage allowed in bytes */
  storageLimit: number;
  /** True if the user has reached their storage limit */
  isStorageAtLimit: boolean;
  /** True when usage exceeds Free tier limits (> 10 credentials or > 500 MB storage) */
  exceedsFreeLimit: boolean;
  /** Number of credentials above the Free tier limit (10) */
  excessCredentials: number;
  /** Bytes of file storage above the Free tier limit (500 MB) */
  excessStorage: number;
  subscriptionId?: string;
  currentPeriodEnd?: Date | null;
  downgradeGracePeriodEnd?: Date | null;
  /** Whether the subscription data has been loaded from Firestore */
  loaded: boolean;
  /** Whether the user is manually exempted by an admin */
  isExempt: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  plan: "free",
  status: null,
  isPro: false,
  credentialCount: 0,
  credentialLimit: FREE_CREDENTIAL_LIMIT,
  isAtLimit: false,
  isNearLimit: false,
  storageUsed: 0,
  storageLimit: FREE_STORAGE_LIMIT,
  isStorageAtLimit: false,
  exceedsFreeLimit: false,
  excessCredentials: 0,
  excessStorage: 0,
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
  const [downgradeGracePeriodEnd, setDowngradeGracePeriodEnd] = useState<Date | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [isExempt, setIsExempt] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    if (!uid) {
      // Reset when user signs out
      setPlan("free");
      setStatus(null);
      setSubscriptionId(undefined);
      setCurrentPeriodEnd(undefined);
      setDowngradeGracePeriodEnd(undefined);
      setLoaded(false);
      setIsExempt(false);
      setStorageUsed(0);
      return;
    }

    const unsub = listenToSubscription(uid, (sub) => {
      setPlan(sub.plan);
      setStatus(sub.subscriptionStatus);
      setSubscriptionId(sub.subscriptionId);
      setCurrentPeriodEnd(sub.currentPeriodEnd);
      setDowngradeGracePeriodEnd(sub.downgradeGracePeriodEnd);
      setLoaded(true);
    });

    return unsub;
  }, [uid]);

  // Periodically & on window focus verify Pro subscription status with Lemon Squeezy
  useEffect(() => {
    if (!uid || (plan !== "pro" && !isExempt)) return;

    syncSubscriptionStatus();

    const handleFocus = () => {
      syncSubscriptionStatus();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [uid, plan, isExempt]);

  useEffect(() => {
    if (!uid || !auth.currentUser?.email) {
      setIsExempt(false);
      return;
    }
    const email = auth.currentUser.email.trim().toLowerCase();
    const unsub = onSnapshot(doc(db, "exemptions", email), (snap) => {
      const exempted = snap.exists() && snap.data()?.exempt !== false;
      setIsExempt(exempted);
    }, (err) => {
      console.warn("Could not check exemption status:", err);
      setIsExempt(false);
    });
    return unsub;
  }, [uid]);

  // Listen for storage usage from user files collection and reconcile user profile storageUsed
  useEffect(() => {
    if (!uid) return;
    let profileStorage: number | undefined = undefined;

    const unsubProfile = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        profileStorage = Math.max(0, snap.data().storageUsed || 0);
        setStorageUsed(profileStorage);
      }
    }, (err) => {
      console.warn("Could not load user profile for storage info:", err);
    });

    const unsubFiles = onSnapshot(collection(db, "users", uid, "files"), (snap) => {
      const actualBytes = snap.docs.reduce((sum, d) => sum + (Number(d.data().size) || 0), 0);
      setStorageUsed(actualBytes);
      if (profileStorage !== undefined && profileStorage !== actualBytes) {
        updateDoc(doc(db, "users", uid), { storageUsed: actualBytes }).catch(() => {});
      }
    }, (err) => {
      console.warn("Could not load user files for storage calculation:", err);
    });

    return () => {
      unsubProfile();
      unsubFiles();
    };
  }, [uid]);

  const isPeriodValid = !currentPeriodEnd || currentPeriodEnd > new Date();
  const isPro =
    isExempt ||
    (plan === "pro" &&
      (status === "active" || status === "on_trial" || status === "on-trial") &&
      isPeriodValid);

  const effectivePlan: Plan = isPro ? "pro" : "free";
  const effectiveStatus: SubscriptionStatus = isExempt ? "active" : status;

  const credentialLimit = isPro ? PRO_CREDENTIAL_LIMIT : FREE_CREDENTIAL_LIMIT;
  const isAtLimit = credentialCount >= credentialLimit;
  // Warn when 2 or fewer slots remain (only meaningful on Free)
  const isNearLimit = credentialCount >= credentialLimit - 2;

  const storageLimit = isPro ? PRO_STORAGE_LIMIT : FREE_STORAGE_LIMIT;
  const isStorageAtLimit = storageUsed >= storageLimit;

  const excessCredentials = isExempt ? 0 : Math.max(0, credentialCount - FREE_CREDENTIAL_LIMIT);
  const excessStorage = isExempt ? 0 : Math.max(0, storageUsed - FREE_STORAGE_LIMIT);
  const exceedsFreeLimit = !isExempt && (excessCredentials > 0 || excessStorage > 0);

  const value: SubscriptionContextValue = {
    plan: effectivePlan,
    status: effectiveStatus,
    isPro,
    credentialCount,
    credentialLimit,
    isAtLimit,
    isNearLimit,
    storageUsed,
    storageLimit,
    isStorageAtLimit,
    exceedsFreeLimit,
    excessCredentials,
    excessStorage,
    subscriptionId,
    currentPeriodEnd,
    downgradeGracePeriodEnd,
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