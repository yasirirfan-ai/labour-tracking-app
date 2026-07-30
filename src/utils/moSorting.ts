import type { ManufacturingOrder } from '../types';

/**
 * Sorts Manufacturing Orders based on the following priority:
 * 1. Pinned items first
 * 2. Scheduled Date — newest (furthest out) first, oldest last. Orders with no scheduled_date
 *    sink to the bottom rather than jumping to the top.
 * 3. Sort Order — tiebreaker for orders sharing the same scheduled date (also what drag-and-drop
 *    reordering on the Manufacturing Orders page writes to).
 * 4. MO Number (numeric part) as final fallback
 */
export const sortManufacturingOrders = (orders: ManufacturingOrder[]): ManufacturingOrder[] => {
    return [...orders].sort((a, b) => {
        // 1. Pin priority
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        // 2. Scheduled Date priority (descending — newest first)
        const dateA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : -Infinity;
        const dateB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : -Infinity;
        if (dateA !== dateB) {
            return dateB - dateA;
        }

        // 3. Sort Order priority (tiebreaker within the same scheduled date)
        if ((a.sort_order || 0) !== (b.sort_order || 0)) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        }

        // 4. Fallback MO Number numeric sorting
        const numA = parseInt((a.mo_number || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.mo_number || '').replace(/\D/g, '')) || 0;
        return numA - numB;
    });
};
