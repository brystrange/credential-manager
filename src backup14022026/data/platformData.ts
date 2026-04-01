// Platform data is now managed dynamically via Firestore.
// This file is kept for backward compatibility but re-exports from platformService.
export type { Platform } from "../services/platformService";
export { findPlatformByName, getCategories } from "../services/platformService";
