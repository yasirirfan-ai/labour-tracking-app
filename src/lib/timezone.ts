/**
 * Timezone utility — all app dates/times are in PST (UTC-8).
 * Supabase stores timestamps as UTC; we convert to/from PST here.
 */

const PST_OFFSET_HOURS = -8; // PST = UTC-8 (fixed, not DST-adjusted per user requirement)
const PST_OFFSET_MS = PST_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Returns today's date string in PST as "YYYY-MM-DD".
 */
export function todayPST(): string {
    const nowUTC = Date.now();
    const nowPST = new Date(nowUTC + PST_OFFSET_MS);
    const y = nowPST.getUTCFullYear();
    const m = String(nowPST.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowPST.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Given a "YYYY-MM-DD" date string (interpreted as PST),
 * returns the UTC ISO string for the START of that PST day (00:00:00 PST).
 * Example: "2026-07-15" → "2026-07-15T08:00:00.000Z"
 */
export function pstDayStart(dateStr: string): string {
    // midnight PST = 08:00 UTC (PST is UTC-8, so UTC = PST + 8)
    return `${dateStr}T${String(8 - PST_OFFSET_HOURS - 8).padStart(2,'0')}:00:00.000Z`;
}

/**
 * Given a "YYYY-MM-DD" date string (interpreted as PST),
 * returns the UTC ISO string for the END of that PST day (23:59:59.999 PST).
 * Example: "2026-07-15" → "2026-07-16T07:59:59.999Z"
 */
export function pstDayEnd(dateStr: string): string {
    // 23:59:59 PST = next day 07:59:59 UTC
    const [y, m, d] = dateStr.split('-').map(Number);
    // nextDay midnight UTC = end of PST day = nextDay 00:00 UTC minus 1ms... 
    // Actually: 23:59:59.999 PST = (next day) 07:59:59.999 UTC
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - PST_OFFSET_MS);
    return end.toISOString();
}

/**
 * Formats a UTC ISO timestamp string into a human-readable PST time string.
 * Example: "2026-07-15T15:30:00Z" → "7:30 AM"
 */
export function formatTimePST(isoString: string): string {
    const date = new Date(new Date(isoString).getTime() + PST_OFFSET_MS);
    let hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

/**
 * Formats a UTC ISO timestamp string into a human-readable PST date+time string.
 * Example: "2026-07-15T15:30:00Z" → "Jul 15, 2026 7:30 AM"
 */
export function formatDateTimePST(isoString: string): string {
    const date = new Date(new Date(isoString).getTime() + PST_OFFSET_MS);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[date.getUTCMonth()];
    const d = date.getUTCDate();
    const y = date.getUTCFullYear();
    let hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${mon} ${d}, ${y} ${hours}:${minutes} ${ampm}`;
}
