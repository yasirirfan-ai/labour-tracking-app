import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LEVEL_2_SOPS } from '../data/sopData';

export const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<any>(null);
    const [rateHistory, setRateHistory] = useState<any[]>([]);
    const [formData, setFormData] = useState({ worker_id: '', name: '', username: '', rate: '', password: '', active: true, nfc_id: '' });

    useEffect(() => { fetchWorkers(); }, []);

    const fetchWorkers = async () => {
        setIsLoading(true);
        // Fetch ALL workers. Order by name (safer than created_at which might be missing)
        const { data } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true }) as { data: any[] };
        if (data) setWorkers(data);
        setIsLoading(false);
    };

    const generateNextWorkerId = () => {
        const ids = workers.map(w => w.worker_id).filter(id => id && id.startsWith('W-'));
        if (ids.length === 0) return 'W-001';

        // Extract numbers
        const nums = ids.map(id => parseInt(id.replace('W-', ''), 10)).filter(n => !isNaN(n));
        if (nums.length === 0) return 'W-001';

        const maxNum = Math.max(...nums);
        const nextNum = maxNum + 1;
        return `W-${String(nextNum).padStart(3, '0')}`;
    };

    const handleAddClick = () => {
        const nextId = generateNextWorkerId();
        setFormData({
            worker_id: nextId,
            name: '',
            username: '',
            rate: '',
            password: '',
            active: true,
            nfc_id: ''
        });
        setIsAddOpen(true);
    };

    const handleHire = async () => {
        if (!formData.name || !formData.username || !formData.rate || !formData.worker_id) return alert('Please fill all fields');

        // Auto-generate a default password since the field was removed
        const defaultPassword = 'worker' + Math.floor(1000 + Math.random() * 9000);

        const { error } = await (supabase.from('users') as any).insert({
            name: formData.name,
            username: formData.username,
            worker_id: formData.worker_id,
            hourly_rate: parseFloat(formData.rate),
            password: defaultPassword, // Set default password
            role: 'employee',
            active: true,
            nfc_id: formData.nfc_id || null
        });

        if (!error) {
            // Record initial rate in history
            const { data: newUser }: any = await supabase.from('users').select('id').eq('username', formData.username).single();
            if (newUser) {
                await (supabase.from('worker_rate_history') as any).insert({
                    user_id: newUser.id,
                    worker_name: formData.name,
                    hourly_rate: parseFloat(formData.rate)
                });
            }

            setIsAddOpen(false);
            resetForm();
            fetchWorkers();
        } else {
            alert('Error creating worker: ' + error.message);
        }
    };

    const handleUpdate = async () => {
        if (!selectedWorker) return;
        const { error } = await (supabase.from('users') as any).update({
            name: formData.name,
            username: formData.username,
            worker_id: formData.worker_id,
            hourly_rate: parseFloat(formData.rate),
            nfc_id: formData.nfc_id || null
        }).eq('id', selectedWorker.id);

        if (!error) {
            // Check if rate changed and record in history
            if (parseFloat(formData.rate) !== parseFloat(selectedWorker.hourly_rate)) {
                await (supabase.from('worker_rate_history') as any).insert({
                    user_id: selectedWorker.id,
                    worker_name: formData.name,
                    hourly_rate: parseFloat(formData.rate)
                });
            }

            setIsEditOpen(false);
            resetForm();
            fetchWorkers();
        }
    };

    const handleArchive = async (id: string, currentStatus: boolean) => {
        const action = currentStatus ? 'archive' : 'restore';
        if (!confirm(`Are you sure you want to ${action} this worker?`)) return;

        const { error } = await (supabase.from('users') as any).update({ active: !currentStatus }).eq('id', id);
        if (!error) fetchWorkers();
    };

    const resetForm = () => {
        setFormData({ worker_id: '', name: '', username: '', rate: '', password: '', active: true, nfc_id: '' });
        setSelectedWorker(null);
    };

    const openEdit = (worker: any) => {
        setSelectedWorker(worker);
        setFormData({
            worker_id: worker.worker_id || '',
            name: worker.name || '',
            username: (worker.username || '').replace('@BabylonLLC.com', ''), // Strip domain for edit if it was added in view
            rate: worker.hourly_rate?.toString() || '0',
            password: '',
            active: worker.active !== false,
            nfc_id: worker.nfc_id || ''
        });
        setIsEditOpen(true);
    };

    const openDetails = (worker: any) => {
        setSelectedWorker(worker);
        setIsDetailsOpen(true);
    };

    const handleResetPassword = async () => {
        if (!selectedWorker) return;

        const newPassword = window.prompt(`Enter a new password for ${selectedWorker.name}:`);
        if (!newPassword || newPassword.trim() === '') {
            return; // Cancelled or empty string
        }

        const { error } = await (supabase.from('users') as any)
            .update({ password: newPassword.trim() })
            .eq('id', selectedWorker.id);

        if (!error) {
            alert(`Password successfully updated for ${selectedWorker.name}.`);
        } else {
            alert('Error resetting password: ' + error.message);
        }
    };

    const openHistory = async (worker: any) => {
        setSelectedWorker(worker);
        setIsHistoryOpen(true);
        const { data, error } = await supabase
            .from('worker_rate_history')
            .select('*')
            .eq('user_id', worker.id)
            .order('changed_at', { ascending: false });

        if (data) setRateHistory(data);
        else if (error) console.error('Error fetching history:', error);
    };

    const filteredWorkers = workers.filter(w => {
        // Filter by archive status first
        if (!showArchived && w.active === false) return false;
        if (showArchived && w.active !== false) return false;

        // Then search
        return (
            w.name?.toLowerCase().includes(search.toLowerCase()) ||
            w.worker_id?.toLowerCase().includes(search.toLowerCase()) ||
            w.username?.toLowerCase().includes(search.toLowerCase())
        );
    });

    const calculateTrainingProgress = (worker: any) => {
        const completed = worker.completed_trainings || [];

        // Define total possible trainings based on the role
        // For employees, we default to 'Production' if specific role mapping isn't clear
        const role = worker.role === 'manager' ? 'Quality Assurance' : 'Production';
        const sopsForRole = LEVEL_2_SOPS[role as keyof typeof LEVEL_2_SOPS] || [];

        // Level 1: 3 core trainings + Level 2: Role-based SOPs
        const level1Count = 3;
        const totalPossible = level1Count + sopsForRole.length;

        if (totalPossible === 0) return 0;
        return Math.round((completed.length / totalPossible) * 100);
    };

    if (isLoading) return <div className="loading-screen">Loading Workers...</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Workers</h1>
                    <p className="page-subtitle">Manage manufacturing workers</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowArchived(!showArchived)}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: '8px', fontWeight: 600 }}>
                        {showArchived ? <><i className="fa-solid fa-users"></i> Show Active</> : <><i className="fa-solid fa-box-archive"></i> Show Archived</>}
                    </button>
                    <button className="btn btn-primary" onClick={handleAddClick}
                        style={{ width: 'auto', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}>
                        <i className="fa-solid fa-plus"></i> Add Worker
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '15px', top: '12px', color: '#9CA3AF' }}></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search workers..."
                        style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {filteredWorkers.map(worker => {
                    const progress = calculateTrainingProgress(worker);
                    return (
                        <div
                            key={worker.id}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '20px',
                                padding: '1.5rem',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                                border: '1px solid #F1F5F9',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.5rem',
                                opacity: worker.active === false ? 0.6 : 1,
                                cursor: 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s'
                            }}
                            onClick={() => openDetails(worker)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
                            }}
                        >
                            {/* Header: Avatar, Name & Progress Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{
                                        width: '52px',
                                        height: '52px',
                                        borderRadius: '50%',
                                        background: worker.active === false ? '#E2E8F0' : '#F1F5F9',
                                        color: worker.active === false ? '#94A3B8' : '#64748B',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 900,
                                        fontSize: '1.2rem',
                                        letterSpacing: '1px'
                                    }}>
                                        {worker.name?.substring(0, 2)?.toUpperCase() || 'W'}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '1.1rem' }}>{worker.name}</div>
                                        <div style={{ color: '#3B82F6', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {worker.worker_id || 'NO ID'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    background: progress === 100 ? '#DCFCE7' : '#EFF6FF',
                                    color: progress === 100 ? '#16A34A' : '#2563EB',
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800
                                }}>
                                    {progress}%
                                </div>
                            </div>

                            {/* Middle Stats Section */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '12px', flex: 1 }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Hourly Rate</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>${parseFloat(worker.hourly_rate || 0).toFixed(2)}</div>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '12px', flex: 1 }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Status</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: worker.active === false ? '#94A3B8' : '#0F172A' }}>
                                        {worker.active === false ? 'Archived' : 'Active'}
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar Section */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    <span>Training Checklist</span>
                                    <span style={{ color: progress === 100 ? '#16A34A' : '#64748B' }}>
                                        {progress === 100 ? 'Verified' : 'Incomplete'}
                                    </span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${progress}%`,
                                        height: '100%',
                                        background: progress === 100 ? '#10B981' : '#3B82F6',
                                        borderRadius: '3px',
                                        transition: 'width 0.3s ease'
                                    }}></div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
                                <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); openDetails(worker); }} style={{ flex: 1, padding: '0.6rem', borderRadius: '12px', background: 'transparent', border: '1px solid #E2E8F0', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', color: '#0F172A' }}>
                                    MANAGEMENT
                                </button>
                                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
                                    <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(worker); }} style={{ width: '38px', height: '38px', padding: 0, borderRadius: '12px', background: '#F8FAFC', border: 'none' }}>
                                        <i className="fa-solid fa-pen" style={{ color: '#64748B', fontSize: '0.85rem' }}></i>
                                    </button>
                                    <button
                                        className="icon-btn delete"
                                        title={worker.active === false ? "Restore" : "Archive"}
                                        onClick={(e) => { e.stopPropagation(); handleArchive(worker.id, worker.active !== false); }}
                                        style={{ width: '38px', height: '38px', padding: 0, borderRadius: '12px', background: worker.active === false ? '#DCFCE7' : '#FEF2F2', border: 'none' }}
                                    >
                                        <i className={`fa-solid ${worker.active === false ? 'fa-rotate-left' : 'fa-trash'}`} style={{ color: worker.active === false ? '#16A34A' : '#EF4444', fontSize: '0.85rem' }}></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}
                {filteredWorkers.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: '#94A3B8', background: '#FFFFFF', borderRadius: '20px', border: '1px dashed #E2E8F0' }}>
                        <i className="fa-solid fa-users" style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}></i>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>No workers found.</h3>
                        <p style={{ margin: '0.5rem 0 0' }}>Try adjusting your search criteria.</p>
                    </div>
                )}
            </div>

            {/* Add Modal */}
            <div className={`custom-modal ${isAddOpen ? 'active' : ''}`} style={{ width: '450px', padding: 0, borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Add Worker</h3>
                    <button onClick={() => setIsAddOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#666', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Worker ID (Auto-Generated)</label>
                        <input type="text" value={formData.worker_id} readOnly placeholder="e.g. W-001" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Full Name</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Enter worker name" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Email / Username</label>
                        <input type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="worker@company.com" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Hourly Rate ($)</label>
                        <input type="number" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} placeholder="0.00" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button className="btn" onClick={() => setIsAddOpen(false)} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: '1.5px solid #DDD', background: 'white' }}>Cancel</button>
                        <button className="btn" onClick={handleHire} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: 'none', background: '#111', color: 'white' }}>Create</button>
                    </div>
                </div>
            </div>

            {/* Edit Modal (similarly) */}
            <div className={`custom-modal ${isEditOpen ? 'active' : ''}`} style={{ width: '450px', padding: 0, borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Edit Worker</h3>
                    <button onClick={() => setIsEditOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#666', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Worker ID</label>
                        <input type="text" value={formData.worker_id} onChange={e => setFormData({ ...formData, worker_id: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Full Name</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Email / Username</label>
                        <input type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Hourly Rate ($)</label>
                        <input type="number" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button className="btn" onClick={() => setIsEditOpen(false)} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: '1.5px solid #DDD', background: 'white' }}>Cancel</button>
                        <button className="btn" onClick={handleUpdate} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: 'none', background: '#111', color: 'white' }}>Update</button>
                    </div>
                </div>
            </div>

            {/* History Modal */}
            <div className={`custom-modal ${isHistoryOpen ? 'active' : ''}`} style={{ width: '500px', padding: 0, borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Rate History</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>{selectedWorker?.name}</p>
                    </div>
                    <button onClick={() => setIsHistoryOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#666', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '2rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {rateHistory.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {rateHistory.map((h, i) => (
                                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: i === 0 ? '#F0F9FF' : '#F8FAFC', borderRadius: '12px', border: i === 0 ? '1px solid #BAE6FD' : '1px solid #E2E8F0' }}>
                                    <div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>$ {parseFloat(h.hourly_rate).toFixed(2)}/hr</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                                            Effective since: {new Date(h.changed_at).toLocaleDateString()} {new Date(h.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    {i === 0 && <span style={{ fontSize: '0.7rem', background: '#0EA5E9', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>CURRENT</span>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>No history records found.</div>
                    )}
                </div>
                <div style={{ padding: '1.5rem 2rem', background: '#F8FAFC', textAlign: 'right' }}>
                    <button className="btn" onClick={() => setIsHistoryOpen(false)} style={{ width: 'auto', padding: '0.6rem 1.5rem', borderRadius: '8px', border: '1.5px solid #DDD', background: 'white', fontWeight: 600 }}>Close</button>
                </div>
            </div>

            {/* Worker Details Modal */}
            <div className={`custom-modal ${isDetailsOpen ? 'active' : ''}`} style={{ width: '450px', padding: 0, borderRadius: '24px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '2rem', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: '#1E1B4B',
                            color: '#F59E0B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '1.5rem',
                            letterSpacing: '1px',
                            boxShadow: '0 4px 10px rgba(30, 27, 75, 0.2)'
                        }}>
                            {selectedWorker?.name?.substring(0, 2)?.toUpperCase() || 'W'}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.02em' }}>{selectedWorker?.name}</h3>
                            <div style={{ color: '#3B82F6', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>
                                {selectedWorker?.worker_id || 'NO ID'}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setIsDetailsOpen(false)} style={{ background: 'white', border: '1px solid #E2E8F0', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', cursor: 'pointer', transition: 'all 0.2s' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Email / Username</div>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}>{selectedWorker?.username}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Hourly Rate</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>${parseFloat(selectedWorker?.hourly_rate || 0).toFixed(2)}/hr</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Account Status</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: selectedWorker?.active === false ? '#EF4444' : '#10B981' }}>
                                    {selectedWorker?.active === false ? 'Archived' : 'Active'}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button className="btn" onClick={() => { setIsDetailsOpen(false); openHistory(selectedWorker); }} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', fontWeight: 700, display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', transition: 'all 0.2s' }}>
                                <i className="fa-solid fa-clock-rotate-left"></i> View Rate History
                            </button>
                            <button className="btn" onClick={handleResetPassword} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: '#FFF7ED', color: '#D97706', border: '1px solid #FFEDD5', fontWeight: 700, display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', transition: 'all 0.2s' }}>
                                <i className="fa-solid fa-key"></i> Reset Worker Password
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {(isAddOpen || isEditOpen || isHistoryOpen || isDetailsOpen) && <div className="overlay active" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); setIsHistoryOpen(false); setIsDetailsOpen(false); }}></div>}
        </>
    );
};
