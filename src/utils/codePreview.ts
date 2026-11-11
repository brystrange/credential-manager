import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

let languagesRegistered = false;

function ensureLanguagesRegistered(): void {
    if (languagesRegistered) return;
    hljs.registerLanguage('typescript', typescript);
    hljs.registerLanguage('javascript', javascript);
    hljs.registerLanguage('python', python);
    hljs.registerLanguage('xml', xml);
    hljs.registerLanguage('css', css);
    hljs.registerLanguage('scss', scss);
    hljs.registerLanguage('less', less);
    hljs.registerLanguage('json', json);
    hljs.registerLanguage('markdown', markdown);
    hljs.registerLanguage('yaml', yaml);
    hljs.registerLanguage('ini', ini);
    hljs.registerLanguage('sql', sql);
    hljs.registerLanguage('bash', bash);
    hljs.registerLanguage('powershell', powershell);
    hljs.registerLanguage('dos', dos);
    hljs.registerLanguage('rust', rust);
    hljs.registerLanguage('go', go);
    hljs.registerLanguage('java', java);
    hljs.registerLanguage('kotlin', kotlin);
    hljs.registerLanguage('swift', swift);
    hljs.registerLanguage('c', c);
    hljs.registerLanguage('cpp', cpp);
    hljs.registerLanguage('csharp', csharp);
    hljs.registerLanguage('php', php);
    hljs.registerLanguage('ruby', ruby);
    hljs.registerLanguage('dockerfile', dockerfile);
    hljs.registerLanguage('makefile', makefile);
    hljs.registerLanguage('diff', diff);
    hljs.registerLanguage('plaintext', plaintext);

    hljs.registerAliases(['ts', 'tsx', 'mts', 'cts'], { languageName: 'typescript' });
    hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' });
    hljs.registerAliases(['html', 'htm', 'xhtml', 'svg', 'plist', 'csproj', 'xaml'], { languageName: 'xml' });
    hljs.registerAliases(['toml', 'env', 'conf', 'cfg', 'properties', 'gitignore', 'editorconfig'], { languageName: 'ini' });
    hljs.registerAliases(['jsonc', 'json5', 'jsonl'], { languageName: 'json' });
    hljs.registerAliases(['md', 'mdx'], { languageName: 'markdown' });
    hljs.registerAliases(['yml'], { languageName: 'yaml' });
    hljs.registerAliases(['sh', 'zsh', 'fish', 'shell'], { languageName: 'bash' });
    hljs.registerAliases(['ps1', 'psm1', 'psd1', 'pwsh'], { languageName: 'powershell' });
    hljs.registerAliases(['bat', 'cmd'], { languageName: 'dos' });
    hljs.registerAliases(['docker'], { languageName: 'dockerfile' });
    hljs.registerAliases(['log', 'txt', 'text'], { languageName: 'plaintext' });
    languagesRegistered = true;
}

export interface CodeLanguageInfo {
    id: string;
    label: string;
    typeLabel: string;
    shortTag: string;
    accentColor: string;
    hljsLang: string;
    iconKind: 'code' | 'terminal' | 'text';
    isMarkdown?: boolean;
    isJson?: boolean;
    isHtml?: boolean;
    isLog?: boolean;
}

