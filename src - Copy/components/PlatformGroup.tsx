import { useState } from "react";
import type { Credential } from "../services/credentialService";
import { findPlatformByName, getPlatformLogoUrl } from "../data/platformData";
import CredentialCard from "./CredentialCard";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";

interface PlatformGroupProps {
    platformName: string;
    credentials: Credential[];
    onEdit: (credential: Credential) => void;
    onDelete: (credential: Credential) => void;
    onHistory: (credential: Credential) => void;
    defaultExpanded?: boolean;
}

export default function PlatformGroup({
    platformName,
    credentials,
    onEdit,
    onDelete,
    onHistory,
    defaultExpanded = false,
}: PlatformGroupProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [imgError, setImgError] = useState(false);
    const platform = findPlatformByName(platformName);

    const accountCount = credentials.length;

    return (
        <div className={`platform-group ${expanded ? "expanded" : ""}`}>
            <button
                className="platform-group-header"
                onClick={() => setExpanded(!expanded)}
                type="button"
            >
                <div className="platform-group-left">
                    {platform && !imgError ? (
                        <img
                            src={getPlatformLogoUrl(platform.domain)}
                            alt={platform.name}
                            className="platform-group-logo"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div
                            className="platform-group-initial"
                            style={{ backgroundColor: platform?.color || "#6366f1" }}
                        >
                            {platformName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="platform-group-info">
                        <span className="platform-group-name">{platformName}</span>
                        <span className="platform-group-count">
                            {accountCount} {accountCount === 1 ? "account" : "accounts"}
                        </span>
                    </div>
                </div>
                <div className="platform-group-chevron">
                    {expanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                </div>
            </button>

            <div className="platform-group-body">
                <div className="platform-group-cards">
                    {credentials.map((cred) => (
                        <CredentialCard
                            key={cred.id}
                            credential={cred}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onHistory={onHistory}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
