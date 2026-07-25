import { useState, useRef, useEffect } from "react";
import { FiChevronDown } from "react-icons/fi";

export interface DropdownOption {
    label: string;
    value: string;
    action?: () => void;
}

interface CustomDropdownProps {
    options: DropdownOption[];
    value?: string;
    onChange?: (val: string) => void;
    label?: string;
}

export default function CustomDropdown({ options, value, onChange, label }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);
    const displayLabel = label || selectedOption?.label || "Select";

    return (
        <div className="custom-dropdown-container" ref={dropdownRef} style={{ position: "relative" }}>
            <button
                className="custom-dropdown-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "transparent",
                    color: "var(--text-primary)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    outline: "none",
                    fontWeight: 500,
                    justifyContent: "flex-start"
                }}
            >
                {displayLabel}
                <FiChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
            </button>
            {isOpen && (
                <div 
                    className="custom-dropdown-menu"
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "8px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        zIndex: 100,
                        minWidth: "100%",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                    {options.map((opt, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                if (opt.action) opt.action();
                                if (onChange && opt.value) onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className="custom-dropdown-item"
                            style={{
                                padding: "6px 16px",
                                background: "transparent",
                                border: "none",
                                color: value === opt.value ? "var(--primary)" : "var(--text-primary)",
                                textAlign: "left",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                fontWeight: value === opt.value ? 600 : 400,
                                transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-card-hover)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