const LANG_DEFINITIONS: Record<string, CodeLanguageInfo> = {
    typescript: { id: 'typescript', label: 'TypeScript', typeLabel: 'TypeScript File', shortTag: 'TS', accentColor: '#3178c6', hljsLang: 'typescript', iconKind: 'code' },
    tsx: { id: 'tsx', label: 'TypeScript JSX', typeLabel: 'TSX File', shortTag: 'TSX', accentColor: '#38bdf8', hljsLang: 'typescript', iconKind: 'code' },
    javascript: { id: 'javascript', label: 'JavaScript', typeLabel: 'JavaScript File', shortTag: 'JS', accentColor: '#f7df1e', hljsLang: 'javascript', iconKind: 'code' },
    jsx: { id: 'jsx', label: 'JavaScript JSX', typeLabel: 'JSX File', shortTag: 'JSX', accentColor: '#61dafb', hljsLang: 'javascript', iconKind: 'code' },
    python: { id: 'python', label: 'Python', typeLabel: 'Python File', shortTag: 'PY', accentColor: '#3776ab', hljsLang: 'python', iconKind: 'code' },
    html: { id: 'html', label: 'HTML', typeLabel: 'HTML Document', shortTag: 'HTML', accentColor: '#e34c26', hljsLang: 'xml', iconKind: 'code', isHtml: true },
    xml: { id: 'xml', label: 'XML', typeLabel: 'XML Document', shortTag: 'XML', accentColor: '#f97316', hljsLang: 'xml', iconKind: 'code' },
    css: { id: 'css', label: 'CSS', typeLabel: 'CSS File', shortTag: 'CSS', accentColor: '#38bdf8', hljsLang: 'css', iconKind: 'code' },
    scss: { id: 'scss', label: 'SCSS / Sass', typeLabel: 'SCSS Stylesheet', shortTag: 'SCSS', accentColor: '#cc6699', hljsLang: 'scss', iconKind: 'code' },
    less: { id: 'less', label: 'Less', typeLabel: 'Less Stylesheet', shortTag: 'LESS', accentColor: '#60a5fa', hljsLang: 'less', iconKind: 'code' },
    json: { id: 'json', label: 'JSON', typeLabel: 'JSON File', shortTag: 'JSON', accentColor: '#f59e0b', hljsLang: 'json', iconKind: 'code', isJson: true },
    markdown: { id: 'markdown', label: 'Markdown', typeLabel: 'Markdown Document', shortTag: 'MD', accentColor: '#8b5cf6', hljsLang: 'markdown', iconKind: 'text', isMarkdown: true },
    yaml: { id: 'yaml', label: 'YAML', typeLabel: 'YAML Configuration', shortTag: 'YAML', accentColor: '#f43f5e', hljsLang: 'yaml', iconKind: 'code' },
    toml: { id: 'toml', label: 'TOML', typeLabel: 'TOML Configuration', shortTag: 'TOML', accentColor: '#ec4899', hljsLang: 'ini', iconKind: 'code' },
    ini: { id: 'ini', label: 'Config / INI', typeLabel: 'Configuration File', shortTag: 'CFG', accentColor: '#ec4899', hljsLang: 'ini', iconKind: 'code' },
    env: { id: 'env', label: 'Environment (.env)', typeLabel: 'Environment File', shortTag: 'ENV', accentColor: '#eab308', hljsLang: 'ini', iconKind: 'terminal' },
    sql: { id: 'sql', label: 'SQL', typeLabel: 'SQL Script', shortTag: 'SQL', accentColor: '#e38c00', hljsLang: 'sql', iconKind: 'code' },
    bash: { id: 'bash', label: 'Shell / Bash', typeLabel: 'Shell Script', shortTag: 'SH', accentColor: '#22c55e', hljsLang: 'bash', iconKind: 'terminal' },
    powershell: { id: 'powershell', label: 'PowerShell', typeLabel: 'PowerShell Script', shortTag: 'PS1', accentColor: '#3b82f6', hljsLang: 'powershell', iconKind: 'terminal' },
    dos: { id: 'dos', label: 'Batch Script', typeLabel: 'Windows Batch File', shortTag: 'BAT', accentColor: '#4ade80', hljsLang: 'dos', iconKind: 'terminal' },
    rust: { id: 'rust', label: 'Rust', typeLabel: 'Rust Source File', shortTag: 'RS', accentColor: '#ea580c', hljsLang: 'rust', iconKind: 'code' },
    go: { id: 'go', label: 'Go', typeLabel: 'Go Source File', shortTag: 'GO', accentColor: '#00add8', hljsLang: 'go', iconKind: 'code' },
    java: { id: 'java', label: 'Java', typeLabel: 'Java Source File', shortTag: 'JAVA', accentColor: '#f89820', hljsLang: 'java', iconKind: 'code' },
    kotlin: { id: 'kotlin', label: 'Kotlin', typeLabel: 'Kotlin Source File', shortTag: 'KT', accentColor: '#a97bff', hljsLang: 'kotlin', iconKind: 'code' },
    swift: { id: 'swift', label: 'Swift', typeLabel: 'Swift Source File', shortTag: 'SWIFT', accentColor: '#f05138', hljsLang: 'swift', iconKind: 'code' },
    c: { id: 'c', label: 'C', typeLabel: 'C Source File', shortTag: 'C', accentColor: '#649ad2', hljsLang: 'c', iconKind: 'code' },
    cpp: { id: 'cpp', label: 'C++', typeLabel: 'C++ Source File', shortTag: 'C++', accentColor: '#3b82f6', hljsLang: 'cpp', iconKind: 'code' },
    csharp: { id: 'csharp', label: 'C#', typeLabel: 'C# Source File', shortTag: 'C#', accentColor: '#9b4f96', hljsLang: 'csharp', iconKind: 'code' },
    php: { id: 'php', label: 'PHP', typeLabel: 'PHP Script', shortTag: 'PHP', accentColor: '#777bb4', hljsLang: 'php', iconKind: 'code' },
    ruby: { id: 'ruby', label: 'Ruby', typeLabel: 'Ruby Script', shortTag: 'RB', accentColor: '#cc342d', hljsLang: 'ruby', iconKind: 'code' },
    dockerfile: { id: 'dockerfile', label: 'Dockerfile', typeLabel: 'Docker Definition', shortTag: 'DOCKER', accentColor: '#2496ed', hljsLang: 'dockerfile', iconKind: 'terminal' },
    makefile: { id: 'makefile', label: 'Makefile', typeLabel: 'Makefile', shortTag: 'MAKE', accentColor: '#10b981', hljsLang: 'makefile', iconKind: 'terminal' },
    diff: { id: 'diff', label: 'Diff / Patch', typeLabel: 'Diff Patch File', shortTag: 'DIFF', accentColor: '#10b981', hljsLang: 'diff', iconKind: 'code' },
    log: { id: 'log', label: 'Log File', typeLabel: 'Log File', shortTag: 'LOG', accentColor: '#f97316', hljsLang: 'plaintext', iconKind: 'text', isLog: true },
    plaintext: { id: 'plaintext', label: 'Plain Text', typeLabel: 'Text Document', shortTag: 'TXT', accentColor: '#94a3b8', hljsLang: 'plaintext', iconKind: 'text' },
};

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'jsx',
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    html: 'html',
    htm: 'html',
    xhtml: 'html',
    xml: 'xml',
    plist: 'xml',
    csproj: 'xml',
    xaml: 'xml',
    props: 'xml',
    targets: 'xml',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    jsonl: 'json',
    md: 'markdown',
    markdown: 'markdown',
    mdx: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    cfg: 'ini',
    properties: 'ini',
    editorconfig: 'ini',
    gitignore: 'ini',
    gitattributes: 'ini',
    dockerignore: 'ini',
    npmrc: 'ini',
    nvmrc: 'ini',
    env: 'env',
    sql: 'sql',
    ddl: 'sql',
    dml: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    ps1: 'powershell',
    psm1: 'powershell',
    psd1: 'powershell',
    bat: 'dos',
    cmd: 'dos',
    rs: 'rust',
    go: 'go',
    mod: 'go',
    java: 'java',
    gradle: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    hh: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    rake: 'ruby',
    gemspec: 'ruby',
    dockerfile: 'dockerfile',
    mk: 'makefile',
    diff: 'diff',
    patch: 'diff',
    log: 'log',
    out: 'log',
    txt: 'plaintext',
    rtf: 'plaintext',
    tex: 'plaintext',
};

