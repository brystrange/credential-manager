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

function getPlatformsRef() {
    return collection(db, PLATFORMS_COLLECTION);
}

/** Read platforms directly from Firestore (allowed by rules for verified users) */
export async function getPlatforms(): Promise<Platform[]> {
    const q = query(getPlatformsRef(), orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        domain: d.data().domain || "",
        color: d.data().color || "#6366f1",
        category: d.data().category || "Other",
        logoUrl: d.data().logoUrl || "",
        link: d.data().link || "",
    }));
}

/** Add platform via Cloud Function (admin only) */
export async function addPlatform(input: PlatformInput): Promise<string> {
    const fn = httpsCallable<PlatformInput, { id: string }>(functions, "addPlatform");
    const result = await fn(input);
    return result.data.id;
}

/** Update platform via Cloud Function (admin only) */
export async function updatePlatform(
    id: string,
    input: PlatformInput
): Promise<void> {
    const fn = httpsCallable<PlatformInput & { id: string }, { success: boolean }>(functions, "updatePlatform");
    await fn({ ...input, id });
}

/** Delete platform via Cloud Function (admin only) */
export async function deletePlatform(id: string): Promise<void> {
    const fn = httpsCallable<{ id: string }, { success: boolean }>(functions, "deletePlatform");
    await fn({ id });
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
    return cats;
}
