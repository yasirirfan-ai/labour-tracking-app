import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Chart from 'chart.js/auto';

export const ReportsPage: React.FC = () => {

    const [tasks, setTasks] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [mos, setMos] = useState<any[]>([]);
    const [ops, setOps] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [filters, setFilters] = useState({ employee: 'all', mo: 'all', operation: 'all', start: '', end: '' });

    const workerChartRef = useRef<HTMLCanvasElement>(null);
    const opChartRef = useRef<HTMLCanvasElement>(null);
    const chartInstances = useRef<{ worker: Chart | null, op: Chart | null }>({ worker: null, op: null });

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!isLoading && tasks.length >= 0) {
            updateCharts();
        }
    }, [isLoading, tasks, filters]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data: taskData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }) as { data: any[] };
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: moData } = await supabase.from('manufacturing_orders').select('*') as { data: any[] };
            const { data: opData } = await supabase.from('operations').select('*') as { data: any[] };

            if (taskData && userData) {
                const richTasks = taskData.map((t: any) => {
                    const emp = userData.find(u => u.id === t.assigned_to_id);
                    return {
                        ...t,
                        employee_name: emp?.name || 'Unknown',
                        cost: ((t.active_seconds || 0) / 3600) * (emp?.hourly_rate || 0)
                    };
                });
                
                setTasks(richTasks);
                setEmployees(userData || []);
                setMos(moData || []);
                setOps(opData || []);
            }
        } catch (err) {
            console.error('Error fetching reports:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const calculateStats = (filteredList: any[]) => {
        const totalSec = filteredList.reduce((acc, t) => acc + (t.active_seconds || 0), 0);
        const totalCost = filteredList.reduce((acc, t) => acc + (t.cost || 0), 0);
        return {
            totalHours: parseFloat((totalSec / 3600).toFixed(1)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            avgRate: totalSec > 0 ? parseFloat((totalCost / (totalSec / 3600)).toFixed(2)) : 0
        };
    };

    const getFilteredTasks = () => {
        return tasks.filter(task => {
            if (filters.employee !== 'all' && task.assigned_to_id !== filters.employee) return false;
            // The template uses mo name for value
            if (filters.mo !== 'all' && task.mo_reference !== filters.mo) return false;
            // The template uses operation name for value
            if (filters.operation !== 'all' && task.description !== filters.operation) return false;
            if (filters.start && task.start_time && task.start_time < filters.start) return false;
            if (filters.end && task.end_time && task.end_time > filters.end) return false;
            return true;
        });
    };

    const updateCharts = () => {
        const filtered = getFilteredTasks();
        
        // Prepare Data
        const hoursByWorker: Record<string, number> = {};
        const hoursByOp: Record<string, number> = {};

        filtered.forEach(t => {
            const h = (t.active_seconds || 0) / 3600;
            if (h > 0) {
                hoursByWorker[t.employee_name] = (hoursByWorker[t.employee_name] || 0) + h;
                hoursByOp[t.description] = (hoursByOp[t.description] || 0) + h;
            }
        });

        // Worker Chart
        if (workerChartRef.current) {
            if (chartInstances.current.worker) chartInstances.current.worker.destroy();
            chartInstances.current.worker = new Chart(workerChartRef.current, {
                type: 'bar',
                data: {
                    labels: Object.keys(hoursByWorker),
                    datasets: [{
                        label: 'Productive Hours',
                        data: Object.values(hoursByWorker),
                        backgroundColor: '#6366F1',
                        borderRadius: 8,
                        maxBarThickness: 40
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { borderDash: [5, 5] }, ticks: { font: { weight: 'bold' } } },
                        y: { grid: { display: false }, ticks: { font: { weight: 'bold' } } }
                    }
                } as any
            });
        }

        // Op Chart
        if (opChartRef.current) {
            if (chartInstances.current.op) chartInstances.current.op.destroy();
            chartInstances.current.op = new Chart(opChartRef.current, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(hoursByOp),
                    datasets: [{
                        data: Object.values(hoursByOp),
                        backgroundColor: ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { usePointStyle: true, font: { weight: 'bold' } } }
                    },
                    cutout: '70%'
                } as any
            });
        }
    };

    if (isLoading) return <div className="loading-screen">Generating Reports...</div>;

    const filteredList = getFilteredTasks();
    const currentStats = calculateStats(filteredList);

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Reports</h1>
                    <p className="page-subtitle">Labor cost and time analysis</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-primary" style={{ width: 'auto' }}>
                        <i className="fa-solid fa-file-export"></i> Export CSV
                    </button>
                </div>
            </div>

            <div className="reports-filter-card">
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 700 }}>
                    <i className="fa-solid fa-filter" style={{ color: 'var(--primary)' }}></i> Filters
                </div>
                <div className="filter-grid" id="filterForm">
                    <div className="filter-group">
                        <label>Worker</label>
                        <select
                            value={filters.employee}
                            onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        >
                            <option value="all">All Workers</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Manufacturing Order</label>
                        <select
                            value={filters.mo}
                            onChange={(e) => setFilters({ ...filters, mo: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        >
                            <option value="all">All Orders</option>
                            {mos.map(m => <option key={m.id} value={m.mo_number}>{m.mo_number}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Operation</label>
                        <select
                            value={filters.operation}
                            onChange={(e) => setFilters({ ...filters, operation: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        >
                            <option value="all">All Operations</option>
                            {ops.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Start Date</label>
                        <input
                            type="date"
                            value={filters.start}
                            onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>End Date</label>
                        <input
                            type="date"
                            value={filters.end}
                            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setFilters({ employee: 'all', mo: 'all', operation: 'all', start: '', end: '' })}><i className="fa-solid fa-rotate-left"></i> Reset</button>
                    <button className="btn btn-primary" style={{ width: 'auto' }}>Apply Filters</button>
                </div>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '2rem' }}>
                <div className="report-stat-card">
                    <div>
                        <div className="stat-label">Total Hours (Unique)</div>
                        <div className="stat-value">{currentStats.totalHours}</div>
                        <div className="stat-detail">{filteredList.length} time entries</div>
                    </div>
                    <div className="icon-box icon-blue"><i className="fa-regular fa-clock"></i></div>
                </div>
                <div className="report-stat-card">
                    <div>
                        <div className="stat-label">Labor Cost</div>
                        <div className="stat-value">${currentStats.totalCost.toFixed(2)}</div>
                        <div className="stat-detail">Based on hourly rates</div>
                    </div>
                    <div className="icon-box icon-green"><i className="fa-solid fa-dollar-sign"></i></div>
                </div>
                <div className="report-stat-card">
                    <div>
                        <div className="stat-label">Avg Cost/Hour</div>
                        <div className="stat-value">${currentStats.avgRate.toFixed(2)}</div>
                        <div className="stat-detail">Blended rate</div>
                    </div>
                    <div className="icon-box icon-yellow"><i className="fa-solid fa-chart-line"></i></div>
                </div>
            </div>

            <div className="content-grid" style={{ marginBottom: '2rem' }}>
                <div className="section-card">
                    <div className="section-header">
                        <h2 className="section-title"><i className="fa-solid fa-users" style={{ marginRight: '8px' }}></i> Hours by Worker</h2>
                    </div>
                    <div style={{ height: '300px' }}>
                        <canvas ref={workerChartRef}></canvas>
                    </div>
                </div>
                <div className="section-card">
                    <div className="section-header">
                        <h2 className="section-title"><i className="fa-solid fa-list-check" style={{ marginRight: '8px' }}></i> Hours by Operation</h2>
                    </div>
                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <canvas ref={opChartRef}></canvas>
                    </div>
                </div>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <h2 className="section-title"><i className="fa-regular fa-clock" style={{ marginRight: '8px' }}></i> Time Entry Details</h2>
                </div>
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Worker</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Order</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Operation</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Start Time</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Duration</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Type</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(task => (
                                <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '1rem', fontWeight: 700 }}>{task.employee_name}</td>
                                    <td style={{ padding: '1rem', color: 'var(--primary)', fontWeight: 600 }}>{task.mo_reference}</td>
                                    <td style={{ padding: '1rem' }}>{task.description}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                        {task.start_time ? task.start_time.substring(0, 16).replace('T', ', ') : 'N/A'}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {Math.floor((task.active_seconds || 0) / 3600)}h {Math.floor(((task.active_seconds || 0) % 3600) / 60)}m
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span className="badge" style={{ background: '#EEF2FF', color: '#4F46E5', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                            {task.manual ? 'manual' : 'auto'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', fontWeight: 700 }}>${(task.cost || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No entries found for the selected filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};
