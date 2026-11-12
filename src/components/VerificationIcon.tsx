import type { CSSProperties } from "react";
import { FiShield } from "react-icons/fi";
import { FaWindows } from "react-icons/fa6";
import { MdFingerprint } from "react-icons/md";
import { TbFaceId } from "react-icons/tb";
import type { VerificationMethod } from "../services/biometricService";

interface VerificationIconProps {
    method: VerificationMethod;
    size?: number;
    style?: CSSProperties;
    className?: string;
}

const ICON_STYLE: CSSProperties = { flexShrink: 0 };

/** Renders the icon matching the active platform verification method. */
export default function VerificationIcon({ method, size = 20, style, className }: VerificationIconProps) {
    const mergedStyle = style ? { ...ICON_STYLE, ...style } : ICON_STYLE;

    switch (method) {
        case "windows":
            return <FaWindows size={size} style={mergedStyle} className={className} />;
        case "ios":
            return <TbFaceId size={size} style={mergedStyle} className={className} />;
        case "mac":
        case "android":
            return <MdFingerprint size={size} style={mergedStyle} className={className} />;
        case "device":
        default:
            return <FiShield size={size} style={mergedStyle} className={className} />;
    }
}

