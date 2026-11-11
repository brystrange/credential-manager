import * as XLSX from "xlsx";
import JSZip from "jszip";

export interface SheetPreview {
    name: string;
    html: string;
    totalRows: number;
    totalCols: number;
    truncatedNote?: string;
}

export interface PptxParagraph {
    text: string;
    isBullet?: boolean;
}

export interface PptxSlidePreview {
    slideNumber: number;
    title: string;
    paragraphs: PptxParagraph[];
    images: string[];
    notes?: string;
}

export interface OfficePreviewData {
    arrayBuffer?: ArrayBuffer;
    excelSheets?: SheetPreview[];
    pptxSlides?: PptxSlidePreview[];
    pptxThumbnailUrl?: string;
}

const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLS = 52; // Column AZ

const MS_OFFICE_TYPES = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
];

export const isOfficeFile = (type: string) => MS_OFFICE_TYPES.includes(type);

export const isDocxFile = (type: string) =>
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword";

export const isExcelFile = (type: string) =>
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel";

export const isCsvFile = (type: string, name?: string) =>
    type === "text/csv" ||
    type === "application/csv" ||
    Boolean(name && name.toLowerCase().endsWith(".csv"));

export const isSpreadsheetFile = (type: string, name?: string) =>
    isExcelFile(type) || isCsvFile(type, name);

export const isPptxFile = (type: string) =>
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    type === "application/vnd.ms-powerpoint";

export function sanitizeExcelHtml(html: string): string {
    if (!html) return "";
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        doc.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach((el) => el.remove());
        doc.querySelectorAll("*").forEach((el) => {
            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                const val = attr.value.toLowerCase().trim();
                if (name.startsWith("on") || val.startsWith("javascript:") || val.startsWith("data:text/html")) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        const table = doc.querySelector("table");
        return table ? table.outerHTML : doc.body ? doc.body.innerHTML : "";
    } catch {
        return "";
    }
}

function parseWorkbookToSheets(workbook: XLSX.WorkBook): SheetPreview[] {
    const parser = new DOMParser();

    return workbook.SheetNames.map((sheetName) => {
        const ws = workbook.Sheets[sheetName];
        if (!ws || !ws["!ref"]) {
            return {
                name: sheetName,
                html: '<div class="excel-empty-sheet">This sheet is empty.</div>',
                totalRows: 0,
                totalCols: 0,
            };
        }

        const origRange = XLSX.utils.decode_range(ws["!ref"]);
        const totalRows = origRange.e.r + 1;
        const totalCols = origRange.e.c + 1;

        const cappedRange = {
            s: { r: 0, c: 0 },
            e: {
                r: Math.min(Math.max(origRange.e.r, 0), MAX_PREVIEW_ROWS - 1),
                c: Math.min(Math.max(origRange.e.c, 0), MAX_PREVIEW_COLS - 1),
            },
        };

        const cappedWs = { ...ws, "!ref": XLSX.utils.encode_range(cappedRange) };
        const rawHtml = XLSX.utils.sheet_to_html(cappedWs);
        const doc = parser.parseFromString(rawHtml, "text/html");
        const table = doc.querySelector("table");

        let html = "";
        if (table) {
            const colCount = cappedRange.e.c;

            const headerRow = doc.createElement("tr");
            const cornerTh = doc.createElement("th");
            cornerTh.style.background = "#f3f4f6";
            cornerTh.style.border = "1px solid #d0d7de";
            cornerTh.style.minWidth = "44px";
            headerRow.appendChild(cornerTh);

            for (let i = 0; i <= colCount; i++) {
                const th = doc.createElement("th");
                th.textContent = XLSX.utils.encode_col(i);
                th.style.background = "#f3f4f6";
                th.style.border = "1px solid #d0d7de";
                th.style.padding = "5px 10px";
                th.style.textAlign = "center";
                th.style.fontWeight = "600";
                headerRow.appendChild(th);
            }
            table.prepend(headerRow);

            const rows = table.querySelectorAll("tr");
            for (let i = 1; i < rows.length; i++) {
                const th = doc.createElement("th");
                th.textContent = i.toString();
                th.style.background = "#f3f4f6";
                th.style.border = "1px solid #d0d7de";
                th.style.padding = "5px 8px";
                th.style.textAlign = "center";
                th.style.fontWeight = "600";
                rows[i].prepend(th);
            }

            table.querySelectorAll("td, th").forEach((cell) => {
                (cell as HTMLElement).style.border = "1px solid #d0d7de";
            });
            table.style.borderCollapse = "collapse";
            html = sanitizeExcelHtml(table.outerHTML);
        } else {
            html = sanitizeExcelHtml(rawHtml);
        }

        const isTruncated = totalRows > MAX_PREVIEW_ROWS || totalCols > MAX_PREVIEW_COLS;
        const truncatedNote = isTruncated
            ? `Showing first ${Math.min(totalRows, MAX_PREVIEW_ROWS)} of ${totalRows} rows and ${Math.min(
                  totalCols,
                  MAX_PREVIEW_COLS
              )} of ${totalCols} columns. Download the file to view everything.`
            : undefined;

        return {
            name: sheetName,
            html,
            totalRows,
            totalCols,
            truncatedNote,
        };
    });
}

function getElementsByLocalName(root: Element | Document, localName: string): Element[] {
    const results: Element[] = [];
    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
        if (all[i].localName === localName) {
            results.push(all[i]);
        }
    }
    return results;
}

