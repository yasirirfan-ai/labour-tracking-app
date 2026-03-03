import { defineConfig, loadEnv, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'

console.log('[ViteConfig] Loading configuration...');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log('[ViteConfig] Defining config for mode:', mode);
  const env = loadEnv(mode, process.cwd(), '')
  process.env = { ...process.env, ...env };

  return {
    plugins: [
      react(),
      {
        name: 'mo-details-api',
        configureServer(server: ViteDevServer) {
          console.log('[ViteConfig] Plugin configuring server...');
          server.middlewares.use('/api/mo-details', async (req: any, res: any) => {
            console.log('[ViteAPI] Received request for:', req.url);

            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== env.CUSTOM_API_KEY) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API Key' }));
              return;
            }
            try {
              const url = new URL(req.url || '', `http://${req.headers.host}`);
              const eventId = url.searchParams.get('eventId');

              if (!eventId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing eventId query parameter' }));
                return;
              }

              const supabaseUrl = env.VITE_SUPABASE_URL;
              const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
              const supabase = createClient(supabaseUrl, supabaseKey);

              // 1. Fetch MO
              const { data: mo, error: moError } = await supabase
                .from('manufacturing_orders')
                .select('*')
                .eq('event_id', eventId)
                .single();

              if (moError || !mo) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'MO not found', details: moError?.message }));
                return;
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
              const uniqueEmployees = new Set<string>();

              const logs = tasks?.map((task: any) => {
                const worker = userMap.get(task.assigned_to_id) || { name: 'Unknown', hourly_rate: 0 };
                const durationSec = task.active_seconds || 0;
                const cost = (durationSec / 3600) * (worker.hourly_rate || 0);

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
                  hourly_rate: worker.hourly_rate || 0,
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

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
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
              }));

            } catch (error: any) {
              console.error('[ViteAPI] Error:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Server Error', details: error.message }));
            }
          });

          server.middlewares.use('/api/completed-orders', async (req: any, res: any) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== env.CUSTOM_API_KEY) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API Key' }));
              return;
            }
            try {
              const supabaseUrl = env.VITE_SUPABASE_URL;
              const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
              const supabase = createClient(supabaseUrl, supabaseKey);

              const { data: orders, error: ordersError } = await supabase
                .from('manufacturing_orders')
                .select('*')
                .in('current_status', ['Packed', 'Done']);

              if (ordersError) throw ordersError;

              if (!orders || orders.length === 0) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([]));
                return;
              }

              const moNumbers = orders.map(o => o.mo_number);
              const { data: allTasks } = await supabase
                .from('tasks')
                .select('*')
                .in('mo_reference', moNumbers);

              const { data: users } = await supabase
                .from('users')
                .select('id, name, hourly_rate')
                .eq('role', 'employee');

              const userMap = new Map();
              users?.forEach(u => userMap.set(u.id, u));

              const result = orders.map(mo => {
                const moTasks = allTasks?.filter(t => t.mo_reference === mo.mo_number) || [];
                let totalSeconds = 0;
                let totalCost = 0;
                const uniqueEmployees = new Set();

                const logs = moTasks.map(task => {
                  const worker = userMap.get(task.assigned_to_id) || { name: 'Unknown', hourly_rate: 0 };
                  const durationSec = task.active_seconds || 0;
                  const cost = (durationSec / 3600) * (worker.hourly_rate || 0);

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
                    hourly_rate: worker.hourly_rate || 0,
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

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));

            } catch (error: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Server Error', details: error.message }));
            }
          });
        }
      }
    ],
    server: {
      proxy: {
        '/api/sync-odoo': {
          target: 'https://us-central1-pythonautomation-430712.cloudfunctions.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/sync-odoo/, '/laborTrackAPI'),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              proxyReq.setHeader('X-APP-KEY', 'Y3JhY2t3YXNoc2VydmVib3VuZHRoaW5rd2luZHBsYW50Y29ubmVjdGVkbG9uZ2VybG8=');
            });
          },
        },
      },
    },
  }
})
