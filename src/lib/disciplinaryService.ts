import { supabase } from './supabase';

export type SeverityType = 'minor' | 'major' | 'gross_misconduct';
export type ActionStepType = 'verbal_warning' | 'written_warning' | 'suspension' | 'termination';

/**
 * Disciplinary Engine Logic
 * Based on SOP 3.7
 */
export const DisciplinaryService = {
    /**
     * Evaluates the next logical disciplinary step for a worker
     * Logic: Repeated minor infractions lead to escalation.
     */
    async suggestNextStep(workerId: string, currentSeverity: SeverityType): Promise<ActionStepType> {
        if (currentSeverity === 'gross_misconduct') return 'termination';
        if (currentSeverity === 'major') return 'suspension';

        // Fetch active warnings for minor/major issues
        const { data: previousActions } = await (supabase as any)
            .from('disciplinary_actions')
            .select('action_step')
            .eq('worker_id', workerId)
            .eq('status', 'active');

        const steps = previousActions?.map((a: any) => a.action_step) || [];

        if (currentSeverity === 'minor') {
            if (steps.includes('written_warning')) return 'suspension';
            if (steps.includes('verbal_warning')) return 'written_warning';
            return 'verbal_warning';
        }

        return 'verbal_warning';
    },

    /**
     * Checks if an appeal is within the allowed timeframe (5 business days)
     */
    isAppealAllowed(issuedDate: string | Date): boolean {
        const issued = new Date(issuedDate);
        const now = new Date();

        // Simple business day check (rough estimate: 7 calendar days to account for weekend)
        const diffTime = Math.abs(now.getTime() - issued.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays <= 7; // Allowing 7 calendar days (~5 business days)
    },

    /**
     * Records a worker's acknowledgment of a policy
     */
    async acknowledgePolicy(workerId: string, policyId: string, signature: string) {
        return await (supabase as any)
            .from('policy_acknowledgments')
            .insert({
                worker_id: workerId,
                policy_id: policyId,
                signature_data: signature,
                signed_at: new Date().toISOString()
            });
    },

    /**
     * Fetches required acknowledgments for a worker
     */
    async getPendingAcknowledgments(workerId: string) {
        // Standard query to find policies without acknowledgments
        const { data: policies } = await (supabase as any)
            .from('disciplinary_policies')
            .select('*')
            .eq('is_active', true);

        const { data: acks } = await (supabase as any)
            .from('policy_acknowledgments')
            .select('policy_id')
            .eq('worker_id', workerId);

        const acknowledgedIds = acks?.map((a: any) => a.policy_id) || [];
        return policies?.filter((p: any) => !acknowledgedIds.includes(p.id)) || [];
    }
};