function resolveZipPath(baseDir: string, target: string): string {
    if (target.startsWith("/")) return target.slice(1);
    const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
    const resolved: string[] = [];
    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") resolved.pop();
        else resolved.push(part);
    }
    return resolved.join("/");
}

function mimeForImagePath(filePath: string): string | null {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    return null;
}

function extractSlideText(xmlString: string): { title: string; paragraphs: PptxParagraph[] } {
    const doc = new DOMParser().parseFromString(xmlString, "application/xml");
    let title = "";
    const paragraphs: PptxParagraph[] = [];

    const shapes = getElementsByLocalName(doc, "sp");
    for (const sp of shapes) {
        const phs = getElementsByLocalName(sp, "ph");
        const phType = phs[0]?.getAttribute("type") || "";
        if (phType === "sldNum" || phType === "ftr" || phType === "dt") {
            continue;
        }
        const isTitle = phType === "title" || phType === "ctrTitle";

        const pNodes = getElementsByLocalName(sp, "p");
        for (const p of pNodes) {
            const texts = getElementsByLocalName(p, "t")
                .map((t) => t.textContent || "")
                .join("")
                .trim();
            if (!texts) continue;

            if (isTitle && !title) {
                title = texts;
                continue;
            }
            const pPr = getElementsByLocalName(p, "pPr")[0];
            const hasBuNone = pPr ? getElementsByLocalName(pPr, "buNone").length > 0 : false;
            const hasBulletNode = pPr
                ? getElementsByLocalName(pPr, "buChar").length > 0 ||
                  getElementsByLocalName(pPr, "buAutoNum").length > 0 ||
                  Boolean(pPr.getAttribute("lvl") && pPr.getAttribute("lvl") !== "0")
                : false;

            paragraphs.push({
                text: texts,
                isBullet: !isTitle && !hasBuNone && hasBulletNode,
            });
        }
    }

    return { title, paragraphs };
}

function extractNotesText(xmlString: string): string {
    const doc = new DOMParser().parseFromString(xmlString, "application/xml");
    const lines: string[] = [];
    const shapes = getElementsByLocalName(doc, "sp");
    for (const sp of shapes) {
        const phs = getElementsByLocalName(sp, "ph");
        const phType = phs[0]?.getAttribute("type") || "";
        if (phType === "sldNum" || phType === "sldImg") continue;

        const pNodes = getElementsByLocalName(sp, "p");
        for (const p of pNodes) {
            const text = getElementsByLocalName(p, "t")
                .map((t) => t.textContent || "")
                .join("")
                .trim();
            if (text) lines.push(text);
        }
    }
    return lines.join("\n");
}