const CODE_TEXT_MIME_MAP: Record<string, string> = {
    'application/json': 'json',
    'application/ld+json': 'json',
    'application/javascript': 'javascript',
    'application/x-javascript': 'javascript',
    'text/javascript': 'javascript',
    'application/typescript': 'typescript',
    'text/typescript': 'typescript',
    'text/x-python': 'python',
    'application/x-python-code': 'python',
    'text/html': 'html',
    'text/css': 'css',
    'text/x-scss': 'scss',
    'text/xml': 'xml',
    'application/xml': 'xml',
    'text/markdown': 'markdown',
    'text/x-markdown': 'markdown',
    'application/x-yaml': 'yaml',
    'text/yaml': 'yaml',
    'text/x-yaml': 'yaml',
    'application/sql': 'sql',
    'text/x-sql': 'sql',
    'application/x-sh': 'bash',
    'text/x-shellscript': 'bash',
    'application/toml': 'toml',
    'text/plain': 'plaintext',
};

const SPECIAL_FILENAME_TO_LANG: Record<string, string> = {
    dockerfile: 'dockerfile',
    containerfile: 'dockerfile',
    makefile: 'makefile',
    gnumakefile: 'makefile',
    gemfile: 'ruby',
    rakefile: 'ruby',
    '.gitignore': 'ini',
    '.gitattributes': 'ini',
    '.dockerignore': 'ini',
    '.npmignore': 'ini',
    '.eslintignore': 'ini',
    '.prettierignore': 'ini',
    '.editorconfig': 'ini',
    '.npmrc': 'ini',
    '.nvmrc': 'ini',
    '.prettierrc': 'json',
    '.eslintrc': 'json',
    '.babelrc': 'json',
    '.bashrc': 'bash',
    '.bash_profile': 'bash',
    '.zshrc': 'bash',
    license: 'plaintext',
    readme: 'plaintext',
    changelog: 'plaintext',
};

