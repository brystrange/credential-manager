export interface Point {
    x: number;
    y: number;
}

export interface LivePinchMeta {
    dx: number;
    dy: number;
    originX: number;
    originY: number;
}

interface DocumentPinchOptions {
    target: HTMLElement | Document;
    scrollEl: HTMLElement;
    getContentEl?: () => HTMLElement | null;
    getScale: () => number;
    minScale?: number;
    maxScale?: number;
    onLivePinch: (pinchRatio: number, meta?: LivePinchMeta) => void;
    onCommitScale: (nextScale: number) => void;
    onDoubleTap?: (clientX: number, clientY: number) => void;
}

/**
 * Attaches smooth midpoint-anchored 2-finger pinch-to-zoom (and optional double-tap zoom)
 * to scrollable document previews (PDF, DOCX, Excel, Text/HTML iframes) while preserving
 * 1-finger native scrolling.
 */
export function attachDocumentPinchZoom({
    target,
    scrollEl,
    getContentEl,
    getScale,
    minScale = 0.35,
    maxScale = 4,
    onLivePinch,
    onCommitScale,
    onDoubleTap,
}: DocumentPinchOptions): () => void {
    let initialDist: number | null = null;
    let currentRatio = 1;
    let startCenter: Point = { x: 0, y: 0 };
    let pinchCenter: Point = { x: 0, y: 0 };
    let originInContent: Point = { x: 0, y: 0 };
    let lastTapTime = 0;
    let lastTapPos: Point = { x: 0, y: 0 };
    let singleMoved = false;

    const beginPinch = (t0: Touch, t1: Touch) => {
        initialDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
        startCenter = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
        };
        pinchCenter = { ...startCenter };
        const contentRect = (getContentEl?.() || scrollEl).getBoundingClientRect();
        originInContent = {
            x: startCenter.x - contentRect.left,
            y: startCenter.y - contentRect.top,
        };
        currentRatio = 1;
    };

    const handleTouchStart = (e: Event) => {
        const te = e as TouchEvent;
        if (te.touches.length === 2) {
            if (te.cancelable) te.preventDefault();
            lastTapTime = 0;
            beginPinch(te.touches[0], te.touches[1]);
            return;
        }

        if (te.touches.length === 1 && onDoubleTap) {
            const t = te.touches[0];
            singleMoved = false;
            const targetEl = te.target as HTMLElement | null;
            if (targetEl && (targetEl.closest("button") || targetEl.closest("input"))) {
                return;
            }
            const now = Date.now();
            const tapDist = Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y);
            if (now - lastTapTime < 280 && tapDist < 32) {
                if (te.cancelable) te.preventDefault();
                lastTapTime = 0;
                onDoubleTap(t.clientX, t.clientY);
                return;
            }
            lastTapTime = now;
            lastTapPos = { x: t.clientX, y: t.clientY };
        }
    };

    const handleTouchMove = (e: Event) => {
        const te = e as TouchEvent;
        if (te.touches.length === 1 && !singleMoved) {
            const t = te.touches[0];
            if (Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) > 10) {
                singleMoved = true;
                lastTapTime = 0;
            }
            return;
        }

        if (te.touches.length !== 2) return;
        if (te.cancelable) te.preventDefault();

        const t0 = te.touches[0];
        const t1 = te.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

        if (initialDist === null) {
            beginPinch(t0, t1);
            return;
        }

        const baseScale = getScale() || 1;
        const minRatio = minScale / baseScale;
        const maxRatio = maxScale / baseScale;
        currentRatio = Math.max(minRatio, Math.min(maxRatio, dist / initialDist));
        pinchCenter = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
        };
        onLivePinch(currentRatio, {
            dx: pinchCenter.x - startCenter.x,
            dy: pinchCenter.y - startCenter.y,
            originX: originInContent.x,
            originY: originInContent.y,
        });
    };

    const handleTouchEnd = (e: Event) => {
        const te = e as TouchEvent;
        if (initialDist === null || te.touches.length >= 2) return;

        const baseScale = getScale() || 1;
        const nextScale = Math.max(
            minScale,
            Math.min(maxScale, Number((baseScale * currentRatio).toFixed(3)))
        );

        const rect = scrollEl.getBoundingClientRect();
        const startOffsetX = startCenter.x - rect.left;
        const startOffsetY = startCenter.y - rect.top;
        const curOffsetX = pinchCenter.x - rect.left;
        const curOffsetY = pinchCenter.y - rect.top;
        const oldScrollLeft = scrollEl.scrollLeft;
        const oldScrollTop = scrollEl.scrollTop;
        const factor = nextScale / baseScale;

        initialDist = null;
        currentRatio = 1;
        onLivePinch(1, { dx: 0, dy: 0, originX: 0, originY: 0 });
        onCommitScale(nextScale);

        requestAnimationFrame(() => {
            scrollEl.scrollLeft = Math.max(0, (oldScrollLeft + startOffsetX) * factor - curOffsetX);
            scrollEl.scrollTop = Math.max(0, (oldScrollTop + startOffsetY) * factor - curOffsetY);
        });
    };

    target.addEventListener("touchstart", handleTouchStart, { passive: false });
    target.addEventListener("touchmove", handleTouchMove, { passive: false });
    target.addEventListener("touchend", handleTouchEnd, { passive: true });
    target.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
        target.removeEventListener("touchstart", handleTouchStart);
        target.removeEventListener("touchmove", handleTouchMove);
        target.removeEventListener("touchend", handleTouchEnd);
        target.removeEventListener("touchcancel", handleTouchEnd);
    };
}

