import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { listenToSubscription, syncSubscriptionStatus } from "../services/subscriptionService";
import type { Plan, SubscriptionStatus } from "../services/subscriptionService";
import { auth, db } from "../firebaseConfig";
import { collection, doc, getAggregateFromServer, onSnapshot, query, sum, updateDoc, where } from "firebase/firestore";
import { listShares, type SharedItem } from "../services/shareService";

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
  const profileStorageRef = useRef<number | undefined>(undefined);
  const lastSyncAtRef = useRef<number>(0);

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
      profileStorageRef.current = undefined;
      lastSyncAtRef.current = 0;
      return;
    }

    const unsub = listenToSubscription(uid, (sub) => {
      setPlan(sub.plan);
      setStatus(sub.subscriptionStatus);
      setSubscriptionId(sub.subscriptionId);
      setCurrentPeriodEnd(sub.currentPeriodEnd);
      setDowngradeGracePeriodEnd(sub.downgradeGracePeriodEnd);
      if (typeof sub.storageUsed === "number") {
        profileStorageRef.current = Math.max(0, sub.storageUsed);
      }
      setLoaded(true);
    });

    return unsub;
  }, [uid]);

  // Periodically & on window focus verify Pro subscription status with Lemon Squeezy (with cooldown)
  useEffect(() => {
    if (!uid || plan !== "pro") return;

    const SYNC_COOLDOWN_MS = 60 * 1000;
    const maybeSync = () => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < SYNC_COOLDOWN_MS) return;
      lastSyncAtRef.current = now;
      void syncSubscriptionStatus();
    };

    maybeSync();

    const handleFocus = () => {
      if (document.visibilityState === "hidden") return;
      maybeSync();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [uid, plan]);

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

  // Listen for storage usage using server-side aggregate for user files + real-time shares listener
  useEffect(() => {
    if (!uid) return;
    let uploadedBytes = 0;
    let sharedBytes = 0;
    let hasCalculatedFiles = false;
    let hasLiveSharesListener = false;
    let lastWrittenTotal: number | undefined = undefined;

    const updateTotalStorage = () => {
      if (!hasCalculatedFiles) {
        if (typeof profileStorageRef.current === "number") {
          setStorageUsed(profileStorageRef.current);
        }
        return;
      }
      const total = uploadedBytes + sharedBytes;
      setStorageUsed(total);
      const knownServerTotal = lastWrittenTotal ?? profileStorageRef.current;
      if (knownServerTotal !== undefined && Math.abs(knownServerTotal - total) > 0) {
        lastWrittenTotal = total;
        profileStorageRef.current = total;
        updateDoc(doc(db, "users", uid), { storageUsed: total }).catch(() => {});
      }
    };

    const fetchUploadedStorage = async () => {
      try {
        const aggSnap = await getAggregateFromServer(
          collection(db, "users", uid, "files"),
          { totalSize: sum("size") }
        );
        uploadedBytes = Number(aggSnap.data().totalSize) || 0;
        hasCalculatedFiles = true;
        updateTotalStorage();
      } catch (err) {
        console.warn("Could not aggregate user files for storage calculation:", err);
        if (typeof profileStorageRef.current === "number") {
          setStorageUsed(profileStorageRef.current);
        }
      }
    };

    const fetchSharedStorage = async () => {
      try {
        const res = await listShares();
        sharedBytes = res.received.reduce(
          (sumBytes, item) => sumBytes + item.files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0),
          0
        );
        updateTotalStorage();
      } catch (err) {
        console.debug("Could not calculate shared storage from listShares:", err);
      }
    };

    void fetchUploadedStorage();

    const handleVaultFilesUpdated = () => {
      void fetchUploadedStorage();
    };
    window.addEventListener("vault-files-updated", handleVaultFilesUpdated);

    const handleSharedFilesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ received?: SharedItem[] }>).detail;
      if (detail?.received) {
        sharedBytes = detail.received.reduce(
          (sumBytes, item) => sumBytes + item.files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0),
          0
        );
        updateTotalStorage();
        return;
      }
      if (!hasLiveSharesListener) {
        void fetchSharedStorage();
      }
    };
    window.addEventListener("shared-files-updated", handleSharedFilesUpdated);

    // Real-time listener on shares collection avoids redundant callable/focus polling
    let unsubShares: (() => void) | null = null;
    let lastSharesSig: string | null = null;
    try {
      const sharesQuery = query(collection(db, "shares"), where("recipientUids", "array-contains", uid));
      unsubShares = onSnapshot(sharesQuery, (snap) => {
        hasLiveSharesListener = true;
        const nextSharesSig = snap.docs
          .map((d) => {
            const data = d.data();
            const filesArr = (data.files as unknown[]) || [];
            return `${d.id}:${filesArr.length}:${String(data.encryptedName ?? "")}:${String(data.color ?? "")}:${data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? ""}`;
          })
          .sort()
          .join("|");
        if (lastSharesSig !== null && lastSharesSig !== nextSharesSig) {
          window.dispatchEvent(new CustomEvent("shares-collection-updated"));
        }
        lastSharesSig = nextSharesSig;

        sharedBytes = snap.docs.reduce((sumBytes, d) => {
          const files = (d.data().files as Array<{ size?: number }>) || [];
          return sumBytes + files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0);
        }, 0);
        updateTotalStorage();
      }, (err) => {
        hasLiveSharesListener = false;
        console.debug("Shares snapshot listener not active, using callable fallback:", err);
        void fetchSharedStorage();
      });
    } catch {
      void fetchSharedStorage();
    }

    return () => {
      unsubShares?.();
      window.removeEventListener("vault-files-updated", handleVaultFilesUpdated);
      window.removeEventListener("shared-files-updated", handleSharedFilesUpdated);
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