function getBaseName(fileName: string): string {
    const clean = (fileName || '').trim().toLowerCase();
    const parts = clean.split(/[/\\]/);
    return parts[parts.length - 1] || clean;
}

export function detectCodeLanguageId(fileName?: string, mimeType?: string): string | null {
    const base = getBaseName(fileName || '');
    const mime = (mimeType || '').toLowerCase().split(';')[0].trim();

    if (mime === 'text/csv' || mime === 'application/csv' || base.endsWith('.csv')) {
        return null;
    }

    if (base) {
        if (SPECIAL_FILENAME_TO_LANG[base]) {
            return SPECIAL_FILENAME_TO_LANG[base];
        }
        if (base === '.env' || base.startsWith('.env.')) {
            return 'env';
        }
        if (base.startsWith('dockerfile.')) {
            return 'dockerfile';
        }
        const dotIdx = base.lastIndexOf('.');
        if (dotIdx >= 0 && dotIdx < base.length - 1) {
            const ext = base.slice(dotIdx + 1);
            if (EXT_TO_LANG[ext]) {
                return EXT_TO_LANG[ext];
            }
        }
    }

    if (mime && CODE_TEXT_MIME_MAP[mime]) {
        return CODE_TEXT_MIME_MAP[mime];
    }
    if (mime.startsWith('text/')) {
        return 'plaintext';
    }
    return null;
}

export function isCodeOrTextFile(mimeType?: string, fileName?: string): boolean {
    return detectCodeLanguageId(fileName, mimeType) !== null;
}

export function getCodeLanguageInfo(fileName?: string, mimeType?: string): CodeLanguageInfo {
    const langId = detectCodeLanguageId(fileName, mimeType) || 'plaintext';
    return LANG_DEFINITIONS[langId] || LANG_DEFINITIONS.plaintext;
}

export function resolveDeveloperMimeType(fileName: string): string | null {
    const langId = detectCodeLanguageId(fileName);
    if (!langId) return null;
    switch (langId) {
        case 'json': return 'application/json';
        case 'javascript':
        case 'jsx': return 'text/javascript';
        case 'typescript':
        case 'tsx': return 'text/typescript';
        case 'html': return 'text/html';
        case 'css': return 'text/css';
        case 'xml': return 'application/xml';
        case 'markdown': return 'text/markdown';
        case 'yaml': return 'text/yaml';
        case 'sql': return 'application/sql';
        case 'bash': return 'application/x-sh';
        default: return 'text/plain';
    }
}

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function balanceHighlightLines(highlightedHtml: string): string[] {
    const rawLines = highlightedHtml.split(/\r?\n/);
    const openTags: string[] = [];
    const tagRegex = /<\/?span\b[^>]*>/gi;

    return rawLines.map((rawLine) => {
        const prefix = openTags.join('');
        tagRegex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = tagRegex.exec(rawLine)) !== null) {
            const tag = match[0];
            if (tag.startsWith('</')) {
                openTags.pop();
            } else {
                openTags.push(tag);
            }
        }
        const suffix = '</span>'.repeat(openTags.length);
        return prefix + rawLine + suffix;
    });
}

const LOG_TOKEN_REGEX =
    /(\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b|\[\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\])|(\b(?:FATAL|ERROR|ERR|CRITICAL|PANIC|EXCEPTION|FAILED|FAIL)\b)|(\b(?:WARN|WARNING)\b)|(\b(?:INFO|NOTICE|SUCCESS|OK)\b)|(\b(?:DEBUG|TRACE)\b)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b/g;

