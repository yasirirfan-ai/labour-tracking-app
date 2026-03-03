import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sortManufacturingOrders } from '../utils/moSorting';

export const ControlTablePage: React.FC = () => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [mos, setMos] = useState<any[]>([]);
    const [operations, setOperations] = useState<any[]>([]);
    // isLoading removed as unused

    // Filters
    const [search, setSearch] = useState('');
    const [workerFilter, setWorkerFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Edit Modal State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        created_at: '',
        start_time: '',
        end_time: '',
        last_action_time: '',
        status: '',
        active_hours: 0,
        active_minutes: 0,
        hourly_rate: 0
    });

    // Create Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        worker_id: '',
        mo_reference: '',
        description: '', // Operation name
        created_at: '', // Clock In
        start_time: '',
        end_time: '',
        last_action_time: '',
        status: 'pending',
        active_hours: 0,
        active_minutes: 0,
        hourly_rate: 0
    });

    const [activeChip, setActiveChip] = useState('Today'); // Move useState to top level

    // Auto-calculate duration for Manual Entry
    useEffect(() => {
        if (createForm.start_time && (createForm.end_time || createForm.last_action_time)) {
            const start = new Date(createForm.start_time);
            // Use end_time, fallback to last_action_time
            const end = new Date(createForm.end_time || createForm.last_action_time);

            // Calculate if valid dates
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                // If negative (End < Start), treat as 0 duration
                const totalMinutes = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;

                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;

                setCreateForm(prev => {
                    // Only update if values are different to avoid potential loops (though dependency array handles this)
                    if (prev.active_hours === hours && prev.active_minutes === minutes) return prev;
                    return {
                        ...prev,
                        active_hours: hours,
                        active_minutes: minutes
                    };
                });
            }
        }
    }, [createForm.start_time, createForm.end_time, createForm.last_action_time]);

    // Auto-calculate duration for Edit Entry
    useEffect(() => {
        if (editForm.start_time && (editForm.end_time || editForm.last_action_time)) {
            const start = new Date(editForm.start_time);
            // Use end_time, fallback to last_action_time
            const end = new Date(editForm.end_time || editForm.last_action_time);

            // Calculate if valid dates
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                // If negative (End < Start), treat as 0 duration
                const totalMinutes = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;

                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;

                setEditForm(prev => {
                    // Only update if values are different to avoid potential loops
                    if (prev.active_hours === hours && prev.active_minutes === minutes) return prev;
                    return {
                        ...prev,
                        active_hours: hours,
                        active_minutes: minutes
                    };
                });
            }
        }
    }, [editForm.start_time, editForm.end_time, editForm.last_action_time]);

    // Sync hourly rate when worker is selected in create modal
    useEffect(() => {
        if (createForm.worker_id) {
            const emp = employees.find(e => e.id === createForm.worker_id);
            if (emp) {
                setCreateForm(prev => ({ ...prev, hourly_rate: emp.hourly_rate || 0 }));
            }
        }
    }, [createForm.worker_id, employees]);


    const fetchData = async () => {
        try {
            const { data: taskData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }) as { data: any[] };
            const { data: empData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: moData } = await supabase.from('manufacturing_orders').select('*').order('created_at', { ascending: false });
            const { data: opData } = await supabase.from('operations').select('*').order('sort_order', { ascending: true });

            if (taskData && empData) {
                const richTasks = taskData.map((t: any) => {
                    const emp = empData.find(e => e.id === t.assigned_to_id);
                    return { ...t, worker_name: emp?.name || 'Unknown', worker_id_str: emp?.worker_id || '-', worker_avatar: emp?.name?.[0] || '?' };
                });
                setTasks(richTasks);
                setEmployees(empData);
            }
            if (moData) {
                const sortedMos = sortManufacturingOrders(moData as any[]);
                setMos(sortedMos);
            }
            if (opData) setOperations(opData);

        } catch (err) {
            console.error('Error fetching table data:', err);
        } finally {
            // Loading state removed
        }
    };

    const formatCurrentTime = (task: any) => {
        let total = task.active_seconds || 0;
        if (task.status === 'active' && task.last_action_time) {
            const diff = Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000);
            if (diff > 0) total += diff;
        }
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
    };

    const formatTimeOnly = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();
    };

    const formatDateTime = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return d.toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).toUpperCase();
    };

    const getStatusLabel = (status: string) => {
        const s = status?.toLowerCase();
        if (s === 'active') return <span className="status-badge badge-green" style={{ fontSize: '0.7rem' }}>TIMER RUNNING</span>;
        if (s === 'clocked_in') return <span className="status-badge badge-blue" style={{ fontSize: '0.7rem' }}>CLOCKED IN</span>;
        if (s === 'break') return <span className="status-badge badge-yellow" style={{ fontSize: '0.7rem' }}>ON BREAK</span>;
        if (s === 'completed') return <span className="status-badge badge-gray" style={{ fontSize: '0.7rem' }}>COMPLETED</span>;
        return <span className="status-badge badge-gray" style={{ fontSize: '0.7rem' }}>PENDING</span>;
    };

    const handleEditClick = (task: any) => {
        setEditingTask(task);

        // Convert seconds to H:M
        const totalSec = task.active_seconds || 0;
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);

        setEditForm({
            created_at: task.created_at ? task.created_at.substring(0, 16) : '',
            start_time: task.start_time ? task.start_time.substring(0, 16) : '',
            end_time: task.end_time ? task.end_time.substring(0, 16) : '',
            last_action_time: task.last_action_time ? task.last_action_time.substring(0, 16) : '',
            status: task.status,
            active_hours: h,
            active_minutes: m,
            hourly_rate: task.hourly_rate || 0
        });
        setIsEditOpen(true);
    };

    const handleUpdateTask = async () => {
        if (!editingTask) return;

        // Check if worker is on break when setting to active
        if (editForm.status === 'active') {
            const worker = employees.find(e => e.id === editingTask.assigned_to_id);
            if (worker && worker.availability === 'break') {
                alert(`Cannot start timer. ${worker.name} is currently on break.`);
                return;
            }
        }

        // Calculate active_seconds logic:
        // Prioritize actual time difference if start and end are provided
        // Otherwise fallback to manual duration inputs
        let totalSeconds = 0;
        if (editForm.start_time && editForm.end_time) {
            const start = new Date(editForm.start_time).getTime();
            const end = new Date(editForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalSeconds = Math.floor((end - start) / 1000);
            } else {
                // Fallback if invalid range
                totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
            }
        } else {
            // No end time, trust the manual duration
            totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
        }

        // Prepare updates
        const updates: any = {
            status: editForm.status,
            active_seconds: totalSeconds,
            created_at: editForm.created_at ? new Date(editForm.created_at).toISOString() : editingTask.created_at,
            start_time: editForm.start_time ? new Date(editForm.start_time).toISOString() : null,
            last_action_time: editForm.last_action_time ? new Date(editForm.last_action_time).toISOString() : editingTask.last_action_time,
            hourly_rate: editForm.hourly_rate,
        };

        // If end_time is provided, force status to completed so it saves correctly
        if (editForm.end_time) {
            updates.end_time = new Date(editForm.end_time).toISOString();
            // If last action time wasn't manually set, sync it with end time
            if (!editForm.last_action_time) {
                updates.last_action_time = updates.end_time;
            }
            updates.status = 'completed';
        } else if (editForm.status !== 'completed') {
            updates.end_time = null; // Clear end time if not completed
        }

        try {
            const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', editingTask.id);
            if (error) throw error;
            setIsEditOpen(false);
            fetchData();
        } catch (e: any) {
            alert('Error updating task: ' + e.message);
        }
    };

    const handleCreateClick = () => {
        setCreateForm({
            worker_id: '',
            mo_reference: '',
            description: '',
            // Use local time for default
            created_at: (() => {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                return now.toISOString().slice(0, 16);
            })(),
            start_time: (() => {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                return now.toISOString().slice(0, 16);
            })(),
            end_time: '',
            last_action_time: '',
            status: 'pending',
            active_hours: 0,
            active_minutes: 0,
            hourly_rate: 0
        });
        setIsCreateOpen(true);
    };

    const handleCreateTask = async () => {
        if (!createForm.worker_id || !createForm.mo_reference || !createForm.description) {
            alert("Please select Worker, MO, and Operation");
            return;
        }

        const emp = employees.find(e => e.id === createForm.worker_id);

        if (createForm.status === 'active' && emp?.availability === 'break') {
            alert(`Cannot start timer. ${emp.name} is currently on break.`);
            return;
        }

        // Calculate active_seconds logic:
        // Prioritize actual time difference if start and end are provided
        // Otherwise fallback to manual duration inputs
        let totalSeconds = 0;
        if (createForm.start_time && createForm.end_time) {
            const start = new Date(createForm.start_time).getTime();
            const end = new Date(createForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalSeconds = Math.floor((end - start) / 1000);
            } else {
                // Fallback
                totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
            }
        } else {
            totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
        }

        const newTask: any = {
            assigned_to_id: createForm.worker_id,
            mo_reference: createForm.mo_reference,
            description: createForm.description,
            status: createForm.status,
            active_seconds: totalSeconds,
            created_at: createForm.created_at ? new Date(createForm.created_at).toISOString() : new Date().toISOString(),
            start_time: createForm.start_time ? new Date(createForm.start_time).toISOString() : null,
            last_action_time: createForm.last_action_time ? new Date(createForm.last_action_time).toISOString() : null,
            hourly_rate: createForm.hourly_rate,
            break_seconds: 0,
            manual: true
        };

        if (createForm.end_time) {
            newTask.end_time = new Date(createForm.end_time).toISOString();
            // If last action time wasn't manually set, sync it with end time
            if (!createForm.last_action_time) {
                newTask.last_action_time = newTask.end_time;
            }
            newTask.status = 'completed'; // Force completed status if end time is present
        } else if (createForm.start_time && !createForm.last_action_time) {
            newTask.last_action_time = newTask.start_time;
        }

        try {
            const { error } = await (supabase.from('tasks') as any).insert(newTask);
            if (error) throw error;
            setIsCreateOpen(false);
            fetchData();
        } catch (e: any) {
            alert('Error creating task: ' + e.message);
        }
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = (t.mo_reference || '').toLowerCase().includes(search.toLowerCase()) ||
            (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
            (t.worker_name || '').toLowerCase().includes(search.toLowerCase());

        const matchesWorker = workerFilter === 'all' || t.worker_name === workerFilter;

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'timer running' && t.status === 'active') ||
            (statusFilter === 'on break' && t.status === 'break') ||
            (statusFilter === 'clocked in' && t.status === 'clocked_in') ||
            (statusFilter === 'completed' && t.status === 'completed') ||
            (statusFilter === 'pending' && t.status === 'pending');

        let matchesDate = true;
        if (startDate) {
            const taskDate = new Date(t.created_at || t.start_time);
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (taskDate < start) matchesDate = false;
        }
        if (endDate) {
            const taskDate = new Date(t.created_at || t.start_time);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (taskDate > end) matchesDate = false;
        }

        return matchesSearch && matchesWorker && matchesStatus && matchesDate;
    });

    // if (isLoading) return <div className="loading-screen">Loading Table...</div>;




    const applyDateFilter = (filterType: string) => {
        const now = new Date();
        let start = '';
        let end = '';

        if (filterType === 'All') {
            start = '';
            end = '';
        } else if (filterType === 'Today') {
            start = now.toISOString().split('T')[0];
            end = now.toISOString().split('T')[0];
        } else if (filterType === 'This Week') {
            const first = now.getDate() - now.getDay();
            const last = first + 6;
            const firstDay = new Date(now.setDate(first));
            const lastDay = new Date(now.setDate(last));
            start = firstDay.toISOString().split('T')[0];
            end = lastDay.toISOString().split('T')[0];
        } else if (filterType === 'Last Week') {
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const first = lastWeek.getDate() - lastWeek.getDay();
            const last = first + 6;
            const firstDay = new Date(lastWeek.setDate(first));
            const lastDay = new Date(lastWeek.setDate(last));
            start = firstDay.toISOString().split('T')[0];
            end = lastDay.toISOString().split('T')[0];
        } else if (filterType === 'This Month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            start = firstDay.toISOString().split('T')[0];
            end = lastDay.toISOString().split('T')[0];
        } else if (filterType === 'Last Month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            start = firstDay.toISOString().split('T')[0];
            end = lastDay.toISOString().split('T')[0];
        }

        setStartDate(start);
        setEndDate(end);
        setActiveChip(filterType);
    };

    const resetFilters = () => {
        setSearch('');
        setWorkerFilter('all');
        setStatusFilter('all');
        applyDateFilter('All'); // Changed to 'All'
    };

    useEffect(() => {
        // Initial date filter application
        applyDateFilter('All'); // Changed to 'All'

        fetchData();
        const interval = setInterval(() => {
            setTasks(prev => [...prev]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Control Table</h1>
                    <p className="page-subtitle">Real-time tracking of worker task activities (PST Timezone)</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreateClick} style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
                    <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i> Manual Entry
                </button>
            </div>

            {/* Search Filter Bar (Restored Inline Styles) */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}></i>
                    <input
                        type="text"
                        placeholder="Search MO, Operation, or Worker..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.25rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                    />
                </div>

                <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', background: 'white' }}>
                    <option value="all">All Workers</option>
                    {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>

                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', background: 'white' }}>
                    <option value="all">All Statuses</option>
                    <option value="timer running">Timer Running</option>
                    <option value="clocked in">Clocked In</option>
                    <option value="on break">On Break</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F8FAFC', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>From:</span>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#475569' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F8FAFC', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>To:</span>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#475569' }} />
                </div>

                <button className="btn btn-secondary" onClick={resetFilters} style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                    Reset
                </button>
            </div>

            {/* Date Filter Chips Row - BELOW Search Bar */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', paddingLeft: '0.25rem' }}>
                {['All', 'Today', 'This Week', 'Last Week', 'This Month', 'Last Month'].map(label => {
                    const isActive = activeChip === label;
                    return (
                        <button
                            key={label}
                            onClick={() => applyDateFilter(label)}
                            className={`chip-btn ${isActive ? 'active' : ''}`}
                            style={{
                                padding: '0.5rem 1.25rem',
                                borderRadius: '50px',
                                border: isActive ? 'none' : '1px solid #E2E8F0',
                                background: isActive ? 'var(--primary)' : 'white',
                                color: isActive ? 'white' : '#64748B',
                                fontSize: '0.85rem',
                                fontWeight: isActive ? 600 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: isActive ? '0 4px 6px -1px rgba(30, 41, 59, 0.2)' : 'none'
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <div className="section-card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Worker ID</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Name</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>MO</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Operation</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Clock In</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Start Time</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Clock Out</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Last Action</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Duration</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Status</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Edit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map(task => (
                                <tr key={task.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#64748B', fontFamily: `'JetBrains Mono', monospace` }}>{task.worker_id_str}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '32px', height: '32px', background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem' }}>
                                                {task.worker_avatar}
                                            </div>
                                            <span style={{ fontWeight: 600, color: '#1E293B' }}>{task.worker_name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>{task.mo_reference}</span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{task.description}</td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatDateTime(task.created_at)}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatTimeOnly(task.start_time)}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatDateTime(task.end_time)}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatTimeOnly(task.last_action_time)}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontFamily: `'JetBrains Mono', monospace`, color: '#334155', fontWeight: 600 }}>
                                                {formatCurrentTime(task)}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>{getStatusLabel(task.status)}</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleEditClick(task)}
                                            className="icon-btn"
                                            style={{ color: '#475569', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                        >
                                            <i className="fa-solid fa-pen-to-square"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal (Compact) */}
            <div className={`offcanvas ${isEditOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: '700px', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '12px', opacity: isEditOpen ? 1 : 0,
                pointerEvents: isEditOpen ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Edit Task Entry</h3>
                    <button className="close-btn" onClick={() => setIsEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="offcanvas-body" style={{ padding: '0 1.5rem 1.5rem' }}>
                    {editingTask && (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Worker</div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{editingTask.worker_name}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Task</div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{editingTask.description}</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Clock In</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.created_at}
                                        onChange={e => setEditForm(prev => ({ ...prev, created_at: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Start Time</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.start_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, start_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Clock Out</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.end_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, end_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Last Action</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.last_action_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, last_action_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Total Duration (Allocated)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            value={editForm.active_hours}
                                            onChange={e => setEditForm(prev => ({ ...prev, active_hours: parseInt(e.target.value) || 0 }))}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: '#64748B' }}>hrs</span>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            value={editForm.active_minutes}
                                            onChange={e => setEditForm(prev => ({ ...prev, active_minutes: parseInt(e.target.value) || 0 }))}
                                            max="59"
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: '#64748B' }}>mins</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Hourly Rate ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editForm.hourly_rate}
                                        onChange={e => setEditForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Status</label>
                                    <select
                                        value={editForm.status}
                                        onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="clocked_in">Clocked In</option>
                                        <option value="active">Timer Running</option>
                                        <option value="break">On Break</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setIsEditOpen(false)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleUpdateTask} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Update Entry</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Manual Entry Modal */}
            <div className={`offcanvas ${isCreateOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: '700px', height: 'auto',
                borderRadius: '12px', opacity: isCreateOpen ? 1 : 0,
                pointerEvents: isCreateOpen ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Manual Entry</h3>
                    <button className="close-btn" onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="offcanvas-body" style={{ padding: '0 1.5rem 1.5rem' }}>
                    <div style={{ display: 'grid', gap: '1rem' }}>

                        {/* Row 1: Worker & MO */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Worker</label>
                                <select
                                    value={createForm.worker_id}
                                    onChange={e => setCreateForm(prev => ({ ...prev, worker_id: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                >
                                    <option value="">Select Worker...</option>
                                    {employees.map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Manufacturing Order</label>
                                <select
                                    value={createForm.mo_reference}
                                    onChange={e => setCreateForm(prev => ({ ...prev, mo_reference: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                >
                                    <option value="">Select MO...</option>
                                    {mos.map(m => (
                                        <option key={m.id} value={m.mo_number}>{m.mo_number} - {m.product_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Operation, Status & Rate */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Operation</label>
                                <select
                                    value={createForm.description}
                                    onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                >
                                    <option value="">Select Operation...</option>
                                    {operations.map(o => (
                                        <option key={o.id} value={o.name}>{o.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Initial Status</label>
                                <select
                                    value={createForm.status}
                                    onChange={e => setCreateForm(prev => ({ ...prev, status: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="clocked_in">Clocked In</option>
                                    <option value="active">Timer Running</option>
                                    <option value="break">On Break</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Hourly Rate ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={createForm.hourly_rate}
                                    onChange={e => setCreateForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>
                        </div>

                        {/* Row 3: Times */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Clock In</label>
                                <input
                                    type="datetime-local"
                                    value={createForm.created_at}
                                    onChange={e => setCreateForm(prev => ({ ...prev, created_at: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Start Time</label>
                                <input
                                    type="datetime-local"
                                    value={createForm.start_time}
                                    onChange={e => setCreateForm(prev => ({ ...prev, start_time: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Clock Out</label>
                                <input
                                    type="datetime-local"
                                    value={createForm.end_time}
                                    onChange={e => setCreateForm(prev => ({ ...prev, end_time: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Last Action</label>
                                <input
                                    type="datetime-local"
                                    value={createForm.last_action_time}
                                    onChange={e => setCreateForm(prev => ({ ...prev, last_action_time: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>
                        </div>

                        {/* Row 4: Duration */}
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>Total Duration (Initial)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        value={createForm.active_hours}
                                        onChange={e => setCreateForm(prev => ({ ...prev, active_hours: parseInt(e.target.value) || 0 }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: '#64748B' }}>hrs</span>
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        value={createForm.active_minutes}
                                        onChange={e => setCreateForm(prev => ({ ...prev, active_minutes: parseInt(e.target.value) || 0 }))}
                                        max="59"
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: '#64748B' }}>mins</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreateTask} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Create Entry</button>
                        </div>
                    </div>
                </div>
            </div>

            {isCreateOpen && <div className="overlay active" style={{ zIndex: 3000 }} onClick={() => setIsCreateOpen(false)}></div>}

            {isEditOpen && <div className="overlay active" style={{ zIndex: 3000 }} onClick={() => setIsEditOpen(false)}></div>}
        </>
    );
};
