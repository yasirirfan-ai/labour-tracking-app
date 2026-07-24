import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Chart from 'chart.js/auto';
import { trainingService } from '../lib/trainingService';
import type { TrainingMaterial } from '../lib/trainingService';
import { buildShiftsForWorker, buildBreaksForWorker } from '../lib/shifts';
import { pstDayStart, pstDayEnd } from '../lib/timezone';
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
            const { data: logsData } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: true }) as { data: any[] };
            
            const trMaterials = await trainingService.getAllMaterials();

            if (taskData && userData && logsData) {
                const taskCoveredKeys = new Set<string>();

                const richTasks = taskData.map((t: any) => {
                    const emp = userData.find(u => u.id === t.assigned_to_id);
                    const rate = (t.hourly_rate !== undefined && t.hourly_rate !== null && parseFloat(t.hourly_rate) > 0)
                        ? parseFloat(t.hourly_rate)
                        : (emp?.hourly_rate || 0);
                    
                    let activeSecs = t.active_seconds || 0;

                    // Manual Entries are sometimes left with active_seconds never actually saved
                    // to the database (0) even though start_time/end_time are correctly recorded
                    // — Control Table only ever recomputes their duration live in the browser for
                    // display, it doesn't always write that number back. Recompute directly from
                    // the task's own start/end here rather than trusting a possibly-unset column.
                    //
                    // BUT only do this if the task has its OWN tagged clock_in log (related_task_id
                    // === t.id) — matching exactly what Control Table checks before recomputing.
                    // A task with no tagged clock-in isn't verifiably linked to any specific real
                    // activity; its start_time/end_time are just whatever was typed in, and the
                    // real clocked time (if any) is already captured separately by the untagged
                    // logs feeding the General Shift virtual entry for that day. Recomputing here
                    // too would double-count the same hours on top of that entry — confirmed by a
                    // real case (Juan Avila, 07/17): his task had no tagged clock-in, and trusting
                    // its own end_time added a fabricated 8h30m on top of the correct 6h50m already
                    // shown by the General Shift entry for that day.
                    const hasOwnTaggedClockIn = t.manual && logsData.some(
                        (l: any) => l.related_task_id === t.id && l.event_type === 'clock_in'
                    );
                    if (hasOwnTaggedClockIn && !activeSecs && t.start_time && t.end_time) {
                        const startMs = new Date(t.start_time).getTime();
                        const endMs = new Date(t.end_time).getTime();
                        if (endMs > startMs) {
                            const workerBreaks = buildBreaksForWorker(
                                logsData.filter((l: any) => l.worker_id === t.assigned_to_id)
                            );
                            let unpaidBreakMs = 0;
                            workerBreaks.forEach((b) => {
                                if (b.type !== 'unpaid' || b.startMs < startMs || b.startMs > endMs) return;
                                const breakEndMs = b.endMs ?? Date.now();
                                unpaidBreakMs += Math.max(0, breakEndMs - b.startMs);
                            });
                            activeSecs = Math.max(0, Math.floor((endMs - startMs - unpaidBreakMs) / 1000));
                        }
                    }

                    if ((t.status === 'active' || t.status === 'in_progress' || t.status === 'clocked_in') && t.last_action_time) {
                        const diff = Math.floor((Date.now() - new Date(t.last_action_time).getTime()) / 1000);
                        if (diff > 0) activeSecs += diff;
                    }

                    // Only a REAL (non-manual) task fully covers its day — its active_seconds
                    // already represents that clocked time, so the General Shift fallback below
                    // must stay suppressed for it to avoid double-counting. A Manual Entry only
                    // covers the specific hours it was entered for, not necessarily the worker's
                    // whole day, so it must NOT suppress the fallback — otherwise any other real
                    // clocked time that day gets silently dropped from the report entirely.
                    const ref = t.start_time || t.created_at;
                    if (ref && !t.manual) {
                        const d = new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                        taskCoveredKeys.add(`${emp?.id}_${d}`);
                    }

                    return {
                        ...t,
                        employee_name: emp?.name || 'Unknown',
                        active_seconds: activeSecs,
                        cost: (activeSecs / 3600) * rate
                    };
                });

                // A worker can have more than one task row for the same day (e.g. two separate
                // Manual Entries). Control Table consolidates those into a single row per worker
                // per day; Reports was showing each one as its own line, which looked like
                // duplicate/multiple entries for the same day.
                const richTasksByDay = new Map<string, any[]>();
                richTasks.forEach((t: any) => {
                    const ref = t.start_time || t.created_at;
                    const d = ref ? new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : 'unknown';
                    const key = `${t.assigned_to_id}_${d}`;
                    if (!richTasksByDay.has(key)) richTasksByDay.set(key, []);
                    richTasksByDay.get(key)!.push(t);
                });

                const consolidatedRichTasks: any[] = [];
                richTasksByDay.forEach((dayTasks, key) => {
                    if (dayTasks.length === 1) {
                        consolidatedRichTasks.push(dayTasks[0]);
                        return;
                    }
                    const sorted = [...dayTasks].sort((a, b) => {
                        const aRef = a.start_time || a.created_at || '';
                        const bRef = b.start_time || b.created_at || '';
                        return new Date(aRef).getTime() - new Date(bRef).getTime();
                    });
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];
                    const totalActiveSecs = dayTasks.reduce((sum, t) => sum + (t.active_seconds || 0), 0);
                    const totalCost = dayTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
                    const descriptions = Array.from(new Set(dayTasks.map(t => t.description).filter(Boolean)));
                    const mos = Array.from(new Set(dayTasks.map(t => t.mo_reference).filter(Boolean)));
                    consolidatedRichTasks.push({
                        ...first,
                        id: `consolidated_${key}`,
                        description: descriptions.join(', ') || first.description,
                        mo_reference: mos.join(', ') || first.mo_reference,
                        active_seconds: totalActiveSecs,
                        cost: totalCost,
                        start_time: first.start_time || first.created_at,
                        created_at: first.created_at,
                        end_time: last.end_time || last.start_time || null,
                        manual: dayTasks.every(t => t.manual)
                    });
                });

                const virtualTasks: any[] = [];
                userData.filter((u: any) => u.active !== false).forEach((emp: any) => {
                    // A Manual Entry's own clock_in/clock_out logs are tagged with related_task_id
                    // (they exist only to keep shift-pairing correct for that entry). Exclude them
                    // here so their duration — already counted via the task's own active_seconds
                    // in richTasks — isn't summed a second time into a virtual General Shift entry.
                    const empLogs = logsData
                        .filter((l: any) => l.worker_id === emp.id)
                        .filter((l: any) => !((l.event_type === 'clock_in' || l.event_type === 'clock_out') && l.related_task_id))
                        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const pairedShifts = buildShiftsForWorker(empLogs);
                    const breaks = buildBreaksForWorker(empLogs);

                    // A worker can have more than one separate shift on the same calendar day
                    // (e.g. a real clock-out/clock-in pair). Control Table consolidates those into
                    // a single row per worker per day, and Reports should match that presentation
                    // — so shifts are grouped by day here and summed, rather than listed one row
                    // per shift (which also previously caused duplicate-id issues in the table).
                    const shiftsByDay = new Map<string, typeof pairedShifts>();
                    pairedShifts.forEach((shift) => {
                        const date = new Date(shift.clockIn.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                        if (!shiftsByDay.has(date)) shiftsByDay.set(date, []);
                        shiftsByDay.get(date)!.push(shift);
                    });

                    shiftsByDay.forEach((dayShifts, date) => {
                        if (taskCoveredKeys.has(`${emp.id}_${date}`)) return;

                        let totalActiveSecs = 0;
                        dayShifts.forEach((shift) => {
                            const inMs = new Date(shift.clockIn.timestamp).getTime();
                            const outMs = shift.clockOut ? new Date(shift.clockOut.timestamp).getTime() : Date.now();
                            const grossMs = Math.max(0, outMs - inMs);

                            // Only unpaid breaks reduce payable time — paid breaks (coffee/short
                            // rest/restroom) stay counted as part of the shift.
                            let unpaidBreakMs = 0;
                            breaks.forEach((b) => {
                                if (b.type !== 'unpaid' || b.startMs < inMs || b.startMs > outMs) return;
                                const breakEndMs = b.endMs ?? Date.now();
                                unpaidBreakMs += Math.max(0, breakEndMs - b.startMs);
                            });

                            totalActiveSecs += Math.max(0, Math.floor((grossMs - unpaidBreakMs) / 1000));
                        });

                        const firstShift = dayShifts[0];
                        const lastShift = dayShifts[dayShifts.length - 1];
                        const rate = emp.hourly_rate ? parseFloat(emp.hourly_rate) : 0;

                        virtualTasks.push({
                            id: `virtual_${emp.id}_${date}`,
                            assigned_to_id: emp.id,
                            employee_name: emp.name,
                            mo_reference: 'Unassigned',
                            description: 'General Shift',
                            created_at: firstShift.clockIn.timestamp,
                            start_time: firstShift.clockIn.timestamp,
                            end_time: lastShift.clockOut ? lastShift.clockOut.timestamp : null,
                            active_seconds: totalActiveSecs,
                            cost: (totalActiveSecs / 3600) * rate,
                            status: lastShift.clockOut ? 'completed' : 'clocked_in'
                        });
                    });
                });

                // Final pass: a worker can have BOTH a real task row (e.g. a Manual Entry) AND a
                // virtual/General Shift entry for the same day (e.g. a few leftover seconds of
                // untagged clock activity). consolidatedRichTasks and virtualTasks are each
                // already deduplicated to one row per worker per day within themselves, but never
                // merged against each other — so the same day could still show as two rows. Group
                // across both and combine any that land on the same worker+day into a single row,
                // matching Control Table's one-row-per-worker-per-day presentation.
                const groupedByKey = new Map<string, any[]>();
                [...consolidatedRichTasks, ...virtualTasks].forEach((task) => {
                    const ref = task.start_time || task.created_at;
                    const d = ref ? new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : 'unknown';
                    const key = `${task.assigned_to_id}_${d}`;
                    if (!groupedByKey.has(key)) groupedByKey.set(key, []);
                    groupedByKey.get(key)!.push(task);
                });

                const finalTasks: any[] = [];
                groupedByKey.forEach((items, key) => {
                    if (items.length === 1) {
                        finalTasks.push(items[0]);
                        return;
                    }
                    const sorted = [...items].sort((a, b) => {
                        const aRef = a.start_time || a.created_at || '';
                        const bRef = b.start_time || b.created_at || '';
                        return new Date(aRef).getTime() - new Date(bRef).getTime();
                    });
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];
                    finalTasks.push({
                        ...first,
                        id: `final_${key}`,
                        description: Array.from(new Set(items.map((i: any) => i.description).filter(Boolean))).join(', ') || first.description,
                        mo_reference: Array.from(new Set(items.map((i: any) => i.mo_reference).filter(Boolean))).join(', ') || first.mo_reference,
                        active_seconds: items.reduce((s: number, i: any) => s + (i.active_seconds || 0), 0),
                        cost: items.reduce((s: number, i: any) => s + (i.cost || 0), 0),
                        start_time: first.start_time || first.created_at,
                        created_at: first.created_at,
                        end_time: last.end_time || last.start_time || null,
                        manual: items.every((i: any) => i.manual)
                    });
                });

                // Reports only ever shows data from 07/01/2026 onward — older months (June test/
                // historical data, some of it corrupted) are permanently excluded from this page
                // specifically. This doesn't touch the database or any other page; Control Table
                // and everywhere else still see the full history untouched.
                const reportsFloorMs = new Date(pstDayStart('2026-07-01')).getTime();
                const withinReportsRange = (task: any) => {
                    const ref = task.start_time || task.created_at;
                    if (!ref) return false;
                    return new Date(ref).getTime() >= reportsFloorMs;
                };

                setTasks(finalTasks.filter(withinReportsRange));
                setEmployees((userData || []).filter((u: any) => u.active !== false));
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
        // Role bucket is derived from job title (falling back to department for shipping/purchasing),
        // matching the same derivation used in EmployeeDetailView.tsx and WorkerPortalPage.tsx —
        // "not a manager" alone isn't the actual training-role split.
        const workerCompliance = employees.map(worker => {
            const completed = worker.completed_trainings || [];
            const jobTitle = (worker.job_title || '').toLowerCase();
            const role =
                jobTitle.includes('compounder') ? 'Compounder I' :
                jobTitle.includes('qc') || jobTitle.includes('quality control') ? 'QC' :
                jobTitle.includes('r&d') || jobTitle.includes('research') ? 'Quality Assurance' :
                jobTitle.includes('qa') || jobTitle.includes('quality assurance') ? 'Quality Assurance' :
                jobTitle.includes('ship') || worker.department?.toLowerCase().includes('shipp') ? 'Shipping & Recieving' :
                jobTitle.includes('purchas') || worker.department?.toLowerCase().includes('purchas') ? 'Purchase' :
                'Production';
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
        // pstDayStart/pstDayEnd always return UTC "...Z" format (toISOString), but task
        // timestamps come straight from the database with an explicit offset (e.g. "...-07:00")
        // — comparing those as raw strings is comparing two different formats character-by-
        // character, which doesn't reliably preserve chronological order. Parse both sides to
        // actual timestamps instead.
        const startBoundMs = filters.start ? new Date(pstDayStart(filters.start)).getTime() : null;
        const endBoundMs = filters.end ? new Date(pstDayEnd(filters.end)).getTime() : null;

        return tasks
            .filter(task => {
                if (filters.employee !== 'all' && task.assigned_to_id !== filters.employee) return false;
                if (filters.mo !== 'all' && task.mo_reference !== filters.mo) return false;
                if (filters.operation !== 'all' && task.description !== filters.operation) return false;

                // Use start_time (or created_at as fallback) as the task's representative date.
                // In-progress tasks (null end_time) are included as long as they started in range.
                const taskDate = task.start_time || task.created_at;
                const taskDateMs = taskDate ? new Date(taskDate).getTime() : null;
                if (startBoundMs !== null && taskDateMs !== null && taskDateMs < startBoundMs) return false;
                if (endBoundMs !== null && taskDateMs !== null && taskDateMs > endBoundMs) return false;
                return true;
            })
            .sort((a, b) => {
                const dateA = a.start_time || a.created_at || '';
                const dateB = b.start_time || b.created_at || '';
                return dateB.localeCompare(dateA); // newest first
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

    const handleExportCSV = () => {
        const data = getFilteredTasks();
        const headers = ['Worker', 'Manufacturing Order', 'Operation', 'Start Time (PST)', 'Duration (h)', 'Type', 'Cost ($)'];

        const rows = data.map(task => {
            // Use created_at (Clock In) first — this is what the user entered.
            // Fall back to start_time for auto entries or Tab 2 manual entries.
            const displayDate = task.created_at || task.start_time;
            const startTimePST = displayDate
                ? new Date(displayDate).toLocaleString('en-US', {
                    timeZone: 'America/Los_Angeles',
                    month: '2-digit', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                })
                : 'N/A';
            const hours = ((task.active_seconds || 0) / 3600).toFixed(2);
            const cost = (task.cost || 0).toFixed(2);
            const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
            return [escape(task.employee_name), escape(task.mo_reference), escape(task.description), escape(startTimePST), hours, task.manual ? 'manual' : 'auto', cost].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `labour_report${filters.start ? `_${filters.start}` : ''}${filters.end ? `_to_${filters.end}` : ''}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (isLoading) return <div className="loading-screen"><div className="loading-spinner"></div><span>{t('reports.loading')}</span></div>;

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
                    <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleExportCSV}>
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
                                        {(task.created_at || task.start_time) ? new Date(task.created_at || task.start_time).toLocaleString('en-US', {
                                            timeZone: 'America/Los_Angeles',
                                            month: '2-digit', day: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit', hour12: false
                                        }) + ' PST' : 'N/A'}
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
