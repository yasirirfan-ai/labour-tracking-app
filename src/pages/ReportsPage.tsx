import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Chart from 'chart.js/auto';
import { trainingService } from '../lib/trainingService';
import type { TrainingMaterial } from '../lib/trainingService';
import { useTranslation } from 'react-i18next';

export const ReportsPage: React.FC = () => {
    const { t } = useTranslation();
    const [tasks, setTasks] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [mos, setMos] = useState<any[]>([]);
    const [ops, setOps] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);

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
            
            const trMaterials = await trainingService.getAllMaterials();

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
                setTrainingMaterials(trMaterials || []);
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

        // Calculate team training compliance
        const workerCompliance = employees.map(worker => {
            const completed = worker.completed_trainings || [];
            const role = worker.role === 'manager' ? 'Quality Assurance' : 'Production';
            const sopsForRole = trainingMaterials.filter(m => m.level === 2 && m.department === role);
            const totalPossible = 3 + sopsForRole.length; // Assuming 3 Level 1 categories on average or core trainings
            return totalPossible > 0 ? (completed.length / totalPossible) : 0;
        });
        const avgCompliance = workerCompliance.length > 0
            ? (workerCompliance.reduce((a, b) => a + b, 0) / workerCompliance.length) * 100
            : 0;

        return {
            totalHours: parseFloat((totalSec / 3600).toFixed(1)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            avgRate: totalSec > 0 ? parseFloat((totalCost / (totalSec / 3600)).toFixed(2)) : 0,
            avgCompliance: Math.round(avgCompliance)
        };
    };

    const getFilteredTasks = () => {
        return tasks.filter(task => {
            if (filters.employee !== 'all' && task.assigned_to_id !== filters.employee) return false;
            if (filters.mo !== 'all' && task.mo_reference !== filters.mo) return false;
            if (filters.operation !== 'all' && task.description !== filters.operation) return false;
            if (filters.start && task.start_time && task.start_time < filters.start) return false;
            if (filters.end && task.end_time && task.end_time > filters.end) return false;
            return true;
        });
    };

    const updateCharts = () => {
        const filtered = getFilteredTasks();
        const hoursByWorker: Record<string, number> = {};
        const hoursByOp: Record<string, number> = {};

        filtered.forEach(t => {
            const h = (t.active_seconds || 0) / 3600;
            if (h > 0) {
                hoursByWorker[t.employee_name] = (hoursByWorker[t.employee_name] || 0) + h;
                hoursByOp[t.description] = (hoursByOp[t.description] || 0) + h;
            }
        });

        if (workerChartRef.current) {
            if (chartInstances.current.worker) chartInstances.current.worker.destroy();
            chartInstances.current.worker = new Chart(workerChartRef.current, {
                type: 'bar',
                data: {
                    labels: Object.keys(hoursByWorker),
                    datasets: [{
                        label: t('reports.productiveHours'),
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
                        x: { grid: { borderDash: [5, 5], color: 'rgba(148, 163, 184, 0.1)' }, ticks: { font: { weight: 'bold' }, color: 'var(--text-main)' } },
                        y: { grid: { display: false }, ticks: { font: { weight: 'bold' }, color: 'var(--text-main)' } }
                    }
                } as any
            });
        }

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
                        legend: { position: 'right', labels: { usePointStyle: true, font: { weight: 'bold' }, color: 'var(--text-main)' } }
                    },
                    cutout: '70%'
                } as any
            });
        }
    };

    if (isLoading) return <div className="loading-screen">{t('reports.loading')}</div>;

    const filteredList = getFilteredTasks();
    const currentStats = calculateStats(filteredList);

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">{t('reports.title')}</h1>
                    <p className="page-subtitle">{t('reports.subtitle')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-primary" style={{ width: 'auto' }}>
                        <i className="fa-solid fa-file-export"></i> {t('reports.exportCsv')}
                    </button>
                </div>
            </div>

            <div className="reports-filter-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 700 }}>
                    <i className="fa-solid fa-filter" style={{ color: 'var(--primary)' }}></i> {t('reports.filters')}
                </div>
                <div className="filter-grid" id="filterForm">
                    <div className="filter-group">
                        <label style={{ color: 'var(--text-main)' }}>{t('reports.worker')}</label>
                        <select
                            value={filters.employee}
                            onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        >
                            <option value="all">{t('reports.allWorkers')}</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label style={{ color: 'var(--text-main)' }}>{t('reports.mo')}</label>
                        <select
                            value={filters.mo}
                            onChange={(e) => setFilters({ ...filters, mo: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        >
                            <option value="all">{t('reports.allOrders')}</option>
                            {mos.map(m => <option key={m.id} value={m.mo_number}>{m.mo_number}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label style={{ color: 'var(--text-main)' }}>{t('reports.operation')}</label>
                        <select
                            value={filters.operation}
                            onChange={(e) => setFilters({ ...filters, operation: e.target.value })}
                            className="form-select" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        >
                            <option value="all">{t('reports.allOperations')}</option>
                            {ops.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label style={{ color: 'var(--text-main)' }}>{t('reports.startDate')}</label>
                        <input
                            type="date"
                            value={filters.start}
                            onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label style={{ color: 'var(--text-main)' }}>{t('reports.endDate')}</label>
                        <input
                            type="date"
                            value={filters.end}
                            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setFilters({ employee: 'all', mo: 'all', operation: 'all', start: '', end: '' })}><i className="fa-solid fa-rotate-left"></i> {t('reports.reset')}</button>
                    <button className="btn btn-primary" style={{ width: 'auto' }}>{t('reports.applyFilters')}</button>
                </div>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '2rem' }}>
                <div className="report-stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div>
                        <div className="stat-label" style={{ color: 'var(--text-muted)' }}>{t('reports.totalHours')}</div>
                        <div className="stat-value" style={{ color: 'var(--text-main)' }}>{currentStats.totalHours}</div>
                        <div className="stat-detail" style={{ color: 'var(--text-muted)' }}>{filteredList.length} {t('reports.timeEntries')}</div>
                    </div>
                    <div className="icon-box icon-blue"><i className="fa-regular fa-clock"></i></div>
                </div>
                <div className="report-stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div>
                        <div className="stat-label" style={{ color: 'var(--text-muted)' }}>{t('reports.laborCost')}</div>
                        <div className="stat-value" style={{ color: 'var(--text-main)' }}>${currentStats.totalCost.toFixed(2)}</div>
                        <div className="stat-detail" style={{ color: 'var(--text-muted)' }}>{t('reports.basedOnRates')}</div>
                    </div>
                    <div className="icon-box icon-green"><i className="fa-solid fa-dollar-sign"></i></div>
                </div>
                <div className="report-stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div>
                        <div className="stat-label" style={{ color: 'var(--text-muted)' }}>{t('reports.avgCostPerHour')}</div>
                        <div className="stat-value" style={{ color: 'var(--text-main)' }}>${currentStats.avgRate.toFixed(2)}</div>
                        <div className="stat-detail" style={{ color: 'var(--text-muted)' }}>{t('reports.blendedRate')}</div>
                    </div>
                    <div className="icon-box icon-yellow"><i className="fa-solid fa-chart-line"></i></div>
                </div>
                <div className="report-stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div>
                        <div className="stat-label" style={{ color: 'var(--text-muted)' }}>{t('reports.trainingCompliance')}</div>
                        <div className="stat-value" style={{ color: 'var(--text-main)' }}>{currentStats.avgCompliance}%</div>
                        <div className="stat-detail" style={{ color: 'var(--text-muted)' }}>{t('reports.overallReadiness')}</div>
                    </div>
                    <div className="icon-box" style={{ background: 'var(--bg-main)', color: 'var(--primary)' }}><i className="fa-solid fa-user-graduate"></i></div>
                </div>
            </div>

            <div className="content-grid" style={{ marginBottom: '2rem' }}>
                <div className="section-card">
                    <div className="section-header">
                        <h2 className="section-title"><i className="fa-solid fa-users" style={{ marginRight: '8px' }}></i> {t('reports.hoursByWorker')}</h2>
                    </div>
                    <div style={{ height: '300px' }}>
                        <canvas ref={workerChartRef}></canvas>
                    </div>
                </div>
                <div className="section-card">
                    <div className="section-header">
                        <h2 className="section-title"><i className="fa-solid fa-list-check" style={{ marginRight: '8px' }}></i> {t('reports.hoursByOperation')}</h2>
                    </div>
                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <canvas ref={opChartRef}></canvas>
                    </div>
                </div>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <h2 className="section-title"><i className="fa-regular fa-clock" style={{ marginRight: '8px' }}></i> {t('reports.timeEntryDetails')}</h2>
                </div>
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.worker')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.order')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.operation')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.startTime')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.duration')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.type')}</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)' }}>{t('reports.cost')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(task => (
                                <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>{task.employee_name}</td>
                                    <td style={{ padding: '1rem', color: 'var(--primary)', fontWeight: 600 }}>{task.mo_reference}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-main)' }}>{task.description}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                        {task.start_time ? task.start_time.substring(0, 16).replace('T', ', ') : 'N/A'}
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-main)' }}>
                                        {Math.floor((task.active_seconds || 0) / 3600)}h {Math.floor(((task.active_seconds || 0) % 3600) / 60)}m
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span className="badge" style={{ background: 'var(--bg-main)', color: 'var(--primary)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                            {task.manual ? 'manual' : 'auto'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>${(task.cost || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('reports.noEntries')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};
