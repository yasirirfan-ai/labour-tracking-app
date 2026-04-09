import { supabase } from './supabase';
import type { User, LeaveRequest } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PTO_TIERS = [
    { minMonths: 0,  maxMonths: 12, rate: 0.8335, annualMax: 20, carryover: 20 },
    { minMonths: 12, maxMonths: 24, rate: 1.3335, annualMax: 32, carryover: 32 },
    { minMonths: 24, maxMonths: 36, rate: 2.0,    annualMax: 48, carryover: 48 },
    { minMonths: 36, maxMonths: Infinity, rate: 4.0, annualMax: 48, carryover: 48 },
];

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
 * Calculate the number of complete months between hireDate and a reference date.
 */
export function getTenureMonths(hireDate: string, referenceDate: Date = new Date()): number {
    const hire = new Date(hireDate);
    const ref  = referenceDate;

    let months = (ref.getFullYear() - hire.getFullYear()) * 12;
    months    += ref.getMonth() - hire.getMonth();

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
    const hire     = new Date(hireDate);
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

interface AccrualResult {
    newPtoBalance:            number;
    newSickBalance:           number;
    newLastPtoAccrual:        string;
    newProcessedSickSeconds:  number;
    ptoEarned:                number;
    sickEarned:               number;
}

export function calculateAccruals(user: User, totalWorkedSeconds: number): AccrualResult {
    const now    = new Date();
    const nowIso = now.toISOString();

    const hireDate = user.hire_date || nowIso;
    const currentPtoBalance = parseFloat(user.pto_balance || '0');
    
    const lastAccrual = user.last_pto_accrual
        ? new Date(user.last_pto_accrual)
        : new Date(hireDate);

    const isSemiMonthly = (user.pay_schedule || '').toLowerCase().includes('semi');
    const periodDays = isSemiMonthly ? 15 : 30;

    const daysSinceLastAccrual = (now.getTime() - lastAccrual.getTime()) / 86_400_000;
    const periodsElapsed       = Math.floor(daysSinceLastAccrual / periodDays);
    
    let ptoEarned = 0;
    let newPtoBalance = currentPtoBalance;

    if (periodsElapsed > 0) {
        const runner = new Date(lastAccrual);
        for (let i = 0; i < periodsElapsed; i++) {
            runner.setDate(runner.getDate() + periodDays);
            const tenureAtPeriodEnd = getTenureMonths(hireDate, runner);
            const tier = getPtoTier(tenureAtPeriodEnd);
            
            // Check annual cap
            if (newPtoBalance < tier.annualMax) {
                const availableSpace = tier.annualMax - newPtoBalance;
                const earnedThisPeriod = Math.min(tier.rate, availableSpace);
                ptoEarned += earnedThisPeriod;
                newPtoBalance += earnedThisPeriod;
            }
        }
    }

    newPtoBalance = Math.round(newPtoBalance * 100) / 100;
    const newLastPtoAccrual = periodsElapsed > 0 
        ? new Date(lastAccrual.getTime() + periodsElapsed * periodDays * 86400000).toISOString()
        : (user.last_pto_accrual || hireDate);

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
    }

    return {
        newPtoBalance,
        newSickBalance,
        newLastPtoAccrual,
        newProcessedSickSeconds,
        ptoEarned,
        sickEarned,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC TO SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLeaveBalances(user: User): Promise<{
    pto: number;
    sick: number;
    ptoEarned: number;
    sickEarned: number;
    error?: string;
}> {
    try {
        const { data: tasks, error: taskError } = await (supabase
            .from('tasks')
            .select('active_seconds')
            .eq('assigned_to_id', user.id) as any);

        if (taskError) throw taskError;

        const totalWorkedSeconds: number = (tasks || []).reduce(
            (sum: number, t: any) => sum + (t.active_seconds || 0),
            0
        );

        const result = calculateAccruals(user, totalWorkedSeconds);
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

            const historyRows: any[] = [];
            const today = new Date().toISOString().split('T')[0];

            if (result.ptoEarned > 0) {
                const prevPto = parseFloat(user.pto_balance || '0');
                historyRows.push({
                    user_id:      user.id,
                    type:         'pto',
                    entry_date:   today,
                    description:  `PTO accrual — ${getPtoTierLabel(getTenureMonths(user.hire_date || today), user.pay_schedule || '')}`,
                    used_hours:   null,
                    earned_hours: Math.round(result.ptoEarned * 100) / 100,
                    balance:      result.newPtoBalance,
                });
                
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