async function parsePptxDeck(
    arrayBuffer: ArrayBuffer
): Promise<{ slides: PptxSlidePreview[]; thumbnailUrl?: string }> {
    const zip = await JSZip.loadAsync(arrayBuffer);

    let thumbnailUrl: string | undefined;
    const thumbFile = zip.file("docProps/thumbnail.jpeg");
    if (thumbFile) {
        const thumbBlob = await thumbFile.async("blob");
        thumbnailUrl = URL.createObjectURL(thumbBlob);
    }

    const slidePaths = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide(\d+)\.xml$/i.test(name))
        .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
            const numB = parseInt(b.match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
            return numA - numB;
        });

    const imageUrlCache = new Map<string, string>();
    const slides: PptxSlidePreview[] = [];

    for (const slidePath of slidePaths) {
        const slideNum = parseInt(slidePath.match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
        const xmlText = await zip.file(slidePath)!.async("string");
        const { title, paragraphs } = extractSlideText(xmlText);

        const images: string[] = [];
        let notes: string | undefined;

        const fileName = slidePath.split("/").pop()!;
        const relsPath = `ppt/slides/_rels/${fileName}.rels`;
        const relsFile = zip.file(relsPath);
        if (relsFile) {
            const relsXml = await relsFile.async("string");
            const relsDoc = new DOMParser().parseFromString(relsXml, "application/xml");
            const rels = getElementsByLocalName(relsDoc, "Relationship");

            for (const rel of rels) {
                const targetMode = rel.getAttribute("TargetMode");
                if (targetMode === "External") continue;

                const typeAttr = (rel.getAttribute("Type") || "").toLowerCase();
                const target = rel.getAttribute("Target") || "";
                const resolvedPath = resolveZipPath("ppt/slides", target);

                if (typeAttr.endsWith("/image")) {
                    const mime = mimeForImagePath(resolvedPath);
                    if (!mime) continue; // Skip SVG / EMF / WMF for security & browser support
                    let url = imageUrlCache.get(resolvedPath);
                    if (!url) {
                        const imgZipEntry = zip.file(resolvedPath);
                        if (imgZipEntry) {
                            const bytes = await imgZipEntry.async("arraybuffer");
                            url = URL.createObjectURL(new Blob([bytes], { type: mime }));
                            imageUrlCache.set(resolvedPath, url);
                        }
                    }
                    if (url && !images.includes(url)) {
                        images.push(url);
                    }
                } else if (typeAttr.endsWith("/notesslide") && !notes) {
                    const notesZipEntry = zip.file(resolvedPath);
                    if (notesZipEntry) {
                        const notesXml = await notesZipEntry.async("string");
                        const extractedNotes = extractNotesText(notesXml);
                        if (extractedNotes) notes = extractedNotes;
                    }
                }
            }
        }

        slides.push({
            slideNumber: slideNum,
            title,
            paragraphs,
            images,
            notes,
        });
    }

    return { slides, thumbnailUrl };
}

/**
 * Parses encrypted-then-decrypted spreadsheet / Office files (XLSX, XLS, CSV, DOCX, PPTX)
 * into clean, sanitized preview payloads shared by Personal Vault and Shared with Me.
 */
export async function buildOfficePreviewData(
    blob: Blob,
    fileType: string,
    fileName?: string
): Promise<OfficePreviewData> {
    const arrayBuffer = await blob.arrayBuffer();

    if (isCsvFile(fileType, fileName)) {
        try {
            const text = await blob.text();
            const workbook = XLSX.read(text, { type: "string" });
            const excelSheets = parseWorkbookToSheets(workbook);
            return { arrayBuffer, excelSheets };
        } catch (err) {
            console.error("CSV parse failed", err);
            return { arrayBuffer };
        }
    }

    if (isExcelFile(fileType)) {
        try {
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const excelSheets = parseWorkbookToSheets(workbook);
            return { arrayBuffer, excelSheets };
        } catch (err) {
            console.error("Excel parse failed", err);
            return { arrayBuffer };
        }
    }

    if (isPptxFile(fileType)) {
        try {
            const { slides, thumbnailUrl } = await parsePptxDeck(arrayBuffer);
            return {
                arrayBuffer,
                pptxSlides: slides.length > 0 ? slides : undefined,
                pptxThumbnailUrl: thumbnailUrl,
            };
        } catch (err) {
            console.error("PPTX parse failed", err);
            return { arrayBuffer };
        }
    }

    return { arrayBuffer };
}
