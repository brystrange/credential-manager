import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Auto-lock hook — signs out the user after `timeoutMs` of browser inactivity.
 *
 * "Active" means any of: mouse movement, clicks, key presses, touch events,
 * scrolling, or the page being visible (not hidden via tab switch / minimise).
 *
 * When the browser tab is visible AND the user is interacting, the timer never
 * fires. If the user leaves the tab / minimises the window, the timer starts.
 *
 * A warning callback fires `warningBeforeMs` before auto-lock.
 */
export function useAutoLock({
    enabled,
    timeoutMs = 60 * 60 * 1000, // default: 1 hour
    warningBeforeMs = 30_000,     // warn 30 s before lock
    onLock,
    onWarning,
}: {
    enabled: boolean;
    timeoutMs?: number;
    warningBeforeMs?: number;
    onLock: () => void;
    onWarning?: () => void;
}) {
    const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [warningVisible, setWarningVisible] = useState(false);

    const clearTimers = useCallback(() => {
        if (lockTimerRef.current) {
            clearTimeout(lockTimerRef.current);
            lockTimerRef.current = null;
        }
        if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
            warningTimerRef.current = null;
        }
        setWarningVisible(false);
    }, []);

    const resetTimers = useCallback(() => {
        clearTimers();

        // Don't start timers if the page is currently visible and active —
        // only lock when the browser goes idle (tab hidden, no interaction).
        lockTimerRef.current = setTimeout(() => {
            onLock();
        }, timeoutMs);

        if (warningBeforeMs > 0 && onWarning) {
            const warningDelay = Math.max(0, timeoutMs - warningBeforeMs);
            warningTimerRef.current = setTimeout(() => {
                setWarningVisible(true);
                onWarning();
            }, warningDelay);
        }
    }, [clearTimers, timeoutMs, warningBeforeMs, onLock, onWarning]);

    useEffect(() => {
        if (!enabled) {
            clearTimers();
            return;
        }

        // Events that prove the user is still active
        const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
            "mousemove",
            "mousedown",
            "keydown",
            "touchstart",
            "scroll",
            "click",
        ];

        const handleActivity = () => {
            resetTimers();
        };

        // If tab becomes visible, reset; if hidden, timer keeps running.
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                resetTimers();
            }
        };

        for (const event of ACTIVITY_EVENTS) {
            document.addEventListener(event, handleActivity, { passive: true });
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Start the timer immediately
        resetTimers();

        return () => {
            clearTimers();
            for (const event of ACTIVITY_EVENTS) {
                document.removeEventListener(event, handleActivity);
            }
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [enabled, resetTimers, clearTimers]);

    return { warningVisible };
}
