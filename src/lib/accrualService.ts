import { supabase } from './supabase';
import type { User } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** PTO is paid out twice a month (24 periods/year). */
const SEMI_MONTHLY_PERIOD_DAYS = 15;

/** PTO accrual rates per pay-period (hours), keyed by tenure tier. */
const PTO_TIERS = [
    { minMonths: 0,  maxMonths: 25, rate: 1.67 }, // Tier 1: 0–2 years (inclusive of anniversary)
    { minMonths: 25, maxMonths: Infinity, rate: 4.00 }, // Tier 2: After 2 years
];

console.log("ACCRUAL_ENGINE_V2.5_ACTIVE: Policy = 1.67 for first 2 years.");

/** Sick leave: 1 hour per every 30 hours worked (108 000 seconds). */
const SICK_SECONDS_PER_HOUR = 30 * 3600; // 108 000 s

/** Hard cap on sick leave balance (CA-style). */
const SICK_BALANCE_CAP_HOURS = 48;

/** Usage waiting period for Sick leave (days after hire). */
const SICK_USAGE_WAITING_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the number of complete months between hireDate and a reference date (defaults to now).
 */
export function getTenureMonths(hireDate: string, referenceDate: Date = new Date()): number {
    const hire = new Date(hireDate);
    const ref  = referenceDate;

    let months = (ref.getFullYear() - hire.getFullYear()) * 12;
    months    += ref.getMonth() - hire.getMonth();

    // If we haven't yet reached the anniversary day of the ref month, subtract 1.
    if (ref.getDate() < hire.getDate()) months--;

    return Math.max(0, months);
}

// ... existing getPtoRate and getPtoTierLabel functions remain the same ...

/**
 * Returns the PTO accrual rate (hrs/pay-period) for the given tenure in months.
 */
export function getPtoRate(tenureMonths: number): number {
    for (const tier of PTO_TIERS) {
        if (tenureMonths >= tier.minMonths && tenureMonths < tier.maxMonths) {
            return tier.rate;
        }
    }
    return PTO_TIERS[PTO_TIERS.length - 1].rate;
}

/**
 * Returns a human-readable tier label.
 */
export function getPtoTierLabel(tenureMonths: number): string {
    if (tenureMonths < 24)  return 'Tier 1 (0–24 months) · 1.67 hrs/period';
    return 'Tier 2 (24+ months) · 4.00 hrs/period';
}

/**
 * Returns whether today is past the 90-day waiting period for sick-leave usage.
 */
export function isSickLeaveUsable(hireDate: string): boolean {
    const hire     = new Date(hireDate);
    const eligible = new Date(hire.getTime() + SICK_USAGE_WAITING_DAYS * 86_400_000);
    return new Date() >= eligible;
}

/**
 * Returns the date the sick-leave usage waiting period ends.
 */
