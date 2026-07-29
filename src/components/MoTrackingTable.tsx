import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parsePSTToUTC } from '../lib/timezone';

// Standalone MO Tracking view for Control Table. Reads directly from the raw per-task rows
// (one row per real task tied to a Manufacturing Order) instead of the day-consolidated
// attendance rows, so a worker's payable clock-in/out hours and their per-MO labor cost are
// computed completely independently of each other — neither view can leak into the other's math.
interface Props {
    moTasks: any[];
    employees: any[];
    mos: any[];
    search: string;
    setSearch: (v: string) => void;
    workerFilter: string;
    setWorkerFilter: (v: string) => void;
    startDate: string;
    endDate: string;
    setStartDate: (v: string) => void;
    setEndDate: (v: string) => void;
    getPSTBound: (dateStr: string, endOfDay: boolean) => Date;
    getStatusLabel: (status: string) => React.ReactNode;
    getTaskCost: (task: any) => number;
    getTaskAuditTrail: (task: any) => { action: string; actor: string; time: string; reason?: string }[];
    formatDateTime: (iso: string) => string;
    currentUserName: string;
    onRefresh: () => void;
    t: (key: string) => string;
}

const formatDuration = (task: any): string => {
    let total = task.active_seconds || 0;
    if (task.status === 'active' && task.last_action_time) {
        const diff = Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000);
        if (diff > 0) total += diff;
    }
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
};

// UTC ISO timestamp -> "YYYY-MM-DDTHH:mm" in Pacific time, for prefilling a datetime-local input.
// Mirrors the inverse of lib/timezone's parsePSTToUTC, which the app already uses everywhere else
// to turn that same input shape back into a real UTC timestamp on save.
const toPSTDatetimeLocal = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    let hour = get('hour');
    if (hour === '24') hour = '00';
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
};

