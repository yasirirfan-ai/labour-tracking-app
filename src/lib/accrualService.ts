import { supabase } from './supabase';
import type { User } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PTO_TIERS = [
    { minMonths: 0, maxMonths: 12, rate: 0.8335, annualMax: 20, carryover: 20 },
    { minMonths: 12, maxMonths: 24, rate: 1.3335, annualMax: 32, carryover: 32 },
    { minMonths: 24, maxMonths: Infinity, rate: 2.0, annualMax: 48, carryover: 48 },
];

/** Sick leave: 1 hour per every 30 hours worked (108 000 seconds). */
const SICK_SECONDS_PER_HOUR = 30 * 3600; // 108 000 s

/** Hard cap on sick leave balance (CA-style). */
const SICK_BALANCE_CAP_HOURS = 40;

/** Usage waiting period for Sick leave (days after hire). */
const SICK_USAGE_WAITING_DAYS = 90;

/**
 * Calculate the number of complete months between hireDate and a reference date.
 */
export function getTenureMonths(hireDate: string, referenceDate: Date = new Date()): number {
    const hire = new Date(hireDate);
    const ref = referenceDate;

    let months = (ref.getFullYear() - hire.getFullYear()) * 12;
    months += ref.getMonth() - hire.getMonth();

    if (ref.getDate() < hire.getDate()) months--;

    return Math.max(0, months);
}

/**
 * Gets the current tier based on tenure months.
 */
export function getPtoTier(tenureMonths: number) {
    for (const tier of PTO_TIERS) {
        if (tenureMonths >= tier.minMonths && tenureMonths < tier.maxMonths) {
            return tier;
        }
    }
    return PTO_TIERS[PTO_TIERS.length - 1];
}

/**
 * Returns the PTO accrual rate.
 */
export function getPtoRate(tenureMonths: number): number {
    return getPtoTier(tenureMonths).rate;
}

/**
 * Returns a human-readable tier label.
 */
export function getPtoTierLabel(tenureMonths: number, paySchedule: string): string {
    const tier = getPtoTier(tenureMonths);
    const period = (paySchedule || '').toLowerCase().includes('semi') ? '15 days' : '30 days';
    if (tenureMonths < 12) return `Tier 1 (0–12 months) · ${tier.rate} hrs / ${period}`;
    if (tenureMonths < 24) return `Tier 2 (12–24 months) · ${tier.rate} hrs / ${period}`;
    if (tenureMonths < 36) return `Tier 3 (24–36 months) · ${tier.rate} hrs / ${period}`;
    return `Tier 4 (36+ months) · ${tier.rate} hrs / ${period}`;
}

export function isSickLeaveUsable(hireDate: string): boolean {
    const hire = new Date(hireDate);
    const eligible = new Date(hire.getTime() + SICK_USAGE_WAITING_DAYS * 86_400_000);
    return new Date() >= eligible;
}

