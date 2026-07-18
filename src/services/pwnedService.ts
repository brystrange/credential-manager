/**
 * Service to check passwords against the HaveIBeenPwned database using k-Anonymity.
 * This guarantees the server never sees the full password or its full hash.
 */

export async function checkPwnedPassword(password: string): Promise<number> {
    if (!password) return 0;

    // 1. Hash the password using SHA-1
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    
    // Convert buffer to uppercase hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    // 2. Split into prefix (first 5 chars) and suffix (the rest)
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    try {
        // 3. Query the k-Anonymity API
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        
        if (!response.ok) {
            console.warn("HaveIBeenPwned API returned an error:", response.statusText);
            return 0; // Fail open if the API is down
        }

        const text = await response.text();
        
        // 4. Parse the results and look for our suffix
        const lines = text.split("\n");
        for (const line of lines) {
            const [hashSuffix, countStr] = line.trim().split(":");
            if (hashSuffix === suffix) {
                return parseInt(countStr, 10);
            }
        }
        
        return 0; // Not found in breaches
    } catch (error) {
        console.error("Error checking password against HaveIBeenPwned:", error);
        return 0; // Fail open on network errors
    }
}
