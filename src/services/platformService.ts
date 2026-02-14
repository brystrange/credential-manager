import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

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

export async function addPlatform(input: PlatformInput): Promise<string> {
    const docRef = await addDoc(getPlatformsRef(), {
        name: input.name,
        domain: input.domain,
        color: input.color,
        category: input.category,
        logoUrl: input.logoUrl,
        link: input.link,
    });
    return docRef.id;
}

export async function updatePlatform(
    id: string,
    input: PlatformInput
): Promise<void> {
    const docRef = doc(db, PLATFORMS_COLLECTION, id);
    await updateDoc(docRef, {
        name: input.name,
        domain: input.domain,
        color: input.color,
        category: input.category,
        logoUrl: input.logoUrl,
        link: input.link,
    });
}

export async function deletePlatform(id: string): Promise<void> {
    const docRef = doc(db, PLATFORMS_COLLECTION, id);
    await deleteDoc(docRef);
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
