import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
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
            nfc_id: formData.nfc_id
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
            nfc_id: formData.nfc_id
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

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Name</th>
                            <th>Username/Email</th>
                            <th>Hourly Rate</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.map(worker => (
                            <tr key={worker.id} style={{ opacity: worker.active === false ? 0.6 : 1 }}>
                                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#64748B' }}>{worker.worker_id || '-'}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            background: worker.active === false ? '#94A3B8' : 'var(--primary, #0F172A)',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 600,
                                            fontSize: '0.9rem',
                                            flexShrink: 0
                                        }}>
                                            {worker.name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <Link to="/employee-activity" style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>{worker.name}</Link>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>{worker.username}</td>
                                <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>$ {parseFloat(worker.hourly_rate || 0).toFixed(2)}/hr</td>
                                <td>
                                    {worker.active === false
                                        ? <span className="badge badge-gray">Archived</span>
                                        : <span className="badge badge-active">Active</span>
                                    }
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="icon-btn" title="View Rate History" onClick={() => openHistory(worker)} style={{ color: '#6366F1', marginRight: '5px' }}>
                                        <i className="fa-solid fa-clock-rotate-left"></i>
                                    </button>
                                    <button className="icon-btn" title="Edit" onClick={() => openEdit(worker)}><i className="fa-solid fa-pen"></i></button>
                                    <button
                                        className="icon-btn delete"
                                        title={worker.active === false ? "Restore" : "Archive"}
                                        onClick={() => handleArchive(worker.id, worker.active !== false)}
                                        style={{ color: worker.active === false ? '#22C55E' : '#EF4444' }}
                                    >
                                        <i className={`fa-solid ${worker.active === false ? 'fa-rotate-left' : 'fa-box-archive'}`}></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredWorkers.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>
                                    No {showArchived ? 'archived' : 'active'} workers found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
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

            {(isAddOpen || isEditOpen || isHistoryOpen) && <div className="overlay active" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); setIsHistoryOpen(false); }}></div>}
        </>
    );
};
