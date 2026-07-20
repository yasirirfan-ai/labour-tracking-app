/**
 * Timezone utility — all app dates/times are in America/Los_Angeles timezone (PST/PDT).
 * Supabase stores timestamps as UTC; we convert to/from local Pacific time here.
 */

/**
 * Returns today's date string in America/Los_Angeles as "YYYY-MM-DD".
 */
export function todayPST(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
}

/**
 * Given a "YYYY-MM-DD" date string (interpreted as Pacific time),
 * returns the UTC ISO string for the START of that day (00:00:00 local time).
 * Correctly accounts for dynamic Daylight Saving Time changes.
 */
export function pstDayStart(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Start with a UTC date representing midnight on that date:
    const utcDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const partVal = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
    
    const tzDate = new Date(Date.UTC(
        partVal('year'),
        partVal('month') - 1,
        partVal('day'),
        partVal('hour') === 24 ? 0 : partVal('hour'),
        partVal('minute'),
        partVal('second')
    ));
    
    const offsetMs = utcDate.getTime() - tzDate.getTime();
    const targetDate = new Date(utcDate.getTime() + offsetMs);
    return targetDate.toISOString();
}

/**
 * Given a "YYYY-MM-DD" date string (interpreted as Pacific time),
 * returns the UTC ISO string for the END of that day (23:59:59.999 local time).
 * Correctly accounts for dynamic Daylight Saving Time changes.
 */
export function pstDayEnd(dateStr: string): string {
    const startIso = pstDayStart(dateStr);
    const startDate = new Date(startIso);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    return endDate.toISOString();
}

/**
 * Formats a UTC ISO timestamp string into a human-readable Pacific time string.
 * Example: "2026-07-15T15:30:00Z" → "8:30 AM" (PDT) / "7:30 AM" (PST)
 */
export function formatTimePST(isoString: string): string {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Formats a UTC ISO timestamp string into a human-readable Pacific date+time string.
 * Example: "2026-07-15T15:30:00Z" → "Jul 15, 2026 8:30 AM" (PDT)
 */
export function formatDateTimePST(isoString: string): string {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Parses a local Pacific date-time string (e.g., "YYYY-MM-DDTHH:MM")
 * into a UTC Date object, correctly accounting for Daylight Saving Time.
 */
export function parsePSTToUTC(localStr: string): Date {
    if (!localStr) return new Date();
    
    const [datePart, timePart] = localStr.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = timePart.split(':').map(Number);
    
    const utcDate = new Date(Date.UTC(y, m - 1, d, h, min, 0));
    
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const partVal = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
    
    const tzDate = new Date(Date.UTC(
        partVal('year'),
        partVal('month') - 1,
        partVal('day'),
        partVal('hour') === 24 ? 0 : partVal('hour'),
        partVal('minute'),
        partVal('second')
    ));
    
    const offsetMs = utcDate.getTime() - tzDate.getTime();
    return new Date(utcDate.getTime() + offsetMs);
}
