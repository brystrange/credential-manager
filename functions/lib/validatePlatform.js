"use strict";
/**
 * Input validation helpers for platform CRUD operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlatformInput = validatePlatformInput;
/**
 * Validates and sanitises a platform input payload.
 * Throws a descriptive error if validation fails.
 */
function validatePlatformInput(data) {
    if (!data || typeof data !== "object") {
        throw new Error("Invalid request body.");
    }
    const d = data;
    const name = typeof d.name === "string" ? d.name.trim() : "";
    if (!name)
        throw new Error("Platform name is required.");
    if (name.length > 100)
        throw new Error("Platform name must be 100 characters or fewer.");
    const domain = typeof d.domain === "string" ? d.domain.trim() : "";
    if (domain.length > 255)
        throw new Error("Domain must be 255 characters or fewer.");
    const color = typeof d.color === "string" ? d.color.trim() : "#6366f1";
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
        throw new Error("Invalid colour hex.");
    const category = typeof d.category === "string" ? d.category.trim() : "Other";
    if (category.length > 50)
        throw new Error("Category must be 50 characters or fewer.");
    const logoUrl = typeof d.logoUrl === "string" ? d.logoUrl.trim() : "";
    if (logoUrl.length > 2048)
        throw new Error("Logo URL must be 2048 characters or fewer.");
    const link = typeof d.link === "string" ? d.link.trim() : "";
    if (link.length > 2048)
        throw new Error("Link must be 2048 characters or fewer.");
    return { name, domain, color, category, logoUrl, link };
}
//# sourceMappingURL=validatePlatform.js.map