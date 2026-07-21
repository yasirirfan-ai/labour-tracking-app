// Detects when a new build has been deployed while this tab is still running an older one.
//
// A tab that was opened before a deploy keeps running the JS it loaded at open time — it has no
// way to know a new version exists — so a stale tab left open anywhere (a worker's kiosk, an
// admin's browser) can silently keep behaving like the old build for as long as it stays open,
// even though the server is already serving the fixed code to any fresh page load. (This is also
// why the 8h40m/8h45m overtime check now runs only server-side, via api/check-shift-overtimes.js
// on a fixed cron schedule, rather than from any client tab — see that file for the full story.)
//
// Detection method: Vite content-hashes the JS bundle filename on every build, so the <script>
// src in index.html changes whenever the deployed code changes. We record the src this tab
// actually loaded, then periodically re-fetch index.html (bypassing cache) and compare.

const getBundleSrcFromHtml = (html: string): string | null => {
    const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
    return match?.[1] || null;
};

const getCurrentBundleSrc = (): string | null => {
    const script = document.querySelector('script[type="module"][src*="/assets/"]');
    return script?.getAttribute('src') || null;
};

// Returns a cleanup function to clear the polling interval.
export const startVersionCheck = (onNewVersionDetected: () => void, intervalMs = 2 * 60 * 1000): (() => void) => {
    const loadedBundleSrc = getCurrentBundleSrc();
    if (!loadedBundleSrc) return () => {}; // couldn't determine what's loaded — nothing to compare against

    let alreadyNotified = false;

    const check = async () => {
        if (alreadyNotified) return;
        try {
            const res = await fetch('/index.html', { cache: 'no-store' });
            if (!res.ok) return;
            const html = await res.text();
            const latestBundleSrc = getBundleSrcFromHtml(html);
            if (latestBundleSrc && latestBundleSrc !== loadedBundleSrc) {
                alreadyNotified = true;
                onNewVersionDetected();
            }
        } catch {
            // Network hiccup or offline — just try again next interval, don't nag about it.
        }
    };

    const interval = setInterval(check, intervalMs);
    return () => clearInterval(interval);
};
