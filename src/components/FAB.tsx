import { FiPlus } from "react-icons/fi";

interface FABProps {
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}

export default function FAB({ onClick, disabled = false, title = "Add Credential" }: FABProps) {
    return (
        <button
            className={`fab${disabled ? " fab-disabled" : ""}`}
            onClick={disabled ? undefined : onClick}
            title={title}
            aria-label={title}
            aria-disabled={disabled}
            id="fab-add-credential"
        >
            <FiPlus size={28} />
        </button>
    );
}
