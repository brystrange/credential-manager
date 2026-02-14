export interface Platform {
    id: string;
    name: string;
    domain: string;
    color: string;
    category: string;
}

export const PLATFORMS: Platform[] = [
    // PH - E-Wallets & Finance
    { id: "gcash", name: "GCash", domain: "gcash.com", color: "#007dfe", category: "Finance (PH)" },
    { id: "maya", name: "Maya", domain: "maya.ph", color: "#000000", category: "Finance (PH)" },
    { id: "bdo", name: "BDO", domain: "bdo.com.ph", color: "#003399", category: "Finance (PH)" },
    { id: "bpi", name: "BPI", domain: "bpi.com.ph", color: "#b10e1e", category: "Finance (PH)" },
    { id: "metrobank", name: "Metrobank", domain: "metrobank.com.ph", color: "#00326e", category: "Finance (PH)" },
    { id: "unionbank", name: "UnionBank", domain: "unionbankph.com", color: "#f8971d", category: "Finance (PH)" },
    { id: "landbank", name: "Landbank", domain: "landbank.com", color: "#007629", category: "Finance (PH)" },
    { id: "securitybank", name: "Security Bank", domain: "securitybank.com", color: "#004990", category: "Finance (PH)" },
    { id: "coinsph", name: "Coins.ph", domain: "coins.ph", color: "#1e5396", category: "Finance (PH)" },

    // PH - Services & Apps
    { id: "grab", name: "Grab", domain: "grab.com", color: "#00b14f", category: "Services (PH)" },
    { id: "foodpanda", name: "Foodpanda", domain: "foodpanda.ph", color: "#d70f64", category: "Services (PH)" },
    { id: "angkas", name: "Angkas", domain: "angkas.com", color: "#009cde", category: "Services (PH)" },
    { id: "joyride", name: "JoyRide", domain: "joyride.com.ph", color: "#ff8c00", category: "Services (PH)" },
    { id: "lazada-ph", name: "Lazada", domain: "lazada.com.ph", color: "#0f146d", category: "Shopping" },
    { id: "shopee-ph", name: "Shopee", domain: "shopee.ph", color: "#ee4d2d", category: "Shopping" },
    { id: "zalora", name: "Zalora", domain: "zalora.com.ph", color: "#000000", category: "Shopping" },
    { id: "carousell", name: "Carousell", domain: "carousell.ph", color: "#d2232a", category: "Shopping" },

    // PH - Telco & Utilities
    { id: "globe", name: "Globe", domain: "globe.com.ph", color: "#005596", category: "Telco (PH)" },
    { id: "smart", name: "Smart", domain: "smart.com.ph", color: "#44bd32", category: "Telco (PH)" },
    { id: "pldt", name: "PLDT", domain: "pldt.com.ph", color: "#df0000", category: "Telco (PH)" },
    { id: "meralco", name: "Meralco", domain: "meralco.com.ph", color: "#f37021", category: "Utilities (PH)" },
    { id: "converge", name: "Converge", domain: "convergeict.com", color: "#f05a28", category: "Utilities (PH)" },

    // PH - Gov
    { id: "sss", name: "SSS", domain: "sss.gov.ph", color: "#00539f", category: "Gov (PH)" },
    { id: "philhealth", name: "PhilHealth", domain: "philhealth.gov.ph", color: "#fcd116", category: "Gov (PH)" },
    { id: "pagibig", name: "Pag-IBIG", domain: "pagibigfund.gov.ph", color: "#0054a6", category: "Gov (PH)" },
    { id: "lto", name: "LTO", domain: "lto.gov.ph", color: "#003399", category: "Gov (PH)" },
    { id: "difa", name: "DFA", domain: "dfa.gov.ph", color: "#003399", category: "Gov (PH)" },

    // Social Media (Global)
    { id: "google", name: "Google", domain: "google.com", color: "#4285F4", category: "Email & Productivity" },
    { id: "facebook", name: "Facebook", domain: "facebook.com", color: "#1877F2", category: "Social" },
    { id: "instagram", name: "Instagram", domain: "instagram.com", color: "#E4405F", category: "Social" },
    { id: "x-twitter", name: "X (Twitter)", domain: "x.com", color: "#000000", category: "Social" },
    { id: "tiktok", name: "TikTok", domain: "tiktok.com", color: "#010101", category: "Social" },
    { id: "linkedin", name: "LinkedIn", domain: "linkedin.com", color: "#0A66C2", category: "Social" },
    { id: "snapchat", name: "Snapchat", domain: "snapchat.com", color: "#FFFC00", category: "Social" },
    { id: "reddit", name: "Reddit", domain: "reddit.com", color: "#FF4500", category: "Social" },
    { id: "pinterest", name: "Pinterest", domain: "pinterest.com", color: "#E60023", category: "Social" },
    { id: "discord", name: "Discord", domain: "discord.com", color: "#5865F2", category: "Social" },
    { id: "whatsapp", name: "WhatsApp", domain: "whatsapp.com", color: "#25D366", category: "Social" },
    { id: "telegram", name: "Telegram", domain: "telegram.org", color: "#26A5E4", category: "Social" },
    { id: "viber", name: "Viber", domain: "viber.com", color: "#7360f2", category: "Social" },

    // Email & Productivity
    { id: "microsoft", name: "Microsoft", domain: "microsoft.com", color: "#00A4EF", category: "Email & Productivity" },
    { id: "outlook", name: "Outlook", domain: "outlook.com", color: "#0078D4", category: "Email & Productivity" },
    { id: "yahoo", name: "Yahoo", domain: "yahoo.com", color: "#6001D2", category: "Email & Productivity" },
    { id: "apple", name: "Apple", domain: "apple.com", color: "#A2AAAD", category: "Email & Productivity" },
    { id: "slack", name: "Slack", domain: "slack.com", color: "#4A154B", category: "Email & Productivity" },
    { id: "zoom", name: "Zoom", domain: "zoom.us", color: "#2D8CFF", category: "Email & Productivity" },

    // Entertainment
    { id: "netflix", name: "Netflix", domain: "netflix.com", color: "#E50914", category: "Entertainment" },
    { id: "spotify", name: "Spotify", domain: "spotify.com", color: "#1DB954", category: "Entertainment" },
    { id: "youtube", name: "YouTube", domain: "youtube.com", color: "#FF0000", category: "Entertainment" },
    { id: "twitch", name: "Twitch", domain: "twitch.tv", color: "#9146FF", category: "Entertainment" },
    { id: "steam", name: "Steam", domain: "store.steampowered.com", color: "#1B2838", category: "Entertainment" },
    { id: "playstation", name: "PlayStation", domain: "playstation.com", color: "#003791", category: "Entertainment" },

    // Shopping & Finance (Global)
    { id: "amazon", name: "Amazon", domain: "amazon.com", color: "#FF9900", category: "Shopping" },
    { id: "ebay", name: "eBay", domain: "ebay.com", color: "#E53238", category: "Shopping" },
    { id: "paypal", name: "PayPal", domain: "paypal.com", color: "#003087", category: "Finance" },
    { id: "stripe", name: "Stripe", domain: "stripe.com", color: "#635BFF", category: "Finance" },
    { id: "wise", name: "Wise", domain: "wise.com", color: "#9FE870", category: "Finance" },
    { id: "binance", name: "Binance", domain: "binance.com", color: "#F0B90B", category: "Finance" },

    // Dev & Tech
    { id: "github", name: "GitHub", domain: "github.com", color: "#181717", category: "Dev & Tech" },
    { id: "gitlab", name: "GitLab", domain: "gitlab.com", color: "#FC6D26", category: "Dev & Tech" },
    { id: "digitalocean", name: "DigitalOcean", domain: "digitalocean.com", color: "#0080FF", category: "Dev & Tech" },
    { id: "aws", name: "AWS", domain: "aws.amazon.com", color: "#FF9900", category: "Dev & Tech" },
    { id: "openai", name: "OpenAI", domain: "openai.com", color: "#412991", category: "Dev & Tech" },

    // Other
    { id: "dropbox", name: "Dropbox", domain: "dropbox.com", color: "#0061FF", category: "Other" },
    { id: "adobe", name: "Adobe", domain: "adobe.com", color: "#FF0000", category: "Other" },
    { id: "canva", name: "Canva", domain: "canva.com", color: "#00C4CC", category: "Other" },
];

/** Get logo URL for a platform via Clearbit */
export function getPlatformLogoUrl(domain: string): string {
    return `https://logo.clearbit.com/${domain}`;
}

/** Find a known platform by name (case-insensitive) */
export function findPlatformByName(name: string): Platform | undefined {
    return PLATFORMS.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
    );
}

/** Get unique categories in display order */
export function getCategories(): string[] {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const p of PLATFORMS) {
        if (!seen.has(p.category)) {
            seen.add(p.category);
            cats.push(p.category);
        }
    }
    return cats;
}
