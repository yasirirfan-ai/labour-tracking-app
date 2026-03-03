import type { ManufacturingOrder } from '../types';

/**
 * Sorts Manufacturing Orders based on the following priority:
 * 1. Pinned items first
 * 2. Sort Order (is_pinned check happens implicitly if pinned items have lower sort_order, but we handle explicit pin check)
 * 3. MO Number (numeric part) as fallback
 */
export const sortManufacturingOrders = (orders: ManufacturingOrder[]): ManufacturingOrder[] => {
    return [...orders].sort((a, b) => {
        // 1. Pin priority
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        // 2. Sort Order priority (if both pinned or both unpinned)
        if ((a.sort_order || 0) !== (b.sort_order || 0)) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        }

        // 3. Fallback MO Number numeric sorting
        const numA = parseInt((a.mo_number || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.mo_number || '').replace(/\D/g, '')) || 0;
        return numA - numB;
    });
};
