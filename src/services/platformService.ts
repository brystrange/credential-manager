import {
    collection,
    getDocs,
    query,
    orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";

export interface Platform {
    id: string;
    name: string;
    domain: string;
    color: string;
    category: string;
    logoUrl: string;
    link: string;
}

export interface PlatformInput {
    name: string;
    domain: string;
    color: string;
    category: string;
    logoUrl: string;
    link: string;
}

const PLATFORMS_COLLECTION = "platforms";
const PLATFORMS_CACHE_KEY = "fs_platforms_cache_v1";
const PLATFORMS_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedPlatforms: Platform[] | null = null;
let inFlightPlatforms: Promise<Platform[]> | null = null;

function readSessionPlatforms(): Platform[] | null {
    try {
        const raw = sessionStorage.getItem(PLATFORMS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { ts?: number; data?: Platform[] };
        if (
            typeof parsed.ts === "number" &&
            Date.now() - parsed.ts < PLATFORMS_CACHE_TTL_MS &&
            Array.isArray(parsed.data)
        ) {
            return parsed.data;
        }
    } catch {
        // Ignore storage parse/access errors
    }
    return null;
}

function writeSessionPlatforms(platforms: Platform[]): void {
    try {
        sessionStorage.setItem(
            PLATFORMS_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: platforms })
        );
    } catch {
        // Ignore storage quota/access errors
    }
}

function invalidatePlatformsCache(): void {
    cachedPlatforms = null;
    inFlightPlatforms = null;
    try {
        sessionStorage.removeItem(PLATFORMS_CACHE_KEY);
    } catch {
        // Ignore storage access errors
    }
}

function getPlatformsRef() {
    return collection(db, PLATFORMS_COLLECTION);
}

/** Read platforms directly from Firestore (with memory + session caching & in-flight deduplication) */
export async function getPlatforms(forceRefresh = false): Promise<Platform[]> {
    if (!forceRefresh && cachedPlatforms) {
        return cachedPlatforms;
    }
    if (!forceRefresh) {
        const sessionCached = readSessionPlatforms();
        if (sessionCached) {
            cachedPlatforms = sessionCached;
            return sessionCached;
        }
        if (inFlightPlatforms) {
            return inFlightPlatforms;
        }
    }

    const promise = (async () => {
        const q = query(getPlatformsRef(), orderBy("name", "asc"));
        const snapshot = await getDocs(q);
        const platforms = snapshot.docs.map((d) => ({
            id: d.id,
            name: d.data().name,
            domain: d.data().domain || "",
            color: d.data().color || "#6366f1",
            category: d.data().category || "Other",
            logoUrl: d.data().logoUrl || "",
            link: d.data().link || "",
        }));
        cachedPlatforms = platforms;
        writeSessionPlatforms(platforms);
        return platforms;
    })().finally(() => {
        inFlightPlatforms = null;
    });

    inFlightPlatforms = promise;
    return promise;
}

/** Add platform via Cloud Function (admin only) */
export async function addPlatform(input: PlatformInput): Promise<string> {
    const fn = httpsCallable<PlatformInput, { id: string }>(functions, "addPlatform");
    const result = await fn(input);
    invalidatePlatformsCache();
    return result.data.id;
}

/** Update platform via Cloud Function (admin only) */
export async function updatePlatform(
    id: string,
    input: PlatformInput
): Promise<void> {
    const fn = httpsCallable<PlatformInput & { id: string }, { success: boolean }>(functions, "updatePlatform");
    await fn({ ...input, id });
    invalidatePlatformsCache();
}

/** Delete platform via Cloud Function (admin only) */
export async function deletePlatform(id: string): Promise<void> {
    const fn = httpsCallable<{ id: string }, { success: boolean }>(functions, "deletePlatform");
    await fn({ id });
    invalidatePlatformsCache();
}

/** Find a platform by name from a provided list */
export function findPlatformByName(
    platforms: Platform[],
    name: string
): Platform | undefined {
    return platforms.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
    );
}

/** Get unique categories from a provided list */
export function getCategories(platforms: Platform[]): string[] {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const p of platforms) {
        if (!seen.has(p.category)) {
            seen.add(p.category);
            cats.push(p.category);
        }
    }
    return cats.sort();
}

/** Get pending custom platforms added by users */
export async function getPendingCustomPlatforms(): Promise<{ name: string; count: number }[]> {
    const fn = httpsCallable<void, { pendingPlatforms: { name: string; count: number }[] }>(functions, "getPendingCustomPlatforms");
    const result = await fn();
    return result.data.pendingPlatforms;
}