function highlightLogText(text: string): string[] {
    const lines = text.split(/\r?\n/);
    return lines.map((line) => {
        if (!line) return '';
        let out = '';
        let lastIndex = 0;
        LOG_TOKEN_REGEX.lastIndex = 0;
        let m: RegExpExecArray | null;

        while ((m = LOG_TOKEN_REGEX.exec(line)) !== null) {
            if (m.index > lastIndex) {
                out += escapeHtml(line.slice(lastIndex, m.index));
            }
            const token = m[0];
            if (m[1]) {
                out += `<span class="log-tok-time">${escapeHtml(token)}</span>`;
            } else if (m[2]) {
                out += `<span class="log-tok-error">${escapeHtml(token)}</span>`;
            } else if (m[3]) {
                out += `<span class="log-tok-warn">${escapeHtml(token)}</span>`;
            } else if (m[4]) {
                out += `<span class="log-tok-info">${escapeHtml(token)}</span>`;
            } else if (m[5]) {
                out += `<span class="log-tok-debug">${escapeHtml(token)}</span>`;
            } else if (m[6]) {
                out += `<span class="hljs-string">${escapeHtml(token)}</span>`;
            } else if (m[7]) {
                out += `<span class="hljs-number">${escapeHtml(token)}</span>`;
            } else {
                out += escapeHtml(token);
            }
            lastIndex = LOG_TOKEN_REGEX.lastIndex;
        }
        if (lastIndex < line.length) {
            out += escapeHtml(line.slice(lastIndex));
        }
        return out;
    });
}

export function highlightCodeLines(code: string, langInfo: CodeLanguageInfo): string[] {
    if (!code) return [''];
    if (langInfo.isLog) {
        return highlightLogText(code);
    }

    ensureLanguagesRegistered();
    const targetLang = hljs.getLanguage(langInfo.hljsLang) ? langInfo.hljsLang : 'plaintext';
    try {
        const result = hljs.highlight(code, { language: targetLang, ignoreIllegals: true });
        return balanceHighlightLines(result.value);
    } catch {
        return code.split(/\r?\n/).map(escapeHtml);
    }
}

export function formatJsonSafely(raw: string): { formatted?: string; error?: string; valid: boolean } {
    const clean = raw.replace(/^\uFEFF/, '');
    try {
        const parsed: unknown = JSON.parse(clean);
        return {
            formatted: JSON.stringify(parsed, null, 2),
            valid: true,
        };
    } catch (err) {
        return {
            error: err instanceof Error ? err.message : 'Invalid JSON syntax',
            valid: false,
        };
    }
}

const ENTITY_DECODE_MAP: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
};