export function getSickLeaveEligibleDate(hireDate: string): Date {
    const hire = new Date(hireDate);
    return new Date(hire.getTime() + SICK_USAGE_WAITING_DAYS * 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ACCRUAL CALCULATION (PURE – NO SIDE EFFECTS)
// ─────────────────────────────────────────────────────────────────────────────

interface AccrualResult {
    newPtoBalance:            number;
    newSickBalance:           number;
    newLastPtoAccrual:        string;
    newProcessedSickSeconds:  number;
    ptoEarned:                number;
    sickEarned:               number;
}

/**
 * Calculate the new PTO and Sick balances for a given employee.
 */
export function calculateAccruals(user: User, totalWorkedSeconds: number): AccrualResult {
    const now    = new Date();
    const nowIso = now.toISOString();

    // ── PTO (Tier-Aware Calculation) ─────────────────────────────────────────
    const hireDate         = user.hire_date || nowIso;
    const currentPtoBalance = parseFloat(user.pto_balance || '0');
    
    const lastAccrual = user.last_pto_accrual
        ? new Date(user.last_pto_accrual)
        : new Date(hireDate);

    const daysSinceLastAccrual = (now.getTime() - lastAccrual.getTime()) / 86_400_000;
    const periodsElapsed       = Math.floor(daysSinceLastAccrual / SEMI_MONTHLY_PERIOD_DAYS);
    
    let ptoEarned = 0;
    if (periodsElapsed > 0) {
        // Step through each 15-day period and find the rate CURRENT at that time
        const runner = new Date(lastAccrual);
        for (let i = 0; i < periodsElapsed; i++) {
            runner.setDate(runner.getDate() + SEMI_MONTHLY_PERIOD_DAYS);
            const tenureAtPeriodEnd = getTenureMonths(hireDate, runner);
            ptoEarned += getPtoRate(tenureAtPeriodEnd);
        }
    }

    const newPtoBalance     = Math.round((currentPtoBalance + ptoEarned) * 100) / 100;
    const newLastPtoAccrual = periodsElapsed > 0 ? nowIso : (user.last_pto_accrual || hireDate);

    // ── SICK ─────────────────────────────────────────────────────────────────
    const alreadyProcessed   = user.processed_sick_seconds || 0;
    const newWorkedSeconds   = Math.max(0, totalWorkedSeconds - alreadyProcessed);
    const sickHoursToAdd     = Math.floor(newWorkedSeconds / SICK_SECONDS_PER_HOUR);
    const leftoverSeconds    = newWorkedSeconds % SICK_SECONDS_PER_HOUR;

    const currentSickBalance = parseFloat(user.sick_balance || '0');
    let   newSickBalance     = currentSickBalance + sickHoursToAdd;

    if (newSickBalance > SICK_BALANCE_CAP_HOURS) newSickBalance = SICK_BALANCE_CAP_HOURS;
    newSickBalance = Math.round(newSickBalance * 100) / 100;

    const newProcessedSickSeconds = alreadyProcessed + (sickHoursToAdd * SICK_SECONDS_PER_HOUR);

    return {
        newPtoBalance,
        newSickBalance,
        newLastPtoAccrual,
        newProcessedSickSeconds,
        ptoEarned,
        sickEarned: sickHoursToAdd,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SYNC TO SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the employee's total worked seconds from all tasks, run the accrual
 * calculation, persist the result, write history rows, and return updated numbers.
 */
export async function syncLeaveBalances(user: User): Promise<{
    pto: number;
    sick: number;
    ptoEarned: number;
    sickEarned: number;
    error?: string;
}> {
    try {
        // 1. Sum all active_seconds from tasks for this employee.
        const { data: tasks, error: taskError } = await (supabase
            .from('tasks')
            .select('active_seconds')
            .eq('assigned_to_id', user.id) as any);

        if (taskError) throw taskError;

        const totalWorkedSeconds: number = (tasks || []).reduce(
            (sum: number, t: any) => sum + (t.active_seconds || 0),
            0
        );

        // 2. Run pure calculation.
        const result = calculateAccruals(user, totalWorkedSeconds);

        // 3. Persist only if something actually changed.
        const hasChange = result.ptoEarned > 0 || result.sickEarned > 0;

        if (hasChange) {
            const updatePayload: Partial<User> = {
                pto_balance:            String(result.newPtoBalance),
                sick_balance:           String(result.newSickBalance),
                last_pto_accrual:       result.newLastPtoAccrual,
                processed_sick_seconds: result.newProcessedSickSeconds,
            };

            const { error: updateError } = await (supabase as any)
                .from('users')
                .update(updatePayload)
                .eq('id', user.id);

            if (updateError) throw updateError;

            // 4. Write history rows for each type of accrual earned.
            const historyRows: any[] = [];
            const today = new Date().toISOString().split('T')[0];

            if (result.ptoEarned > 0) {
                const prevPto = parseFloat(user.pto_balance || '0');
                historyRows.push({
                    user_id:      user.id,
                    type:         'pto',
                    entry_date:   today,
                    description:  `PTO accrual — ${getPtoTierLabel(getTenureMonths(user.hire_date || today))}`,
                    used_hours:   null,
                    earned_hours: Math.round(result.ptoEarned * 100) / 100,
                    balance:      result.newPtoBalance,
                });
                // First-time eligibility notice
                if (prevPto === 0 && result.ptoEarned > 0) {
                    historyRows.unshift({
                        user_id:      user.id,
                        type:         'pto',
                        entry_date:   user.hire_date || today,
                        description:  `${(user.first_name || user.name.split(' ')[0])} is now eligible to begin accruing time`,
                        used_hours:   null,
                        earned_hours: null,
                        balance:      0,
                    });
                }
            }

            if (result.sickEarned > 0) {
                historyRows.push({
                    user_id:      user.id,
                    type:         'sick',
                    entry_date:   today,
                    description:  `Sick leave accrual — 1 hr per 30 hrs worked`,
                    used_hours:   null,
                    earned_hours: result.sickEarned,
                    balance:      result.newSickBalance,
                });
            }

            if (historyRows.length > 0) {
                await (supabase as any)
                    .from('leave_history')
                    .insert(historyRows);
            }
        }

        return {
            pto:        result.newPtoBalance,
            sick:       result.newSickBalance,
            ptoEarned:  result.ptoEarned,
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

/**
 * Fetch leave history for a given user, ordered by date ascending.
 */
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

