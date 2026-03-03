import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.CUSTOM_API_KEY;

    if (!apiKey || apiKey !== validApiKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
    }

    const { eventId } = req.query;

    if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId query parameter' });
    }

    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch MO
        const { data: mo, error: moError } = await supabase
            .from('manufacturing_orders')
            .select('*')
            .eq('event_id', eventId)
            .single();

        if (moError || !mo) {
            return res.status(404).json({ error: 'MO not found', details: moError?.message });
        }

        // 2. Fetch Tasks
        const { data: tasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('mo_reference', mo.mo_number);

        // 3. Fetch Employees
        const { data: users } = await supabase
            .from('users')
            .select('id, name, hourly_rate')
            .eq('role', 'employee');

        const userMap = new Map();
        users?.forEach(u => userMap.set(u.id, u));

        // 4. Aggregate
        let totalSeconds = 0;
        let totalCost = 0;
        const uniqueEmployees = new Set();

        const logs = tasks?.map((task) => {
            const worker = userMap.get(task.assigned_to_id) || { name: 'Unknown', hourly_rate: 0 };
            const durationSec = task.active_seconds || 0;
            // Use task-level hourly rate if available, fallback to worker default
            const rate = task.hourly_rate || worker.hourly_rate || 0;
            const cost = (durationSec / 3600) * rate;

            totalSeconds += durationSec;
            totalCost += cost;
            if (worker.name !== 'Unknown') uniqueEmployees.add(worker.name);

            const h = Math.floor(durationSec / 3600);
            const m = Math.floor((durationSec % 3600) / 60);
            const s = durationSec % 60;

            return {
                worker: worker.name,
                operation: task.description,
                duration: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
                duration_seconds: durationSec,
                hourly_rate: rate,
                cost: `${cost.toFixed(2)}$`,
                cost_cents: Math.round(cost * 100),
                rounding_method: 'standard',
                status: task.status,
                timestamp: task.created_at
            };
        }) || [];

        const hTotal = Math.floor(totalSeconds / 3600);
        const mTotal = Math.floor((totalSeconds % 3600) / 60);
        const sTotal = totalSeconds % 60;

        res.status(200).json({
            quantity: mo.quantity,
            po_number: mo.po_number,
            product_name: mo.product_name,
            sku: mo.sku,
            event_id: mo.event_id,
            scheduled_date: mo.scheduled_date,
            current_status: mo.current_status,
            employee_names: Array.from(uniqueEmployees),
            total_working_hours: `${hTotal.toString().padStart(2, '0')}:${mTotal.toString().padStart(2, '0')}:${sTotal.toString().padStart(2, '0')}`,
            total_work_seconds: totalSeconds,
            total_cost: `${Math.round(totalCost)}.00$`,
            total_cost_cents: Math.round(totalCost * 100),
            logs_breakdown: logs
        });

    } catch (error) {
        console.error('[API] Error:', error);
        res.status(500).json({ error: 'Server Error', details: error.message });
    }
}
