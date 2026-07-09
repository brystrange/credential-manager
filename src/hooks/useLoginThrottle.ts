import { useState, useEffect, useCallback, useRef } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebaseConfig";

/**
 * Login throttle hook.
 *
 * Rules (per the implementation plan):
 *  - Max 5 attempts before lockout.
 *  - After 5 failures → 5-minute lockout.
 *  - After another 5 failures (10 total) → forced password reset email sent,
 *    and user is told to check their email.
 *
 * State is stored in `sessionStorage` so it survives soft-refreshes within
 * the same browser session but resets when the tab/browser is closed.
 */

const STORAGE_KEY = "fortknox_login_throttle";
const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOTAL_BEFORE_RESET = 10;

interface ThrottleState {
    email: string | null;
    failedAttempts: number;
    lockedUntil: number | null;       // epoch ms
    totalFailures: number;
    resetEmailSent: boolean;
}

function loadState(): ThrottleState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { email: null, failedAttempts: 0, lockedUntil: null, totalFailures: 0, resetEmailSent: false };
}

function saveState(state: ThrottleState): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearLoginThrottle(): void {
    sessionStorage.removeItem(STORAGE_KEY);
}

export function useLoginThrottle() {
    const [state, setState] = useState<ThrottleState>(loadState);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [resetEmailMessage, setResetEmailMessage] = useState("");
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Persist to sessionStorage on every change
    useEffect(() => {
        saveState(state);
    }, [state]);

    // Countdown ticker
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (state.lockedUntil && state.lockedUntil > Date.now()) {
            const tick = () => {
                const diff = Math.max(0, Math.ceil((state.lockedUntil! - Date.now()) / 1000));
                setRemainingSeconds(diff);
                if (diff <= 0) {
                    // Lockout expired — reset the per-cycle counter, keep totalFailures
                    setState((prev) => ({
                        ...prev,
                        email: prev.email,
                        failedAttempts: 0,
                        lockedUntil: null,
                    }));
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
            };
            tick();
            intervalRef.current = setInterval(tick, 1000);
        } else {
            setRemainingSeconds(0);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [state.lockedUntil]);

    const isLockedOut = state.lockedUntil !== null && state.lockedUntil > Date.now();

    /** Call this after a failed login attempt */
    const recordFailure = useCallback(async (emailUsed?: string) => {
        setState((prev) => {
            let baseState = prev;
            // Reset if email changed
            if (emailUsed && prev.email && emailUsed !== prev.email) {
                baseState = { email: emailUsed, failedAttempts: 0, lockedUntil: null, totalFailures: 0, resetEmailSent: false };
            } else if (emailUsed && !prev.email) {
                baseState = { ...prev, email: emailUsed };
            }

            const newFailedAttempts = baseState.failedAttempts + 1;
            const newTotalFailures = baseState.totalFailures + 1;

            // Check if we need to force a password reset
            if (newTotalFailures >= MAX_TOTAL_BEFORE_RESET && !baseState.resetEmailSent && emailUsed) {
                // Send password reset email (fire-and-forget)
                sendPasswordResetEmail(auth, emailUsed).then(() => {
                    setResetEmailMessage(
                        `Too many failed attempts. A password reset email has been sent to ${emailUsed}. Please check your inbox.`
                    );
                }).catch((err) => {
                    console.error("Failed to send password reset email:", err);
                    setResetEmailMessage(
                        "Too many failed attempts. Please reset your password manually."
                    );
                });

                return {
                    ...baseState,
                    failedAttempts: newFailedAttempts,
                    lockedUntil: Date.now() + LOCKOUT_DURATION_MS,
                    totalFailures: newTotalFailures,
                    resetEmailSent: true,
                };
            }

            // Check if we've hit the per-cycle lockout threshold
            if (newFailedAttempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
                return {
                    ...baseState,
                    failedAttempts: newFailedAttempts,
                    lockedUntil: Date.now() + LOCKOUT_DURATION_MS,
                    totalFailures: newTotalFailures,
                };
            }

            return {
                ...baseState,
                failedAttempts: newFailedAttempts,
                totalFailures: newTotalFailures,
            };
        });
    }, []);

    /** Call this after a successful login */
    const recordSuccess = useCallback(() => {
        const newState = { email: null, failedAttempts: 0, lockedUntil: null, totalFailures: 0, resetEmailSent: false };
        setState(newState);
        saveState(newState);
        setResetEmailMessage("");
    }, []);

    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS_BEFORE_LOCKOUT - state.failedAttempts);

    return {
        isLockedOut,
        remainingSeconds,
        attemptsRemaining,
        totalFailures: state.totalFailures,
        resetEmailSent: state.resetEmailSent,
        resetEmailMessage,
        recordFailure,
        recordSuccess,
    };
}
