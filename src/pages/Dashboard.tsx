import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Chart from 'chart.js/auto';
import { buildShiftsForWorker } from '../lib/shifts';

const CHART_COLORS = [
    '#6366F1', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
];

export const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const [stats, setStats] = useState({
        clockedInWorkers: 0,
        totalWorkers: 0,
        workersOnBreak: 0,
        todayHours: 0,
        totalLabourCost: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [workerCount, setWorkerCount] = useState(5);

    // Chart canvas refs
    const hoursChartRef = useRef<HTMLCanvasElement>(null);
    const costChartRef  = useRef<HTMLCanvasElement>(null);
    // Chart container refs (for ResizeObserver)
    const hoursContainerRef = useRef<HTMLDivElement>(null);
    const costContainerRef  = useRef<HTMLDivElement>(null);
    // Chart instances
    const hoursChartInstance = useRef<Chart | null>(null);
    const costChartInstance  = useRef<Chart | null>(null);

    // ResizeObserver — makes charts respond when sidebar opens/closes
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            hoursChartInstance.current?.resize();
            costChartInstance.current?.resize();
        });
        if (hoursContainerRef.current) observer.observe(hoursContainerRef.current);
        if (costContainerRef.current)  observer.observe(costContainerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: taskData } = await supabase.from('tasks').select('*') as { data: any[] };
            const { data: logsData } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: true }) as { data: any[] };

            if (userData && taskData && logsData) {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

                // ── Helper: pair clock_in / clock_out logs into shifts ─────────
                // Returns array of { date (PST YYYY-MM-DD), hours, empId }
                // Delegates to the shared, task-aware buildShiftsForWorker (src/lib/shifts.ts) so a
                // Manual Entry's clock_out only ever closes its own clock_in, instead of whichever
                // shift happens to be open — the same pairing bug this fixes elsewhere (Control
                // Table, Employee Activity) applied here too, since this used to be its own
                // separate, simpler copy of the same logic.
                const buildLogShifts = (empId: string) => {
                    const empLogs = logsData
                        .filter((l: any) => l.worker_id === empId)
                        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const pairedShifts = buildShiftsForWorker(empLogs);

                    return pairedShifts.map((shift) => {
                        const inMs = new Date(shift.clockIn.timestamp).getTime();
                        const outMs = shift.clockOut ? new Date(shift.clockOut.timestamp).getTime() : Date.now();
                        const h = Math.max(0, (outMs - inMs) / 3600000);
                        const date = new Date(shift.clockIn.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                        return { date, hours: h };
                    });
                };

                // KPI 1 — Clocked-in workers
                const clockedInWorkers = userData.filter(u => u.status === 'present').length;

                // KPI 2 — Workers on break
                const workersOnBreak = userData.filter(u => u.availability === 'break').length;

                // ── Chart data: ALL active employees seeded with 0 ────────────
                const hoursByWorker: Record<string, number> = {};
                const costByWorker:  Record<string, number> = {};
                userData.filter(u => u.active !== false).forEach((u: any) => {
                    hoursByWorker[u.name] = 0;
                    costByWorker[u.name]  = 0;
                });

                // Track which worker+days are covered by a task record
                const taskCoveredKeys = new Set<string>();

                // Accumulate from tasks table
                taskData.forEach((t: any) => {
                    const emp = userData.find(u => u.id === t.assigned_to_id);
                    if (!emp) return;
                    const name = emp.name;
                    const h = (t.active_seconds || 0) / 3600;
                    const rate = (t.hourly_rate !== undefined && t.hourly_rate !== null && parseFloat(t.hourly_rate) > 0)
                        ? parseFloat(t.hourly_rate)
                        : (emp?.hourly_rate || 0);
                    hoursByWorker[name] = (hoursByWorker[name] || 0) + h;
                    costByWorker[name]  = (costByWorker[name]  || 0) + (h * rate);

                    // Mark this worker+day as covered so we don't double-count from logs
                    const ref = t.start_time || t.created_at;
                    if (ref) {
                        const d = new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                        taskCoveredKeys.add(`${emp.id}_${d}`);
                    }
                });

                // Supplement from activity_logs for shifts NOT covered by a task
                let todayLogSeconds = 0;
                userData.filter(u => u.active !== false).forEach((emp: any) => {
                    const logShifts = buildLogShifts(emp.id);
                    logShifts.forEach(({ date, hours }) => {
                        const key = `${emp.id}_${date}`;
                        if (!taskCoveredKeys.has(key)) {
                            // Not covered by a task — add log-derived hours
                            const rate = emp.hourly_rate || 0;
                            hoursByWorker[emp.name] = (hoursByWorker[emp.name] || 0) + hours;
                            costByWorker[emp.name]  = (costByWorker[emp.name]  || 0) + (hours * rate);

                            // Also count toward Today's Hours if shift is today
                            if (date === todayStr) {
                                todayLogSeconds += hours * 3600;
                            }
                        }
                    });
                });

                // KPI 3 — Today's total hours (tasks + uncovered log shifts)
                const todayTaskSec = taskData
                    .filter((t: any) => {
                        const ref = t.start_time || t.created_at;
                        if (!ref) return false;
                        return new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) === todayStr;
                    })
                    .reduce((acc: number, t: any) => acc + (t.active_seconds || 0), 0);
                const todayHours = parseFloat(((todayTaskSec + todayLogSeconds) / 3600).toFixed(2));

                // KPI 4 — All-time total labour cost (tasks + log-derived shifts)
                const totalLabourCost = Object.values(costByWorker).reduce((a, b) => a + b, 0);

                setStats({
                    clockedInWorkers,
                    totalWorkers: userData.filter(u => u.active !== false).length,
                    workersOnBreak,
                    todayHours,
                    totalLabourCost: parseFloat(totalLabourCost.toFixed(2))
                });

                setWorkerCount(Object.keys(hoursByWorker).length || 5);

                // Render after DOM paint
                setTimeout(() => {
                    buildHoursChart(hoursByWorker);
                    buildCostChart(costByWorker);
                }, 80);
            }

        } catch (err) {
            console.error('Error fetching dashboard:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const buildHoursChart = (hoursByWorker: Record<string, number>) => {
        if (!hoursChartRef.current) return;
        if (hoursChartInstance.current) hoursChartInstance.current.destroy();

        // Sort largest → smallest so longest bar is at the top
        const sorted = Object.entries(hoursByWorker).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(([name]) => name);
        const values = sorted.map(([, h]) => parseFloat(h.toFixed(1)));

        hoursChartInstance.current = new Chart(hoursChartRef.current, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Productive Hours',
                    data: values,
                    backgroundColor: '#6366F1',
                    borderRadius: 8,
                    maxBarThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Productive Hours: ${ctx.parsed.x.toFixed(1)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.1)' },
                        ticks: { font: { weight: 'bold' }, color: 'var(--text-main)' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { weight: 'bold' }, color: 'var(--text-main)' }
                    }
                }
            } as any
        });
    };

    const buildCostChart = (costByWorker: Record<string, number>) => {
        if (!costChartRef.current) return;
        if (costChartInstance.current) costChartInstance.current.destroy();

        const labels = Object.keys(costByWorker);
        const values = Object.values(costByWorker).map(v => parseFloat(v.toFixed(2)));

        costChartInstance.current = new Chart(costChartRef.current, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: CHART_COLORS.slice(0, labels.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',      // ← moved to bottom so it never clips
                        labels: {
                            usePointStyle: true,
                            padding: 16,
                            font: { size: 12, weight: 'bold' },
                            color: 'var(--text-main)',
                            generateLabels: (chart) => {
                                const data = chart.data;
                                return (data.labels as string[]).map((label, i) => ({
                                    text: `${label}  $${(data.datasets[0].data[i] as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                    fillStyle: CHART_COLORS[i % CHART_COLORS.length],
                                    strokeStyle: 'transparent',
                                    pointStyle: 'circle',
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed as number;
                                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                                return ` $${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}  (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '65%'
            } as any
        });
    };

    if (isLoading) return <div className="loading-screen"><div className="loading-spinner"></div><span>{t('common.loading')}</span></div>;

    const chartH = Math.max(260, workerCount * 56 + 60);

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">{t('dashboard.title')}</h1>
                <p className="page-subtitle">{t('dashboard.subtitle')}</p>
            </div>

            {/* ── KPI Cards ───────────────────────────────────────────────── */}
            <div className="stats-grid">
                <Link
                    to="/employee-activity"
                    className={`stat-card stat-card-hero ${stats.clockedInWorkers > 0 ? 'is-live' : ''}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                >
                    <div>
                        <div className="stat-label">{t('dashboard.activeWorkers')}</div>
                        <div className="stat-value">{stats.clockedInWorkers}</div>
                        <div className="stat-detail">{stats.totalWorkers} {t('dashboard.totalWorkers')}</div>
                    </div>
                    <div className="icon-box icon-blue">
                        <i className="fa-solid fa-user-group"></i>
                    </div>
                </Link>

                <Link
                    to="/employee-activity"
                    className={`stat-card ${stats.workersOnBreak > 0 ? 'stat-card-break-active' : ''}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                >
                    <div>
                        <div className="stat-label">Workers on Break</div>
                        <div className="stat-value">{stats.workersOnBreak}</div>
                        <div className="stat-detail">Currently on break</div>
                    </div>
                    <div className={`icon-box ${stats.workersOnBreak > 0 ? 'icon-yellow' : 'icon-green'}`}>
                        <i className="fa-solid fa-mug-hot"></i>
                    </div>
                </Link>

                <Link to="/control-table" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">{t('dashboard.todayHours')}</div>
                        <div className="stat-value">{stats.todayHours}</div>
                        <div className="stat-detail">Total hours today (all employees)</div>
                    </div>
                    <div className="icon-box icon-yellow">
                        <i className="fa-regular fa-clock"></i>
                    </div>
                </Link>

                <div className="stat-card">
                    <div>
                        <div className="stat-label">Total Labour Cost</div>
                        <div className="stat-value">${stats.totalLabourCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="stat-detail">All-time cumulative cost</div>
                    </div>
                    <div className="icon-box icon-red">
                        <i className="fa-solid fa-dollar-sign"></i>
                    </div>
                </div>
            </div>

            {/* ── Charts Row ─────────────────────────────────────────────────── */}
            {/* min-width:0 prevents grid children from overflowing their columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem', minWidth: 0 }}>

                {/* Hours by Worker — horizontal bar */}
                <div className="section-card" style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div className="section-header" style={{ marginBottom: '1.25rem' }}>
                        <h2 className="section-title">
                            <i className="fa-solid fa-users" style={{ marginRight: '0.5rem', color: 'var(--primary)' }}></i>
                            Hours by Worker
                        </h2>
                    </div>
                    <div ref={hoursContainerRef} style={{ position: 'relative', height: `${chartH}px`, width: '100%' }}>
                        <canvas ref={hoursChartRef}></canvas>
                    </div>
                </div>

                {/* Labour Cost by Worker — doughnut */}
                <div className="section-card" style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div className="section-header" style={{ marginBottom: '1.25rem' }}>
                        <h2 className="section-title">
                            <i className="fa-solid fa-dollar-sign" style={{ marginRight: '0.5rem', color: 'var(--primary)' }}></i>
                            Labour Cost by Worker
                        </h2>
                    </div>
                    <div ref={costContainerRef} style={{ position: 'relative', height: `${chartH}px`, width: '100%' }}>
                        <canvas ref={costChartRef}></canvas>
                    </div>
                </div>

            </div>
        </>
    );
};
