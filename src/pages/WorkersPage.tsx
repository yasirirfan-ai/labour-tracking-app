import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { EmployeeTable } from '../components/EmployeeTable';
import { EmployeeSnapshot } from '../components/EmployeeSnapshot';
import { useNavigate } from 'react-router-dom';
import type { User } from '../types';

export const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<any>(null);
    const [rateHistory, setRateHistory] = useState<any[]>([]);
    
    // New state for overhaul
    const navigate = useNavigate();
    const [hoveredWorker, pHoveredWorker] = useState<User | null>(null);
    const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
    const [viewMode, setViewMode] = useState<'List' | 'Directory' | 'Org Chart'>('List');

    useEffect(() => { fetchWorkers(); }, []);

    const fetchWorkers = async () => {
        setIsLoading(true);
        // Fetch ALL workers. Order by name (safer than created_at which might be missing)
        const { data } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true }) as { data: any[] };
        if (data) setWorkers(data);
        setIsLoading(false);
    };

    const handleAddNew = () => {
        navigate('/workers/hire');
    };

    const handleEditNavigation = (worker: User) => {
        navigate(`/workers/edit/${worker.id}`);
    };


    const handleArchive = async (id: string, currentStatus: boolean) => {
        const action = currentStatus ? 'archive' : 'restore';
        if (!confirm(`Are you sure you want to ${action} this worker?`)) return;

        const { error } = await (supabase.from('users') as any).update({ active: !currentStatus }).eq('id', id);
        if (!error) fetchWorkers();
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

    const handleEmployeeClick = (employee: User) => {
        navigate(`/workers/${employee.id}`);
    };

    const handleMouseEnterName = (e: React.MouseEvent, employee: User) => {
        setHoverPosition({ x: e.clientX, y: e.clientY });
        pHoveredWorker(employee);
    };

    const handleMouseLeaveName = () => {
        pHoveredWorker(null);
    };

    if (isLoading) return <div className="loading-screen">Loading Workers...</div>;

    return (
        <>
            <div className="workers-page">
            <header className="people-header">
                <div className="people-header-main">
                    <div className="title-section">
                        <h1 className="people-title">People</h1>
                        <button className="quick-access-btn">
                            <i className="fa-solid fa-arrow-up-right-from-square"></i> Quick access to the directory
                        </button>
                    </div>
                    
                    <div className="header-actions">
                        <button className="btn-new-employee" onClick={handleAddNew}>
                            <i className="fa-solid fa-circle-plus"></i> New Employee
                        </button>
                        
                        <div className="view-mode-tabs">
                            <button className={`view-tab ${viewMode === 'List' ? 'active' : ''}`} onClick={() => setViewMode('List')}>
                                <i className="fa-solid fa-list"></i> List
                            </button>
                            <button className={`view-tab ${viewMode === 'Directory' ? 'active' : ''}`} onClick={() => setViewMode('Directory')}>
                                <i className="fa-solid fa-address-book"></i> Directory
                            </button>
                            <button className={`view-tab ${viewMode === 'Org Chart' ? 'active' : ''}`} onClick={() => setViewMode('Org Chart')}>
                                <i className="fa-solid fa-sitemap"></i> Org Chart
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="filter-bar">
                <div className="filter-group">
                    <button className="filter-settings-btn"><i className="fa-solid fa-sliders"></i></button>
                    <div className="select-wrapper">
                        <select value="Hourly Employees" disabled>
                            <option>Hourly Employees</option>
                        </select>
                        <span className="count-badge"><i className="fa-solid fa-users"></i> {filteredWorkers.length}</span>
                    </div>
                </div>

                <div className="search-filter-group">
                    <div className="search-wrapper">
                        <i className="fa-solid fa-magnifying-glass"></i>
                        <input 
                            type="text" 
                            placeholder="Search..." 
                            value={search} 
                            onChange={(e) => setSearch(e.target.value)} 
                        />
                    </div>
                    <div className="status-filter">
                        <span>Showing</span>
                        <div className="select-wrapper">
                            <select value={showArchived ? 'Archived' : 'Active'} onChange={(e) => setShowArchived(e.target.value === 'Archived')}>
                                <option value="Active">Active</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                    </div>
                    <button className="more-filters-btn"><i className="fa-solid fa-ellipsis"></i></button>
                </div>
            </div>

            <EmployeeTable 
                employees={filteredWorkers} 
                onEmployeeClick={handleEmployeeClick}
                onMouseEnterName={handleMouseEnterName}
                onMouseLeaveName={handleMouseLeaveName}
                onEdit={handleEditNavigation}
                onArchive={handleArchive}
            />

            {hoveredWorker && (
                <EmployeeSnapshot employee={hoveredWorker} position={hoverPosition} />
            )}

            <style>{`
                .people-header {
                    padding-bottom: 2rem;
                    border-bottom: 1px solid #e2e8f0;
                    margin-bottom: 2rem;
                }
                .people-header-main {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 2rem;
                }
                .title-section {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .people-title {
                    font-size: 2rem;
                    font-weight: 900;
                    color: #0f172a;
                    margin: 0;
                    letter-spacing: -0.02em;
                }
                .quick-access-btn {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .quick-access-btn:hover { background: #e2e8f0; color: #1e293b; }
                
                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .btn-new-employee {
                    background: var(--primary, #1e1b4b);
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 10px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(30, 27, 75, 0.15);
                    transition: all 0.2s;
                }
                .btn-new-employee:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(30, 27, 75, 0.2); }
                
                .view-mode-tabs {
                    display: flex;
                    background: #f1f5f9;
                    padding: 4px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                }
                .view-tab {
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                .view-tab.active { background: white; color: var(--primary, #1e1b4b); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                
                .filter-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2rem;
                    gap: 1rem;
                }
                .filter-group, .search-filter-group { display: flex; align-items: center; gap: 0.75rem; }
                .select-wrapper { position: relative; display: flex; align-items: center; }
                .select-wrapper select {
                    appearance: none;
                    background: white;
                    border: 1.5px solid #e2e8f0;
                    padding: 0.6rem 2.5rem 0.6rem 1rem;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #1e293b;
                    outline: none;
                    min-width: 160px;
                }
                .count-badge {
                    position: absolute;
                    right: 12px;
                    background: #f1f5f9;
                    padding: 2px 8px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #64748b;
                }
                .search-wrapper { position: relative; flex: 1; min-width: 300px; }
                .search-wrapper i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
                .search-wrapper input {
                    width: 100%;
                    padding: 0.6rem 1rem 0.6rem 2.5rem;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    outline: none;
                }
                .status-filter { display: flex; align-items: center; gap: 10px; color: #64748b; font-size: 0.85rem; font-weight: 600; }
            `}</style>
            </div>

            {/* Edit Modal (similarly) - This modal is now redundant if the Add modal is reused for Edit */}
            {/* The original edit modal content is removed as per the instruction to reuse the add modal for edit */}
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

            {(isHistoryOpen || isDetailsOpen) && <div className="overlay active" onClick={() => { setIsHistoryOpen(false); setIsDetailsOpen(false); }}></div>}
        </>
    );
};