export function getSickLeaveEligibleDate(hireDate: string): Date {
    const hire = new Date(hireDate);
    return new Date(hire.getTime() + SICK_USAGE_WAITING_DAYS * 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ACCRUAL CALCULATION (PURE – NO SIDE EFFECTS)
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEvent {
    type: 'pto' | 'sick';
    earned_hours: number;
    entry_date: string;
    description: string;
    balance: number;
}

interface AccrualResult {
    newPtoBalance: number;
    newSickBalance: number;
    newLastPtoAccrual: string;
    newProcessedSickSeconds: number;
    ptoEarned: number;
    sickEarned: number;
    historyEvents: HistoryEvent[];
}

export function calculateAccruals(user: User, totalWorkedSeconds: number): AccrualResult {
    const now = new Date();
    const nowIso = now.toISOString();

    const hireDate = user.hire_date || nowIso;
    const currentPtoBalance = parseFloat(user.pto_balance || '0');

    // lastAccrual is the point in time we last successfully processed an accrual event
    const lastAccrualDate = user.last_pto_accrual
        ? new Date(user.last_pto_accrual)
        : new Date(hireDate);

    const isSemiMonthly = (user.pay_schedule || '').toLowerCase().includes('semi');

    console.log(`[Accrual Debug] User: ${user.name}, Schedule: ${user.pay_schedule}, isSemi: ${isSemiMonthly}`);
    console.log(`[Accrual Debug] Last Accrual: ${user.last_pto_accrual || 'None (using hire)'}`);

    let ptoEarned = 0;
    let newPtoBalance = currentPtoBalance;
    let newLastPtoAccrual = user.last_pto_accrual || hireDate;
    const historyEvents: HistoryEvent[] = [];

    // We iterate day-by-day from lastAccrual to today to find all "trigger dates" (1st and 16th)
    const runner = new Date(lastAccrualDate);
    runner.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let periodsElapsed = 0;
    const maxSafety = 365 * 10; // 10 years safety break
    let safety = 0;

    while (runner < today && safety < maxSafety) {
        safety++;
        runner.setDate(runner.getDate() + 1);
        
        const dayOfMonth = runner.getDate();
        let isTriggerDate = false;

        if (isSemiMonthly) {
            // Semi-monthly: 1st and 16th
            if (dayOfMonth === 1 || dayOfMonth === 16) isTriggerDate = true;
        } else {
            // Monthly: 1st only
            if (dayOfMonth === 1) isTriggerDate = true;
        }

        if (isTriggerDate) {
            periodsElapsed++;
            const tenureMonths = getTenureMonths(hireDate, runner);
            const tier = getPtoTier(tenureMonths);

            // Check annual cap
            let earnedThisPeriod = 0;
            if (newPtoBalance < tier.annualMax) {
                const availableSpace = tier.annualMax - newPtoBalance;
                earnedThisPeriod = Math.min(tier.rate, availableSpace);
                ptoEarned += earnedThisPeriod;
                newPtoBalance += earnedThisPeriod;
            }

            // Always record the period passage in history if something was earned or if requested (per-period transparency)
            // Round for storage
            const roundedEarned = Math.round(earnedThisPeriod * 100) / 100;
            const roundedBalance = Math.round(newPtoBalance * 100) / 100;

            if (roundedEarned > 0) {
                // Calculate period dates for the description
                const periodEnd = new Date(runner);
                periodEnd.setDate(periodEnd.getDate() - 1); // If triggered on 16th, period ends on 15th. If on 1st, ends on last day of prev month.
                
                const periodStart = new Date(periodEnd);
                if (isSemiMonthly) {
                    if (periodEnd.getDate() === 15) {
                        periodStart.setDate(1);
                    } else {
                        periodStart.setDate(16);
                    }
                } else {
                    periodStart.setDate(1);
                }

                const formatDate = (d: Date) => {
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const year = d.getFullYear();
                    return `${month}/${day}/${year}`;
                };

                const description = `Accrual for ${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

                historyEvents.push({
                    type: 'pto',
                    earned_hours: roundedEarned,
                    entry_date: runner.toISOString().split('T')[0],
                    description: description,
                    balance: roundedBalance
                });
            }

            // Update last accrual to the timestamp of this trigger
            newLastPtoAccrual = runner.toISOString();
        }
    }

    console.log(`[Accrual Debug] Periods Elapsed: ${periodsElapsed}, PTO Earned Total: ${ptoEarned.toFixed(4)}`);

    newPtoBalance = Math.round(newPtoBalance * 100) / 100;

    // ── SICK ─────────────────────────────────────────────────────────────────
    let sickEarned = 0;
    let newSickBalance = parseFloat(user.sick_balance || '0');
    let newProcessedSickSeconds = user.processed_sick_seconds || 0;

    // Sick leave only accrues for semi-monthly workers
    if (isSemiMonthly) {
        const alreadyProcessed = user.processed_sick_seconds || 0;
        const newWorkedSeconds = Math.max(0, totalWorkedSeconds - alreadyProcessed);
        const sickHoursToAdd = Math.floor(newWorkedSeconds / SICK_SECONDS_PER_HOUR);

        newSickBalance = newSickBalance + sickHoursToAdd;
        if (newSickBalance > SICK_BALANCE_CAP_HOURS) newSickBalance = SICK_BALANCE_CAP_HOURS;
        newSickBalance = Math.round(newSickBalance * 100) / 100;

        newProcessedSickSeconds = alreadyProcessed + (sickHoursToAdd * SICK_SECONDS_PER_HOUR);
        sickEarned = sickHoursToAdd;

        if (sickEarned > 0) {
            historyEvents.push({
                type: 'sick',
                earned_hours: sickEarned,
                entry_date: now.toISOString().split('T')[0],
                description: `Sick leave accrual — 1 hr per 30 hrs worked`,
                balance: newSickBalance
            });
        }
    }

    return {
        newPtoBalance,
        newSickBalance,
        newLastPtoAccrual,
        newProcessedSickSeconds,
        ptoEarned,
        sickEarned,
        historyEvents,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SYNC TO SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLeaveBalances(user: User): Promise<{ pto: number; sick: number; ptoEarned: number; sickEarned: number; error?: string }> {
    try {
        // 1. Refetch the LATEST user state from the database
        // This is critical to prevent race conditions where two components sync at once
        const { data: latestUserData, error: userError } = await (supabase as any)
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userError || !latestUserData) throw userError || new Error('User not found');
        const latestUser = latestUserData as User;

        const { data: totalHoursData, error: logsError } = await supabase
            .from('time_logs')
            .select('hours_worked')
            .eq('user_id', latestUser.id);

        if (logsError) throw logsError;

        const totalWorkedSeconds = (totalHoursData as any[] || []).reduce(
            (acc, log) => acc + (parseFloat(log.hours_worked || '0') * 3600),
            0
        );

        const result = calculateAccruals(latestUser, totalWorkedSeconds);
        const hasPtoPeriodPassed = result.newLastPtoAccrual !== latestUser.last_pto_accrual;
        const hasChange = result.ptoEarned > 0 || result.sickEarned > 0 || hasPtoPeriodPassed;

        if (hasChange) {
            // 2. FETCH EXISTING HISTORY TO PREVENT DUPLICATES
            // We check if an accrual for the same type exists on the trigger date
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: existingHistory } = await (supabase as any)
                .from('leave_history')
                .select('description, entry_date, type')
                .eq('user_id', latestUser.id)
                .gte('created_at', todayStr + 'T00:00:00'); // Check entries created today

            const existingEntries = new Set(existingHistory?.map((h: any) => `${h.type}_${h.entry_date}`) || []);

            const updatePayload: Partial<User> = {
                pto_balance: String(result.newPtoBalance),
                sick_balance: String(result.newSickBalance),
                last_pto_accrual: result.newLastPtoAccrual,
                processed_sick_seconds: result.newProcessedSickSeconds,
            };

            // 3. Perform Atomic Update (Compare-and-Swap)
            let updateQuery = (supabase as any)
                .from('users')
                .update(updatePayload, { count: 'exact' })
                .eq('id', latestUser.id);

            if (latestUser.last_pto_accrual) {
                updateQuery = updateQuery.eq('last_pto_accrual', latestUser.last_pto_accrual);
            } else {
                updateQuery = updateQuery.is('last_pto_accrual', null);
            }

            const { error: updateError, count } = await updateQuery;

            if (updateError) throw updateError;

            // 4. Only insert history if the balance update was successful (affected 1 row)
            if (count === 0) {
                console.warn(`[accrualService] Race condition detected. Accrual already processed.`);
                return {
                    pto: parseFloat(latestUser.pto_balance || '0'),
                    sick: parseFloat(latestUser.sick_balance || '0'),
                    ptoEarned: 0,
                    sickEarned: 0
                };
            }

            // Filter out events that already exist for this date/type (extra safety)
            const historyRows: any[] = result.historyEvents
                .filter(ev => !existingEntries.has(`${ev.type}_${ev.entry_date}`))
                .map(ev => ({
                    user_id: latestUser.id,
                    ...ev,
                    used_hours: null,
                }));

            // Special case: Add "eligible to begin accruing" row if balance was 0 and now increased
            const prevPto = parseFloat(latestUser.pto_balance || '0');
            if (prevPto === 0 && result.ptoEarned > 0 && historyRows.length > 0) {
                const eligibilityCheck = `eligible_${latestUser.hire_date || todayStr}`;
                if (!existingEntries.has(eligibilityCheck)) {
                    const today = new Date().toISOString().split('T')[0];
                    historyRows.unshift({
                        user_id: latestUser.id,
                        type: 'pto',
                        entry_date: latestUser.hire_date || today,
                        description: `${(latestUser.first_name || latestUser.name.split(' ')[0])} is now eligible to begin accruing time`,
                        used_hours: null,
                        earned_hours: null,
                        balance: 0,
                    });
                }
            }

            if (historyRows.length > 0) {
                await (supabase as any)
                    .from('leave_history')
                    .insert(historyRows);
            }
        }

        return {
            pto: result.newPtoBalance,
            sick: result.newSickBalance,
            ptoEarned: result.ptoEarned,
            sickEarned: result.sickEarned,
        };
    } catch (err: any) {
        console.error('[accrualService] Error syncing balances:', err);
        return { pto: 0, sick: 0, ptoEarned: 0, sickEarned: 0, error: err.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY FETCH
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveHistoryRow {
    id: string;
    type: 'pto' | 'sick';
    entry_date: string;
    description: string;
    used_hours: number | null;
    earned_hours: number | null;
    balance: number;
    created_at: string;
}

export async function fetchLeaveHistory(userId: string, type?: 'pto' | 'sick'): Promise<LeaveHistoryRow[]> {
    try {
        let query = (supabase as any)
            .from('leave_history')
            .select('*')
            .eq('user_id', userId)
            .order('entry_date', { ascending: true })
            .order('created_at', { ascending: true });

        if (type) query = query.eq('type', type);

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as LeaveHistoryRow[];
    } catch (err) {
        console.error('[accrualService] fetchLeaveHistory error:', err);
        return [];
    }
}

