export function isInAppBrowser(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

    // Common in-app browsers
    const inAppBrowsers = [
        "FBAN", // Facebook
        "FBAV", // Facebook
        "Instagram", // Instagram
        "LinkedInApp", // LinkedIn
        "Twitter", // Twitter
        "Snapchat", // Snapchat
        "ByteLocale", // TikTok
        "Line", // Line
    ];

    const containsInAppBrowser = inAppBrowsers.some((browser) => userAgent.includes(browser));
    
    // Some general heuristics for webviews (if not matched specifically above)
    // iOS WKWebView or UIWebView will typically have 'Mobile/' and 'Safari/' but we look for missing Safari
    // Android WebViews often include 'wv'
    const isAndroidWebView = userAgent.includes("wv");
    const isIosWebView = isIOS && !userAgent.includes("Safari");

    return containsInAppBrowser || isAndroidWebView || isIosWebView;
}
