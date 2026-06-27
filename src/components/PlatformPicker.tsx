import { useState, useRef, useEffect, useMemo } from "react";
import type { Platform } from "../services/platformService";
import { getCategories } from "../services/platformService";
import { FiSearch, FiX, FiPlus, FiCheck } from "react-icons/fi";

interface PlatformPickerProps {
    value: string;
    onChange: (platformName: string) => void;
    existingPlatforms?: string[];
    disabled?: boolean;
    platforms: Platform[];
}

/** Scroll an element into view only on touch/mobile devices */
function scrollIntoViewOnMobile(el: HTMLElement | null) {
    if (!el) return;
    if (window.matchMedia("(max-width: 768px)").matches) {
        // Small delay lets the keyboard start opening before we scroll
        setTimeout(() => {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
    }
}

export default function PlatformPicker({
    value,
    onChange,
    existingPlatforms = [],
    disabled = false,
    platforms,
}: PlatformPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [customMode, setCustomMode] = useState(false);
    const [customName, setCustomName] = useState("");
    const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
    const pickerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const customInputRef = useRef<HTMLInputElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setCustomMode(false);
                setSearch("");
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClick);
            return () => document.removeEventListener("mousedown", handleClick);
        }
    }, [isOpen]);

    // Focus search on open and scroll into view on mobile
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
            scrollIntoViewOnMobile(searchInputRef.current);
        }
    }, [isOpen]);

    // Scroll custom input into view on mobile when it appears
    useEffect(() => {
        if (customMode && customInputRef.current) {
            customInputRef.current.focus();
            scrollIntoViewOnMobile(customInputRef.current);
        }
    }, [customMode]);

    const filteredPlatforms = useMemo(() => {
        if (!search.trim()) return platforms;
        const q = search.toLowerCase();
        return platforms.filter(
            (p) =>
                p.name.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q)
        );
    }, [search, platforms]);

    const categories = useMemo(() => {
        if (search.trim()) return ["Results"];
        return getCategories(platforms);
    }, [search, platforms]);

    const platformsByCategory = useMemo(() => {
        const map = new Map<string, Platform[]>();
        if (search.trim()) {
            map.set("Results", filteredPlatforms);
        } else {
            for (const p of filteredPlatforms) {
                const arr = map.get(p.category) || [];
                arr.push(p);
                map.set(p.category, arr);
            }
        }
        return map;
    }, [filteredPlatforms, search]);

    const selectedPlatform = platforms.find(
        (p) => p.name.toLowerCase() === value.toLowerCase()
    );

    const handleSelect = (platform: Platform) => {
        onChange(platform.name);
        setIsOpen(false);
        setSearch("");
        setCustomMode(false);
    };

    const handleCustomSubmit = () => {
        if (customName.trim()) {
            onChange(customName.trim());
            setIsOpen(false);
            setSearch("");
            setCustomMode(false);
            setCustomName("");
        }
    };

    const handleImgError = (id: string) => {
        setImgErrors((prev) => new Set(prev).add(id));
    };

    const isExisting = (name: string) =>
        existingPlatforms.some((ep) => ep.toLowerCase() === name.toLowerCase());

    if (disabled && value) {
        return (
            <div className="platform-picker-display">
                {selectedPlatform && selectedPlatform.logoUrl && !imgErrors.has(selectedPlatform.id) ? (
                    <img
                        src={selectedPlatform.logoUrl}
                        alt={selectedPlatform.name}
                        className="platform-picker-logo"
                        onError={() => handleImgError(selectedPlatform.id)}
                    />
                ) : (
                    <div
                        className="platform-picker-initial"
                        style={{ backgroundColor: selectedPlatform?.color || "#6366f1" }}
                    >
                        {value.charAt(0).toUpperCase()}
                    </div>
                )}
                <span className="platform-picker-name">{value}</span>
            </div>
        );
    }

    return (
        <div className="platform-picker" ref={pickerRef}>
            {/* Trigger / Search area */}
            <div
                className={`platform-picker-trigger ${value && !isOpen ? "has-value" : ""} ${isOpen ? "is-open" : ""}`}
                onClick={() => {
                    if (!isOpen) {
                        setIsOpen(true);
                        setSearch("");
                    }
                }}
            >
                {isOpen ? (
                    <div className="platform-picker-search-inline">
                        <FiSearch size={16} className="picker-search-icon" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search platforms…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onFocus={(e) => scrollIntoViewOnMobile(e.currentTarget)}
                        />
                        {search && (
                            <button
                                type="button"
                                className="picker-search-clear"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSearch("");
                                    searchInputRef.current?.focus();
                                }}
                            >
                                <FiX size={14} />
                            </button>
                        )}
                    </div>
                ) : value ? (
                    <>
                        {selectedPlatform && selectedPlatform.logoUrl && !imgErrors.has(selectedPlatform.id) ? (
                            <img
                                src={selectedPlatform.logoUrl}
                                alt={selectedPlatform.name}
                                className="platform-picker-logo"
                                onError={() => handleImgError(selectedPlatform.id)}
                            />
                        ) : (
                            <div
                                className="platform-picker-initial"
                                style={{ backgroundColor: selectedPlatform?.color || "#6366f1" }}
                            >
                                {value.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span>{value}</span>
                    </>
                ) : (
                    <div className="platform-picker-search-inline">
                        <FiSearch size={16} className="picker-search-icon" />
                        <span className="placeholder-text">Search platforms…</span>
                    </div>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="platform-picker-dropdown">

                    {/* Platform list */}
                    <div className="platform-picker-grid">
                        {categories.map((cat) => {
                            const catPlatforms = platformsByCategory.get(cat) || [];
                            if (catPlatforms.length === 0) return null;
                            return (
                                <div key={cat} className="platform-category">
                                    <span className="platform-category-label">{cat}</span>
                                    <div className="platform-list">
                                        {catPlatforms.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                className={`platform-list-item ${value.toLowerCase() === p.name.toLowerCase() ? "selected" : ""}`}
                                                onClick={() => handleSelect(p)}
                                            >
                                                {/* Icon */}
                                                {p.logoUrl && !imgErrors.has(p.id) ? (
                                                    <img
                                                        src={p.logoUrl}
                                                        alt={p.name}
                                                        className="platform-list-logo"
                                                        onError={() => handleImgError(p.id)}
                                                    />
                                                ) : (
                                                    <div
                                                        className="platform-list-fallback"
                                                        style={{ backgroundColor: p.color }}
                                                    >
                                                        {p.name.charAt(0)}
                                                    </div>
                                                )}

                                                {/* Name */}
                                                <span className="platform-list-name">{p.name}</span>

                                                {/* Already-added badge */}
                                                {isExisting(p.name) && (
                                                    <span className="platform-list-badge">
                                                        <FiCheck size={10} />
                                                        Added
                                                    </span>
                                                )}

                                                {/* Selected checkmark on right */}
                                                {value.toLowerCase() === p.name.toLowerCase() && (
                                                    <span className="platform-list-selected-icon">
                                                        <FiCheck size={13} />
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {filteredPlatforms.length === 0 && (
                            <div className="platform-picker-empty">
                                No platforms found for "{search}"
                            </div>
                        )}
                    </div>

                    {/* Custom platform option */}
                    <div className="platform-picker-custom">
                        {!customMode ? (
                            <button
                                type="button"
                                className="platform-custom-btn"
                                onClick={() => setCustomMode(true)}
                            >
                                <FiPlus size={14} />
                                <span>Add custom platform</span>
                            </button>
                        ) : (
                            <div className="platform-custom-input">
                                <input
                                    ref={customInputRef}
                                    type="text"
                                    placeholder="Enter platform name…"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    onFocus={(e) => scrollIntoViewOnMobile(e.currentTarget)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleCustomSubmit();
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className="platform-custom-submit"
                                    onClick={handleCustomSubmit}
                                    disabled={!customName.trim()}
                                >
                                    Add
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
