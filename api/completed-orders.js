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

    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch all Orders that are 'Packed' or 'Done' (vague "completed" status)
        const { data: orders, error: ordersError } = await supabase
            .from('manufacturing_orders')
            .select('*')
            .in('current_status', ['Packed', 'Done']);

        if (ordersError) {
            throw ordersError;
        }

        if (!orders || orders.length === 0) {
            return res.status(200).json([]);
        }

        // 2. Fetch all Tasks for these orders
        const moNumbers = orders.map(o => o.mo_number);
        const { data: allTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .in('mo_reference', moNumbers);

        if (tasksError) throw tasksError;

        // 3. Fetch Employees for mapping names/rates
        const { data: users } = await supabase
            .from('users')
            .select('id, name, hourly_rate')
            .eq('role', 'employee');

        const userMap = new Map();
        users?.forEach(u => userMap.set(u.id, u));

        // 4. Map and Aggregate Data per Order
        const result = orders.map(mo => {
            const moTasks = allTasks?.filter(t => t.mo_reference === mo.mo_number) || [];

            let totalSeconds = 0;
            let totalCost = 0;
            const uniqueEmployees = new Set();

            const logs = moTasks.map(task => {
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
            });

            const hTotal = Math.floor(totalSeconds / 3600);
            const mTotal = Math.floor((totalSeconds % 3600) / 60);
            const sTotal = totalSeconds % 60;

            return {
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
            };
        });

        res.status(200).json(result);

    } catch (error) {
        console.error('[API] Error:', error);
        res.status(500).json({ error: 'Server Error', details: error.message });
    }
}