function decodeBasicEntities(htmlChunk: string): string {
    return htmlChunk.replace(/&(lt|gt|amp|quot|#39|#x27|#x2F);/g, (m) => ENTITY_DECODE_MAP[m] ?? m);
}

interface HtmlToken {
    type: 'tag' | 'text';
    raw: string;
    plain: string;
    startOffset: number;
    endOffset: number;
}

/**
 * Highlights case-insensitive query occurrences across syntax-highlighted HTML tokens
 * without corrupting HTML tags, while assigning sequential global match indices.
 */
export function applySearchHighlightToLineHtml(
    lineHtml: string,
    lowerQuery: string,
    activeMatchGlobalIdx: number,
    counter: { count: number }
): string {
    if (!lowerQuery) return lineHtml;

    const tokens: HtmlToken[] = [];
    const tagPattern = /<[^>]+>/g;
    let lastIdx = 0;
    let plainOffset = 0;
    let m: RegExpExecArray | null;

    while ((m = tagPattern.exec(lineHtml)) !== null) {
        if (m.index > lastIdx) {
            const rawText = lineHtml.slice(lastIdx, m.index);
            const plain = decodeBasicEntities(rawText);
            tokens.push({
                type: 'text',
                raw: rawText,
                plain,
                startOffset: plainOffset,
                endOffset: plainOffset + plain.length,
            });
            plainOffset += plain.length;
        }
        tokens.push({
            type: 'tag',
            raw: m[0],
            plain: '',
            startOffset: plainOffset,
            endOffset: plainOffset,
        });
        lastIdx = tagPattern.lastIndex;
    }

    if (lastIdx < lineHtml.length) {
        const rawText = lineHtml.slice(lastIdx);
        const plain = decodeBasicEntities(rawText);
        tokens.push({
            type: 'text',
            raw: rawText,
            plain,
            startOffset: plainOffset,
            endOffset: plainOffset + plain.length,
        });
    }

    const fullPlain = tokens.filter((t) => t.type === 'text').map((t) => t.plain).join('');
    const lowerFullPlain = fullPlain.toLowerCase();
    const matches: Array<{ start: number; end: number; idx: number }> = [];
    let searchPos = 0;

    while (searchPos <= lowerFullPlain.length - lowerQuery.length) {
        const foundAt = lowerFullPlain.indexOf(lowerQuery, searchPos);
        if (foundAt === -1) break;
        matches.push({
            start: foundAt,
            end: foundAt + lowerQuery.length,
            idx: counter.count++,
        });
        searchPos = foundAt + Math.max(1, lowerQuery.length);
    }

    if (matches.length === 0) return lineHtml;

    return tokens
        .map((tok) => {
            if (tok.type === 'tag') return tok.raw;
            if (!tok.plain) return '';

            let chunkOut = '';
            let cursor = tok.startOffset;

            for (const matchRange of matches) {
                if (matchRange.end <= tok.startOffset) continue;
                if (matchRange.start >= tok.endOffset) break;

                const segStart = Math.max(cursor, matchRange.start);
                const segEnd = Math.min(tok.endOffset, matchRange.end);

                if (segStart > cursor) {
                    chunkOut += escapeHtml(tok.plain.slice(cursor - tok.startOffset, segStart - tok.startOffset));
                }

                if (segEnd > segStart) {
                    const isActive = matchRange.idx === activeMatchGlobalIdx;
                    const isMatchFirstChunk = segStart === matchRange.start;
                    const idxAttr = isMatchFirstChunk ? ` data-match-idx="${matchRange.idx}"` : '';
                    chunkOut += `<mark class="code-find-match${isActive ? ' active' : ''}"${idxAttr}>${escapeHtml(
                        tok.plain.slice(segStart - tok.startOffset, segEnd - tok.startOffset)
                    )}</mark>`;
                }

                cursor = segEnd;
            }

            if (cursor < tok.endOffset) {
                chunkOut += escapeHtml(tok.plain.slice(cursor - tok.startOffset));
            }

            return chunkOut;
        })
        .join('');
}

let markdownParser: Marked | null = null;

function getMarkdownParser(): Marked {
    if (markdownParser) return markdownParser;
    ensureLanguagesRegistered();
    markdownParser = new Marked({
        gfm: true,
        breaks: false,
        renderer: {
            code({ text, lang }) {
                const rawLang = (lang || '').trim().toLowerCase().split(/\s+/)[0] || '';
                const langInfo = rawLang
                    ? getCodeLanguageInfo(`snippet.${rawLang}`)
                    : LANG_DEFINITIONS.plaintext;
                const hlLang = rawLang && hljs.getLanguage(rawLang) ? rawLang : langInfo.hljsLang;
                let highlighted = escapeHtml(text);
                try {
                    highlighted = hljs.highlight(text, {
                        language: hljs.getLanguage(hlLang) ? hlLang : 'plaintext',
                        ignoreIllegals: true,
                    }).value;
                } catch {
                    highlighted = escapeHtml(text);
                }
                return `<div class="md-code-block" data-lang="${escapeHtml(langInfo.id)}"><div class="md-code-header"><span class="md-code-lang">${escapeHtml(rawLang || langInfo.label)}</span></div><pre><code class="hljs language-${escapeHtml(langInfo.id)}">${highlighted}</code></pre></div>`;
            },
        },
    });
    return markdownParser;
}

export function renderMarkdownHtml(md: string): string {
    const parser = getMarkdownParser();
    const rawHtml = parser.parse(md, { async: false });
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.hasAttribute('href')) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
    try {
        return DOMPurify.sanitize(rawHtml, {
            ADD_ATTR: ['data-lang'],
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
        });
    } finally {
        DOMPurify.removeHook('afterSanitizeAttributes');
    }
}
