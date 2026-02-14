import { FiPlus } from "react-icons/fi";

interface FABProps {
    onClick: () => void;
}

export default function FAB({ onClick }: FABProps) {
    return (
        <button className="fab" onClick={onClick} title="Add Credential">
            <FiPlus size={28} />
        </button>
    );
}