interface MediaPinchOptions {
    el: HTMLElement;
    getZoom: () => number;
    getPan: () => Point;
    minZoom?: number;
    maxZoom?: number;
    onUpdate: (zoom: number, pan: Point, interacting: boolean) => void;
    onTap?: () => void;
}

/**
 * Attaches midpoint-anchored 2-finger pinch-to-zoom, 1-finger pan when zoomed,
 * and double-tap zoom toggle for media previews (images, PPTX slides, video).
 */
export function attachMediaPinchPan({
    el,
    getZoom,
    getPan,
    minZoom = 0.5,
    maxZoom = 5,
    onUpdate,
    onTap,
}: MediaPinchOptions): () => void {
    let mode: "none" | "pan" | "pinch" = "none";
    let initialDist = 1;
    let initialZoom = 1;
    let initialPan: Point = { x: 0, y: 0 };
    let initialMid: Point = { x: 0, y: 0 };
    let pinchOrigin: Point = { x: 0, y: 0 };
    let lastTouch: Point = { x: 0, y: 0 };
    let touchMoved = false;
    let lastTapTime = 0;
    let lastTapPos: Point = { x: 0, y: 0 };

    const clampPan = (p: Point, zoom: number): Point => {
        if (zoom <= 1) return { x: 0, y: 0 };
        const w = el.clientWidth * zoom;
        const h = el.clientHeight * zoom;
        const boundaryMult = window.innerWidth <= 768 ? 0.45 : 0.25;
        const maxDragX = w * boundaryMult + window.innerWidth / 2;
        const maxDragY = h * boundaryMult + window.innerHeight / 2;
        return {
            x: Math.max(-maxDragX, Math.min(maxDragX, p.x)),
            y: Math.max(-maxDragY, Math.min(maxDragY, p.y)),
        };
    };

    const startPinch = (t0: Touch, t1: Touch) => {
        mode = "pinch";
        touchMoved = true;
        initialDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
        initialMid = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
        };
        initialZoom = getZoom();
        initialPan = getPan();
        const rect = el.getBoundingClientRect();
        pinchOrigin = {
            x: rect.left + rect.width / 2 - initialPan.x,
            y: rect.top + rect.height / 2 - initialPan.y,
        };
        onUpdate(initialZoom, initialPan, true);
    };

    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
            if (e.cancelable) e.preventDefault();
            startPinch(e.touches[0], e.touches[1]);
            return;
        }

        if (e.touches.length === 1) {
            const t = e.touches[0];
            touchMoved = false;
            lastTouch = { x: t.clientX, y: t.clientY };

            const targetEl = e.target as HTMLElement | null;
            const isVideoControlsArea =
                targetEl?.tagName === "VIDEO" &&
                t.clientY > targetEl.getBoundingClientRect().bottom - 56;

            if (!isVideoControlsArea) {
                const now = Date.now();
                const tapDist = Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y);
                if (now - lastTapTime < 280 && tapDist < 32) {
                    if (e.cancelable) e.preventDefault();
                    lastTapTime = 0;
                    const curZoom = getZoom();
                    if (curZoom > 1.1) {
                        onUpdate(1, { x: 0, y: 0 }, false);
                    } else {
                        const rect = el.getBoundingClientRect();
                        const curPan = getPan();
                        const originX = rect.left + rect.width / 2 - curPan.x;
                        const originY = rect.top + rect.height / 2 - curPan.y;
                        const targetZoom = 2.5;
                        const nextPan = clampPan(
                            {
                                x: (originX - t.clientX) * (targetZoom - 1),
                                y: (originY - t.clientY) * (targetZoom - 1),
                            },
                            targetZoom
                        );
                        onUpdate(targetZoom, nextPan, false);
                    }
                    return;
                }
                lastTapTime = now;
                lastTapPos = { x: t.clientX, y: t.clientY };
            }

            if (getZoom() > 1 && !isVideoControlsArea) {
                mode = "pan";
                onUpdate(getZoom(), getPan(), true);
            } else {
                mode = "none";
            }
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2) {
            if (e.cancelable) e.preventDefault();
            const t0 = e.touches[0];
            const t1 = e.touches[1];
            if (mode !== "pinch") {
                startPinch(t0, t1);
                return;
            }
            const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
            const mid = {
                x: (t0.clientX + t1.clientX) / 2,
                y: (t0.clientY + t1.clientY) / 2,
            };
            const nextZoom = Math.max(minZoom, Math.min(maxZoom, initialZoom * (dist / initialDist)));
            const ratio = nextZoom / initialZoom;
            const rawPan = {
                x: mid.x - pinchOrigin.x - ratio * (initialMid.x - pinchOrigin.x - initialPan.x),
                y: mid.y - pinchOrigin.y - ratio * (initialMid.y - pinchOrigin.y - initialPan.y),
            };
            onUpdate(nextZoom, nextZoom <= 1 ? { x: 0, y: 0 } : clampPan(rawPan, nextZoom), true);
            return;
        }

        if (e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - lastTouch.x;
            const dy = t.clientY - lastTouch.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                touchMoved = true;
                lastTapTime = 0;
            }
            if (mode === "pan" && getZoom() > 1) {
                if (e.cancelable) e.preventDefault();
                const curPan = getPan();
                const nextPan = clampPan({ x: curPan.x + dx, y: curPan.y + dy }, getZoom());
                lastTouch = { x: t.clientX, y: t.clientY };
                onUpdate(getZoom(), nextPan, true);
            }
        }
    };

    const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length === 1 && mode === "pinch") {
            if (getZoom() > 1) {
                mode = "pan";
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else {
                mode = "none";
            }
            return;
        }

        if (e.touches.length === 0) {
            if (touchMoved && e.cancelable) {
                e.preventDefault();
            }
            const wasSingleTap = mode === "none" && !touchMoved;
            mode = "none";
            touchMoved = false;
            const z = getZoom();
            onUpdate(z, z <= 1 ? { x: 0, y: 0 } : clampPan(getPan(), z), false);
            if (wasSingleTap && onTap) {
                onTap();
            }
        }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
        el.removeEventListener("touchstart", handleTouchStart);
        el.removeEventListener("touchmove", handleTouchMove);
        el.removeEventListener("touchend", handleTouchEnd);
        el.removeEventListener("touchcancel", handleTouchEnd);
    };
}
