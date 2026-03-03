import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { performTaskAction } from '../lib/taskService';
import type { Task, User, ManufacturingOrder } from '../types';
import { sortManufacturingOrders } from '../utils/moSorting';

export const ControlMatrixPage: React.FC = () => {
    const [mos, setMos] = useState<any[]>([]);
    const [operations, setOperations] = useState<string[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{ mo: string, op: string, product: string } | null>(null);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);

    // Pause Reason Modal State
    const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
    const [pauseTaskId, setPauseTaskId] = useState<string | null>(null);
    const [pauseReason, setPauseReason] = useState('');
    // const [pauseError, setPauseError] = useState('');

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchData(true);
        const interval = setInterval(() => {
            setTasks(prev => [...prev]); // Trigger re-render for timers
        }, 1000); // 1s interval for UI timers
        // Also refetch data periodically to sync with other clients
        const dataInterval = setInterval(() => fetchData(false), 5000);
        return () => { clearInterval(interval); clearInterval(dataInterval); };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowWorkerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async (showLoading = false) => {
        if (showLoading) setIsLoading(true);
        try {
            const { data: moData } = await supabase.from('manufacturing_orders').select('*');
            const { data: opData } = await supabase.from('operations').select('*').order('sort_order', { ascending: true });
            const { data: empData } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true });
            const { data: taskData } = await supabase.from('tasks').select('*');

            if (moData) {
                const sortedMos = sortManufacturingOrders(moData as ManufacturingOrder[]);
                setMos(sortedMos);
            }
            if (opData) setOperations(opData.map((o: any) => o.name));
            if (empData) setEmployees(empData as User[]);
            if (taskData) setTasks(taskData as Task[]);
        } catch (err) {
            console.error('Error fetching matrix data:', err);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    const getTasksForCell = (moRef: string, opName: string) => {
        return tasks.filter(t => t.mo_reference === moRef && t.description === opName && t.status !== 'completed');
    };

    const handleCellClick = (moNumber: string, opName: string, productName: string) => {
        setSelectedCell({ mo: moNumber, op: opName, product: productName || 'Unnamed Product' });
        setIsAssignOpen(true);
        // Reset local state
        setSelectedWorkerId('');
        setShowWorkerDropdown(false);
    };

    const closeAssign = () => {
        setIsAssignOpen(false);
        setSelectedCell(null);
    };

    const handleWorkerSelect = (emp: User) => {
        setSelectedWorkerId(emp.id);
        setShowWorkerDropdown(false);
    };

    const assignSingleWorker = async () => {
        if (!selectedCell || !selectedWorkerId) return;

        setIsSaving(true);
        try {
            // Unused 'worker' removed
            const worker = employees.find(e => e.id === selectedWorkerId);
            const rate = worker?.hourly_rate || 0;

            // Check if active task exists for this worker in this cell
            const existing = tasks.find(t =>
                t.mo_reference === selectedCell.mo &&
                t.description === selectedCell.op &&
                t.assigned_to_id === selectedWorkerId &&
                t.status !== 'completed'
            );

            if (existing) {
                alert('Worker is already assigned to this operation!');
                setIsSaving(false);
                return;
            }

            const newTask = {
                assigned_to_id: selectedWorkerId,
                mo_reference: selectedCell.mo,
                description: selectedCell.op,
                status: 'pending', // Waiting to start
                active_seconds: 0,
                hourly_rate: rate,
                start_time: null
            };

            // Using 'any' cast to bypass strict typing issues with Supabase generated types if they are out of sync
            const { error } = await (supabase.from('tasks') as any).insert(newTask);
            if (error) throw error;

            fetchData();
        } catch (e: any) {
            alert('Error assigning worker: ' + e.message);
        } finally {
            setIsSaving(false);
            // Don't close modal to allow assigning more
            setSelectedWorkerId('');
        }
    };

    /* const deleteTask = async (taskId: string) => {
        if (!confirm('Remove this assignment?')) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) throw error;
            await fetchData(false);
        } catch (err) {
            console.error('Error deleting task:', err);
        }
    }; */

    const handleTaskAction = async (task: Task, action: 'start' | 'pause' | 'resume' | 'complete', reason?: string) => {
        // Check if worker is on break
        const worker = employees.find(e => e.id === task.assigned_to_id);
        if (worker && worker.availability === 'break' && (action === 'start' || action === 'resume')) {
            alert(`Cannot ${action} task. ${worker.name} is currently on break.`);
            return;
        }

        // Use the centralized service
        await performTaskAction(task, action, reason);
        await fetchData(false);
    };

    const openPauseModal = (taskId: string) => {
        setPauseTaskId(taskId);
        setPauseReason(''); // Reset reason
        // setPauseError('');
        setIsPauseModalOpen(true);
    };

    const confirmPauseManual = async () => {
        if (!pauseTaskId) return;
        const task = tasks.find(t => t.id === pauseTaskId);
        if (!task) return;

        // Manual pause via modal
        await handleTaskAction(task, 'pause', pauseReason || 'Manual Pause');
        setIsPauseModalOpen(false);
        setPauseTaskId(null);
    };

    const formatCurrentTime = (task: Task) => {
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

    const getStatusIndicator = (status: string) => {
        const s = (status || 'pending').toLowerCase();
        let color = '#94A3B8'; // gray
        let label = s.toUpperCase();

        if (s === 'active') { color = '#22C55E'; label = 'ACTIVE'; }
        if (s === 'break') { color = '#F59E0B'; label = 'ON BREAK'; } // Auto-paused
        if (s === 'paused') { color = '#F59E0B'; label = 'PAUSED'; }
        if (s === 'completed') { color = '#10B981'; label = 'DONE'; }

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${color}15`, padding: '4px 8px', borderRadius: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: color, letterSpacing: '0.02em' }}>{label}</span>
            </div>
        );
    };

    if (isLoading) return <div className="loading-screen">Loading Matrix...</div>;

    const selectedWorker = employees.find(e => e.id === selectedWorkerId);

    // Filter for Dropdown: Only Present Employees
    const presentEmployees = employees.filter(e => e.status === 'present');

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Production Control Matrix</h1>
                    <p className="page-subtitle">Click any cell to assign workers and control timers</p>
                </div>
            </div>

            <div className="matrix-container">
                <div className="matrix-grid">
                    <div className="matrix-row">
                        <div className="matrix-header-cell" style={{ textAlign: 'left', paddingLeft: '20px' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                <i className="fa-regular fa-clipboard"></i> Manufacturing Orders
                            </span>
                        </div>
                        {operations.map(op => (
                            <div key={op} className="matrix-header-cell">
                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{op}</div>
                            </div>
                        ))}
                    </div>

                    {mos.map(mo => (
                        <div key={mo.id} className="matrix-row" id={`mo-${mo.mo_number}`}>
                            <div className="matrix-label-cell" style={{ width: '200px' }}>
                                <Link to="/manufacturing-orders" className="mo-badge" style={{ textDecoration: 'none' }}>{mo.mo_number}</Link>
                                <div
                                    className="mo-details"
                                    title={mo.product_name}
                                    style={{
                                        fontSize: '0.9rem',
                                        fontWeight: 800,
                                        color: '#000000',
                                        marginTop: '4px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '180px', // Explicit max-width slightly less than parent
                                        display: 'block'
                                    }}>
                                    {mo.product_name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {mo.po_number && <div><span style={{ fontWeight: 600 }}>PO:</span> {mo.po_number}</div>}
                                    {mo.sku && <div><span style={{ fontWeight: 600 }}>SKU:</span> {mo.sku}</div>}
                                    {mo.scheduled_date && <div><span style={{ fontWeight: 600 }}>Scheduled:</span> {mo.scheduled_date}</div>}
                                    <div><span style={{ fontWeight: 600 }}>Qty:</span> {mo.quantity || 0}</div>
                                    <div><span className={`status-badge badge-${(mo.current_status || 'draft').toLowerCase()}`}>{mo.current_status}</span></div>
                                </div>
                            </div>

                            {
                                operations.map(op => {
                                    const cellTasks = getTasksForCell(mo.mo_number, op);
                                    const hasActive = cellTasks.some(t => t.status === 'active');
                                    return (
                                        <div
                                            key={op}
                                            className={`matrix-cell ${cellTasks.length > 0 ? 'active-cell' : ''} ${hasActive ? 'timer-running' : ''}`}
                                            onClick={() => handleCellClick(mo.mo_number, op, mo.product_name)}
                                        >
                                            {cellTasks.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                        {cellTasks.length} workers
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
                                                        {cellTasks.slice(0, 3).map(t => {
                                                            const worker = employees.find(e => e.id === t.assigned_to_id);
                                                            return (
                                                                <div key={t.id} className="worker-avatar" title={worker?.name}>
                                                                    {worker?.name?.[0] || '?'}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="matrix-cell-empty">Assign</div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    ))}
                </div>
            </div >

            {/* Assignments Modal */}
            < div className={`assign-modal ${isAssignOpen ? 'active' : ''}`
            } style={{
                width: '640px', maxHeight: '85vh', position: 'fixed', left: '50%', top: '50%',
                transform: `translate(-50%, -50%) scale(${isAssignOpen ? 1 : 0.9})`,
                opacity: isAssignOpen ? 1 : 0, pointerEvents: isAssignOpen ? 'auto' : 'none',
                background: '#ffffff', borderRadius: '20px', zIndex: 2600,
                display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', color: '#0F172A', fontWeight: 700 }}>{selectedCell?.product}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                            <span className="badge badge-blue">{selectedCell?.mo}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>/ {selectedCell?.op}</span>
                        </div>
                    </div>
                    <button className="close-btn" onClick={closeAssign}><i className="fa-solid fa-xmark"></i></button>
                </div>

                <div className="offcanvas-body" style={{ padding: '1.5rem', background: '#F8FAFC', flex: 1, overflowY: 'auto', minHeight: '400px' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Add Worker</h3>
                        <div style={{ background: 'white', padding: '0.4rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ flex: 1, position: 'relative', minWidth: 0 }} ref={dropdownRef}>
                                <div
                                    onClick={() => setShowWorkerDropdown(!showWorkerDropdown)}
                                    style={{ height: '48px', padding: '0 0.75rem', borderRadius: '8px', background: selectedWorkerId ? '#F1F5F9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                                >
                                    <span style={{ fontSize: '0.9rem', color: selectedWorkerId ? '#0F172A' : '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedWorker ? selectedWorker.name : 'Select worker...'}</span>
                                    <i className="fa-solid fa-chevron-down" style={{ color: '#94A3B8', fontSize: '0.75rem', marginLeft: '8px' }}></i>
                                </div>

                                {showWorkerDropdown && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '100%', minWidth: '250px', background: 'white', borderRadius: '10px', boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.04)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                                        {presentEmployees.length > 0 ? presentEmployees.map(emp => (
                                            <div key={emp.id} onClick={() => handleWorkerSelect(emp)} style={{ padding: '10px 14px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1E293B' }}>{emp.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>${emp.hourly_rate}/hr</span>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '12px', color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center' }}>No workers clocked in</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button className="btn btn-primary" onClick={assignSingleWorker} disabled={isSaving || !selectedWorkerId} style={{ height: '48px', padding: '0 1.5rem' }}>Assign</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {selectedCell && getTasksForCell(selectedCell.mo, selectedCell.op).map(task => {
                            const worker = employees.find(e => e.id === task.assigned_to_id);
                            return (
                                <div key={task.id} className="worker-card" style={{
                                    background: 'white',
                                    borderRadius: '16px',
                                    padding: '1rem 1.25rem',
                                    border: '1px solid #E2E8F0',
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    height: '80px' // Fixed height for consistency
                                }}>
                                    {/* Left: Avatar & Info */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '50%',
                                            background: 'var(--primary)',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            flexShrink: 0 // Prevent oval shape
                                        }}>
                                            {worker?.name?.[0] || '?'}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{worker?.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>${task.hourly_rate}/hr</span>
                                                {getStatusIndicator(task.status)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Center: Timer (Absolute) */}
                                    <div data-testid="timer-display" className="timer-display" style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        fontFamily: 'monospace',
                                        color: '#1E293B',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1,
                                        background: '#F8FAFC',
                                        padding: '4px 12px',
                                        borderRadius: '8px'
                                    }}>
                                        {formatCurrentTime(task)}
                                    </div>

                                    {/* Right: Buttons (Absolute) */}
                                    <div className="action-toolbar" style={{
                                        position: 'absolute',
                                        right: '1.25rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        display: 'flex',
                                        gap: '0.75rem',
                                        zIndex: 2
                                    }}>
                                        {/* Logic: If pending or paused or resume from break -> Start/Resume (Play) */}
                                        {/* If active -> Pause or Complete */}

                                        {(task.status === 'pending' || task.status === 'paused' || task.status === 'break') && (
                                            <button title="Start / Resume" onClick={() => handleTaskAction(task, task.status === 'pending' ? 'start' : 'resume')} style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                                <i className="fa-solid fa-play"></i>
                                            </button>
                                        )}

                                        {task.status === 'active' && (
                                            <>
                                                <button title="Pause" onClick={() => openPauseModal(task.id)} style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#FEF3C7', color: '#F59E0B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                                    <i className="fa-solid fa-pause"></i>
                                                </button>
                                                <button title="Complete" onClick={() => handleTaskAction(task, 'complete')} style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                                    <i className="fa-solid fa-check"></i>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div >

            {/* Manual Pause Modal */}
            < div className={`modal-backdrop ${isPauseModalOpen ? 'active' : ''}`
            } style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.5)', zIndex: 3000,
                display: isPauseModalOpen ? 'flex' : 'none',
                alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    background: 'white',
                    width: '400px',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    position: 'relative',
                    zIndex: 3001
                }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0F172A' }}>Pause Task</h3>
                    <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: '1.4' }}>Enter a reason for pausing this task (optional).</p>

                    <textarea
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                        placeholder="e.g. Machine Maintenance"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            marginBottom: '1.5rem',
                            minHeight: '100px',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem',
                            resize: 'vertical'
                        }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <button
                            onClick={() => setIsPauseModalOpen(false)}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                background: 'white',
                                color: '#475569',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmPauseManual}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#0F172A',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Confirm Pause
                        </button>
                    </div>
                </div>
            </div >
        </>
    );
};
