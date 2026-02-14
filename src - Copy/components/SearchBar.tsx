import { FiSearch, FiX } from "react-icons/fi";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
    return (
        <div className="search-bar">
            <FiSearch size={18} className="search-icon" />
            <input
                type="text"
                placeholder="Search by platform name…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {value && (
                <button className="search-clear" onClick={() => onChange("")}>
                    <FiX size={16} />
                </button>
            )}
        </div>
    );
}
