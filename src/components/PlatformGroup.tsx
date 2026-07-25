import { useState, useEffect } from "react";
import type { Credential } from "../services/credentialService";
import type { Platform } from "../services/platformService";
import { findPlatformByName } from "../services/platformService";
import CredentialCard from "./CredentialCard";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";

interface PlatformGroupProps {
    platformName: string;
    credentials: Credential[];
    platforms: Platform[];
    onEdit: (credential: Credential) => void;
    onDelete: (credential: Credential) => void;
    onHistory: (credential: Credential) => void;
    defaultExpanded?: boolean;
    expandSignal?: number;
    collapseSignal?: number;
}

export default function PlatformGroup({
    platformName,
    credentials,
    platforms,
    onEdit,
    onDelete,
    onHistory,
    defaultExpanded = false,
    expandSignal = 0,
    collapseSignal = 0,
}: PlatformGroupProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [imgError, setImgError] = useState(false);
    const platform = findPlatformByName(platforms, platformName);
    
    useEffect(() => {
        if (expandSignal > 0) setExpanded(true);
    }, [expandSignal]);

    useEffect(() => {
        if (collapseSignal > 0) setExpanded(false);
    }, [collapseSignal]);

    const accountCount = credentials.length;

    return (
        <div className={`platform-group ${expanded ? "expanded" : ""}`}>
            <button
                className="platform-group-header"
                onClick={() => setExpanded(!expanded)}
                type="button"
            >
                <div className="platform-group-left">
                    {platform && platform.logoUrl && !imgError ? (
                        <img
                            src={platform.logoUrl}
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
                            platforms={platforms}
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
