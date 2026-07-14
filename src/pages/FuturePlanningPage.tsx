import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Task } from '../types';

interface ManufacturingOrder {
    id: string;
    mo_number: string;
    product_name: string;
}

interface Operation {
    id: string;
    name: string;
}

export const FuturePlanningPage: React.FC = () => {
    const [employees, setEmployees] = useState<User[]>([]);
    const [mos, setMos] = useState<ManufacturingOrder[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [futureTasks, setFutureTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

    // Form state
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedMoRef, setSelectedMoRef] = useState('');
    const [selectedOpName, setSelectedOpName] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [customDetails, setCustomDetails] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data: empData } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true });
            const { data: moData } = await supabase.from('manufacturing_orders').select('*');
            const { data: opData } = await supabase.from('operations').select('*').order('sort_order', { ascending: true });
            const { data: taskData } = await supabase.from('tasks').select('*').eq('status', 'pending').like('reason', 'Scheduled Date:%').order('created_at', { ascending: false });

            if (empData) setEmployees(empData as User[]);
            if (moData) setMos(moData as ManufacturingOrder[]);
            if (opData) setOperations(opData as Operation[]);
            if (taskData) setFutureTasks(taskData as Task[]);
        } catch (err) {
            console.error('Error fetching data for future planning:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployeeId || !selectedMoRef || !selectedOpName || !selectedDate) {
            setToast({ message: 'Please select an employee, manufacturing order, operation, and scheduled date.', type: 'error' });
            setTimeout(() => setToast(null), 4000);
            return;
        }

        setIsSaving(true);
        try {
            const worker = employees.find(e => e.id === selectedEmployeeId);
            const rate = worker?.hourly_rate || 0;

            const newTask = {
                assigned_to_id: selectedEmployeeId,
                mo_reference: selectedMoRef,
                description: selectedOpName,
                status: 'pending',
                active_seconds: 0,
                hourly_rate: rate,
                start_time: null,
                reason: `Scheduled Date: ${selectedDate} | Notes: ${customDetails || 'None'}`
            };

            const { error } = await (supabase.from('tasks') as any).insert(newTask);
            if (error) throw error;

            // Reset form
            setSelectedEmployeeId('');
            setSelectedMoRef('');
            setSelectedOpName('');
            setSelectedDate(new Date().toISOString().split('T')[0]);
            setCustomDetails('');

            // Refresh table
            const { data: taskData } = await supabase.from('tasks').select('*').eq('status', 'pending').like('reason', 'Scheduled Date:%').order('created_at', { ascending: false });
            if (taskData) setFutureTasks(taskData as Task[]);

            setToast({ message: 'Task assigned successfully as a pending task.', type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast({ message: 'Error assigning task: ' + err.message, type: 'error' });
            setTimeout(() => setToast(null), 4000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (taskId: string) => {
        setDeletingTaskId(taskId);
    };

    const confirmDelete = async (taskId: string) => {
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) throw error;

            setFutureTasks(prev => prev.filter(t => t.id !== taskId));
            setToast({ message: 'Task schedule cancelled successfully.', type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast({ message: 'Error deleting task: ' + err.message, type: 'error' });
            setTimeout(() => setToast(null), 4000);
        }
    };

    const getEmployeeName = (empId: string) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? emp.name : 'Unknown Employee';
    };

    if (isLoading) return <div className="loading-screen">Loading Future Planning...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '100px' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Future Planning</h1>
                    <p className="page-subtitle">Assign future/upcoming tasks to workers and manage the scheduling pipeline.</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                {/* Form Card */}
                <div className="info-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 'fit-content' }}>
                    <div className="card-header">
                        <i className="fa-solid fa-calendar-plus" style={{ color: 'var(--primary)' }}></i>
                        <h3 style={{ color: 'var(--text-main)' }}>Assign Upcoming Task</h3>
                    </div>
                    <form onSubmit={handleAssign} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="info-field">
                            <label style={{ color: 'var(--text-muted)' }}>Select Employee</label>
                            <select
                                className="info-input"
                                value={selectedEmployeeId}
                                onChange={e => setSelectedEmployeeId(e.target.value)}
                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                            >
                                <option value="">-- Choose Employee --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="info-field">
                            <label style={{ color: 'var(--text-muted)' }}>Select Manufacturing Order</label>
                            <select
                                className="info-input"
                                value={selectedMoRef}
                                onChange={e => setSelectedMoRef(e.target.value)}
                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                            >
                                <option value="">-- Choose MO --</option>
                                {mos.map(mo => (
                                    <option key={mo.id} value={mo.mo_number}>{mo.mo_number} - {mo.product_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="info-field">
                            <label style={{ color: 'var(--text-muted)' }}>Select Operation</label>
                            <select
                                className="info-input"
                                value={selectedOpName}
                                onChange={e => setSelectedOpName(e.target.value)}
                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                            >
                                <option value="">-- Choose Operation --</option>
                                {operations.map(op => (
                                    <option key={op.id} value={op.name}>{op.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="info-field">
                            <label style={{ color: 'var(--text-muted)' }}>Scheduled Date</label>
                            <input
                                type="date"
                                className="info-input"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                required
                            />
                        </div>

                        <div className="info-field">
                            <label style={{ color: 'var(--text-muted)' }}>Scheduling Details / Notes</label>
                            <textarea
                                className="info-input"
                                value={customDetails}
                                onChange={e => setCustomDetails(e.target.value)}
                                placeholder="e.g. Scheduled for next Monday morning shift"
                                style={{ minHeight: '80px', resize: 'vertical', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSaving}
                            className="btn btn-primary"
                            style={{ padding: '0.75rem', fontWeight: 'bold' }}
                        >
                            {isSaving ? 'Assigning...' : 'Assign Task'}
                        </button>
                    </form>
                </div>

                {/* List Card */}
                <div className="info-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className="card-header">
                        <i className="fa-solid fa-list-check" style={{ color: 'var(--primary)' }}></i>
                        <h3 style={{ color: 'var(--text-main)' }}>Assigned Upcoming Tasks ({futureTasks.length})</h3>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        {futureTasks.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No upcoming/pending tasks scheduled.
                            </div>
                        ) : (
                            <table className="info-table">
                                <thead>
                                    <tr>
                                        <th style={{ color: 'var(--text-muted)' }}>Employee</th>
                                        <th style={{ color: 'var(--text-muted)' }}>MO Ref</th>
                                        <th style={{ color: 'var(--text-muted)' }}>Operation</th>
                                        <th style={{ color: 'var(--text-muted)' }}>Scheduled Date</th>
                                        <th style={{ color: 'var(--text-muted)' }}>Notes</th>
                                        <th style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {futureTasks.map(task => {
                                        const match = task.reason?.match(/Scheduled Date:\s*([^\s|]+)(?:\s*\|\s*Notes:\s*(.*))?/);
                                        const scheduledDate = match ? match[1] : '—';
                                        const notes = match ? match[2] || '—' : task.reason || '—';
                                        return (
                                            <tr key={task.id}>
                                                <td style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                                                    {getEmployeeName(task.assigned_to_id)}
                                                </td>
                                                <td>
                                                    <span className="badge badge-blue">{task.mo_reference}</span>
                                                </td>
                                                <td style={{ color: 'var(--text-main)' }}>{task.description}</td>
                                                <td style={{ color: 'var(--text-main)', fontWeight: 600 }}>{scheduledDate}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{notes}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleDelete(task.id)}
                                                        className="icon-btn delete"
                                                        title="Cancel Assignment"
                                                    >
                                                        <i className="fa-regular fa-trash-can"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '80px',
                    right: '2rem',
                    padding: '1rem 1.5rem',
                    background: toast.type === 'error' ? '#fee2e2' : '#dcfce3',
                    color: toast.type === 'error' ? '#991b1b' : '#166534',
                    border: `1px solid ${toast.type === 'error' ? '#f87171' : '#4ade80'}`,
                    borderRadius: '8px',
                    zIndex: 10003,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                }}>
                    <i className={toast.type === 'error' ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check"}></i>
                    {toast.message}
                </div>
            )}

            {deletingTaskId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '400px', borderRadius: '24px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header" style={{ background: 'var(--bg-card)', padding: '1.25rem 2rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}><i className="fa-regular fa-trash-can" style={{ marginRight: '8px', color: '#ef4444' }}></i> Cancel Assignment</h3>
                            <button className="close-modal" onClick={() => setDeletingTaskId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div className="modal-body" style={{ padding: '1.5rem', color: 'var(--text-main)' }}>
                            <p style={{ margin: 0, lineHeight: '1.5' }}>Are you sure you want to cancel this scheduled task?</p>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                            <button className="modal-cancel-btn" onClick={() => setDeletingTaskId(null)}>Cancel</button>
                            <button 
                                className="modal-save-btn" 
                                style={{ background: '#ef4444' }}
                                onClick={async () => {
                                    const id = deletingTaskId;
                                    setDeletingTaskId(null);
                                    await confirmDelete(id);
                                }}
                            >
                                Cancel Task
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FuturePlanningPage;