export const MoTrackingTable: React.FC<Props> = ({
    moTasks, search, setSearch, workerFilter, setWorkerFilter, employees,
    startDate, endDate, setStartDate, setEndDate, getPSTBound,
    getStatusLabel, getTaskCost, getTaskAuditTrail, formatDateTime, currentUserName, onRefresh, t
}) => {
    // Local re-render tick so live (still-running) task durations/costs keep counting up,
    // independent of the attendance view's own timer.
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const [editingTask, setEditingTask] = useState<any>(null);
    const [editStart, setEditStart] = useState('');
    const [editLastAction, setEditLastAction] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const openEdit = (task: any) => {
        setEditingTask(task);
        setEditStart(toPSTDatetimeLocal(task.start_time));
        setEditLastAction(toPSTDatetimeLocal(task.last_action_time || task.start_time));
    };

    const closeEdit = () => {
        setEditingTask(null);
        setEditStart('');
        setEditLastAction('');
    };

    // A still-running task's displayed duration is always active_seconds + (now - last_action_time)
    // — that's what makes the timer tick live everywhere else in the app. If we let last_action_time
    // be edited independently here too, the two edits cancel out mathematically (raising
    // active_seconds by editing last_action_time later, then immediately re-subtracting the same
    // gap in the live term) and the edit visibly "does nothing", which is the exact bug reported.
    // So for a running task, Start Time is the only thing exposed — it alone determines the live
    // duration (now - start), by anchoring last_action_time to the same edited start with a 0
    // baseline. For a stopped task (paused/break/completed/pending), nothing is ticking, so both
    // fields are safe to edit directly and duration = last action - start, exactly as requested.
    const isLiveTask = editingTask?.status === 'active';

    const previewSeconds = (() => {
        if (!editStart) return 0;
        const startMs = parsePSTToUTC(editStart).getTime();
        if (isLiveTask) {
            return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        }
        if (!editLastAction) return 0;
        const endMs = parsePSTToUTC(editLastAction).getTime();
        return Math.max(0, Math.floor((endMs - startMs) / 1000));
    })();
    const previewLabel = (() => {
        const h = Math.floor(previewSeconds / 3600);
        const m = Math.floor((previewSeconds % 3600) / 60);
        const s = previewSeconds % 60;
        return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
    })();

    const saveEdit = async () => {
        if (!editingTask || !editStart) return;
        if (!isLiveTask && !editLastAction) return;
        setIsSaving(true);
        try {
            const startIso = parsePSTToUTC(editStart).toISOString();
            const updates = isLiveTask
                ? { start_time: startIso, last_action_time: startIso, active_seconds: 0 }
                : (() => {
                    const lastActionIso = parsePSTToUTC(editLastAction).toISOString();
                    const newActiveSeconds = Math.max(0, Math.floor(
                        (new Date(lastActionIso).getTime() - new Date(startIso).getTime()) / 1000
                    ));
                    return { start_time: startIso, last_action_time: lastActionIso, active_seconds: newActiveSeconds };
                })();

            const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', editingTask.id);
            if (error) throw error;

            await (supabase.from('activity_logs') as any).insert({
                worker_id: editingTask.assigned_to_id,
                event_type: 'task_edit',
                description: `${editingTask.description} — duration adjusted`,
                details: 'Start/Last Action time edited',
                related_task_id: editingTask.id,
                timestamp: new Date().toISOString(),
                performed_by_name: currentUserName
            });

            closeEdit();
            onRefresh();
        } catch (err) {
            console.error('Failed to edit MO task duration:', err);
            alert('Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteTask = async (task: any) => {
        if (!confirm(`Delete this MO entry — ${task.mo_reference} / ${task.description} for ${task.worker_name}? This cannot be undone.`)) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', task.id);
            if (error) throw error;
            onRefresh();
        } catch (err) {
            console.error('Failed to delete MO task:', err);
            alert('Failed to delete this entry.');
        }
    };

    const filtered = moTasks.filter(task => {
        const term = search.toLowerCase();
        const matchesSearch = !term ||
            (task.mo_reference || '').toLowerCase().includes(term) ||
            (task.description || '').toLowerCase().includes(term) ||
            (task.worker_name || '').toLowerCase().includes(term);

        const matchesWorker = workerFilter === 'all' || task.worker_name === workerFilter;

        let matchesDate = true;
        const taskDate = new Date(task.created_at || task.start_time);
        if (startDate && taskDate < getPSTBound(startDate, false)) matchesDate = false;
        if (endDate && taskDate > getPSTBound(endDate, true)) matchesDate = false;

        return matchesSearch && matchesWorker && matchesDate;
    }).sort((a, b) => {
        const dateA = a.created_at || a.start_time || '';
        const dateB = b.created_at || b.start_time || '';
        return dateB.localeCompare(dateA);
    });

    return (
        <>
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input
                        type="text"
                        placeholder={t('table.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.25rem', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--bg-body)', color: 'var(--text-main)' }}
                    />
                </div>

                <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--bg-body)', color: 'var(--text-main)' }}>
                    <option value="all">{t('table.allWorkers')}</option>
                    {employees.filter((e: any) => e.active !== false).map((e: any) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-body)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('table.from')}</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-body)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('table.to')}</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)' }} />
                </div>
            </div>

            <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-body)', borderBottom: '2px solid var(--border)' }}>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)', background: 'var(--bg-body)' }}>{t('table.columns.workerId')}</th>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)', left: '100px', background: 'var(--bg-body)' }}>{t('table.columns.name')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.mo')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.operation')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.startTime')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.lastAction')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.duration')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.mo.cost')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.status')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.mo.auditRecord')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.edit')}</th>
                        </tr>
                    </thead>
                    <tbody style={{ background: 'var(--bg-card)' }}>
                        {filtered.length === 0 && (
                            <tr><td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('table.mo.noResults')}</td></tr>
                        )}
                        {filtered.map(task => {
                            const trail = getTaskAuditTrail(task);
                            return (
                                <tr key={task.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-main)' }}>
                                    <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)', fontFamily: `'JetBrains Mono', monospace`, background: 'var(--bg-card)' }}>{task.worker_id_str}</td>
                                    <td className="sticky-column" style={{ padding: '0.75rem 1rem', left: '100px', background: 'var(--bg-card)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '32px', height: '32px', background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                                                {task.worker_avatar}
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{task.worker_name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}><span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>{task.mo_reference}</span></td>
                                    <td style={{ padding: '0.75rem 1rem' }}>{task.description}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{formatDateTime(task.start_time || task.created_at)}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{task.status === 'completed' && task.last_action_time ? formatDateTime(task.last_action_time) : '-'}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{formatDuration(task)}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>${getTaskCost(task).toFixed(2)}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>{getStatusLabel(task.status)}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {trail.length === 0 ? (
                                            <span style={{ fontStyle: 'italic' }}>{t('table.mo.noAuditYet')}</span>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {trail.map((ev, i) => (
                                                    <div key={i}>
                                                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{ev.action}</span> by <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{ev.actor}</span> — {ev.time}
                                                        {ev.reason && <span> ({ev.reason})</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => openEdit(task)}
                                            className="icon-btn"
                                            title={t('table.columns.edit')}
                                            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                        >
                                            <i className="fa-solid fa-pen-to-square"></i>
                                        </button>
                                        <button
                                            onClick={() => deleteTask(task)}
                                            className="icon-btn delete"
                                            title={t('common.delete')}
                                            style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                        >
                                            <i className="fa-regular fa-trash-can"></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editingTask && (
                <>
                    <div className="overlay active" style={{ zIndex: 3000 }} onClick={closeEdit}></div>
                    <div className="offcanvas show" style={{
                        right: 'auto', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                        width: '480px', maxWidth: '90vw', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                        borderRadius: '12px', opacity: 1, zIndex: 3001, background: 'var(--bg-card)', position: 'fixed',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)'
                    }}>
                        <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                {editingTask.description} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>({editingTask.worker_name})</span>
                            </h3>
                            <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div className="offcanvas-body" style={{ padding: '0 1.5rem 1.5rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)', fontSize: '0.85rem' }}>{t('table.columns.startTime')}</label>
                                <input
                                    type="datetime-local"
                                    value={editStart}
                                    onChange={e => setEditStart(e.target.value)}
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            {isLiveTask ? (
                                <div style={{ marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                                    <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                                    {t('table.mo.liveTaskEditNote')}
                                </div>
                            ) : (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)', fontSize: '0.85rem' }}>{t('table.columns.lastAction')}</label>
                                    <input
                                        type="datetime-local"
                                        value={editLastAction}
                                        onChange={e => setEditLastAction(e.target.value)}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                    />
                                </div>
                            )}

                            <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('table.columns.duration')}</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary)' }}>{previewLabel}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={closeEdit} disabled={isSaving}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" onClick={saveEdit} disabled={isSaving || !editStart || (!isLiveTask && !editLastAction)}>
                                    {isSaving ? t('common.saving') : t('common.saveChanges')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
