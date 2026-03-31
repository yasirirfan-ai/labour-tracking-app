import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { EmployeeCardGrid } from '../components/EmployeeCardGrid';
import { useNavigate } from 'react-router-dom';
import type { User } from '../types';
import { useTranslation } from 'react-i18next';

export const WorkersPage: React.FC = () => {
    const { t } = useTranslation();
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

    const handleArchive = async (id: string, currentStatus: boolean) => {
        const action = currentStatus ? 'archive' : 'restore';
        if (!confirm(t('common.confirmAction', { action: t(`common.${action}`) }))) return;

        const { error } = await (supabase.from('users') as any).update({ active: !currentStatus }).eq('id', id);
        if (!error) fetchWorkers();
    };


    const handleResetPassword = async () => {
        if (!selectedWorker) return;

        const newPassword = window.prompt(t('common.enterNewPassword', { name: selectedWorker.name }));
        if (!newPassword || newPassword.trim() === '') {
            return; // Cancelled or empty string
        }

        const { error } = await (supabase.from('users') as any)
            .update({ password: newPassword.trim() })
            .eq('id', selectedWorker.id);

        if (!error) {
            alert(t('common.passwordUpdated', { name: selectedWorker.name }));
        } else {
            alert(t('common.errorResettingPassword') + ': ' + error.message);
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

    if (isLoading) return <div className="loading-screen">{t('common.loading')}</div>;

    return (
        <div className="workers-page">
            <header className="people-header">
                <div className="people-header-main">
                    <div className="title-section">
                        <h1 className="people-title">{t('workers.title')}</h1>
                    </div>
                    
                    <div className="header-actions">
                        <button className="btn-new-employee" onClick={handleAddNew}>
                            <i className="fa-solid fa-circle-plus"></i> {t('common.add')}
                        </button>
                    </div>
                </div>
            </header>

            <div className="filter-bar">
                <div className="search-filter-group">
                    <div className="search-wrapper">
                        <i className="fa-solid fa-magnifying-glass"></i>
                        <input 
                            type="text" 
                            placeholder={t('common.search')} 
                            value={search} 
                            onChange={(e) => setSearch(e.target.value)} 
                        />
                    </div>
                    <div className="status-filter">
                        <span>{t('common.showing')}</span>
                        <div className="select-wrapper">
                            <select value={showArchived ? 'Archived' : 'Active'} onChange={(e) => setShowArchived(e.target.value === 'Archived')}>
                                <option value="Active">{t('common.active')}</option>
                                <option value="Archived">{t('common.archived')}</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <EmployeeCardGrid 
                employees={filteredWorkers} 
                onEmployeeClick={handleEmployeeClick}
                onDelete={handleArchive}
            />

            {/* History Modal */}
            <div className={`custom-modal ${isHistoryOpen ? 'active' : ''} history-modal`}>
                <div className="modal-header">
                    <div>
                        <h3>{t('common.rateHistory')}</h3>
                        <p>{selectedWorker?.name}</p>
                    </div>
                    <button className="close-x" onClick={() => setIsHistoryOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="modal-body">
                    {rateHistory.length > 0 ? (
                        <div className="history-list">
                            {rateHistory.map((h, i) => (
                                <div key={h.id} className={`history-item ${i === 0 ? 'current' : ''}`}>
                                    <div className="history-info">
                                        <div className="rate-amount">$ {parseFloat(h.hourly_rate).toFixed(2)}/hr</div>
                                        <div className="effective-date">
                                            {t('common.effectiveSince', { date: new Date(h.changed_at).toLocaleDateString() })}
                                        </div>
                                    </div>
                                    {i === 0 && <span className="current-badge">{t('common.current')}</span>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">{t('common.noHistory')}</div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="secondary-btn" onClick={() => setIsHistoryOpen(false)}>{t('common.close')}</button>
                </div>
            </div>

            {/* Worker Details Modal */}
            <div className={`custom-modal ${isDetailsOpen ? 'active' : ''} details-modal`}>
                <div className="modal-header details-header">
                    <div className="worker-header-info">
                        <div className="worker-avatar">
                            {selectedWorker?.name?.substring(0, 2)?.toUpperCase() || 'W'}
                        </div>
                        <div>
                            <h3>{selectedWorker?.name}</h3>
                            <div className="worker-id-badge">
                                {selectedWorker?.worker_id || 'NO ID'}
                            </div>
                        </div>
                    </div>
                    <button className="close-x" onClick={() => setIsDetailsOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="modal-body">
                    <div className="details-grid">
                        <div className="detail-field">
                            <label>{t('common.username')}</label>
                            <div className="detail-value">{selectedWorker?.username}</div>
                        </div>
                        <div className="detail-row">
                            <div className="detail-field">
                                <label>{t('common.hourlyRate')}</label>
                                <div className="detail-value highlight">${parseFloat(selectedWorker?.hourly_rate || 0).toFixed(2)}/hr</div>
                            </div>
                            <div className="detail-field">
                                <label>{t('common.accountStatus')}</label>
                                <div className={`detail-value status ${selectedWorker?.active === false ? 'archived' : 'active'}`}>
                                    {selectedWorker?.active === false ? t('common.archived') : t('common.active')}
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions-list">
                            <button className="action-btn" onClick={() => { setIsDetailsOpen(false); openHistory(selectedWorker); }}>
                                <i className="fa-solid fa-clock-rotate-left"></i> {t('common.viewRateHistory')}
                            </button>
                            <button className="action-btn warning" onClick={handleResetPassword}>
                                <i className="fa-solid fa-key"></i> {t('common.resetPassword')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {(isHistoryOpen || isDetailsOpen) && <div className="modal-overlay active" onClick={() => { setIsHistoryOpen(false); setIsDetailsOpen(false); }}></div>}

            <style>{`
                .workers-page {
                    min-height: 100vh;
                    background: var(--bg-main);
                }
                .people-header {
                    padding: 1rem 0 2rem;
                    border-bottom: 1px solid var(--border);
                    margin-bottom: 2rem;
                }
                .people-header-main {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .people-title {
                    font-size: 2rem;
                    font-weight: 800;
                    color: var(--text-main);
                    margin: 0;
                }
                .btn-new-employee {
                    background: var(--primary);
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 10px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-new-employee:hover { opacity: 0.9; transform: translateY(-1px); }

                .filter-bar {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 2rem;
                }
                .search-filter-group {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                .search-wrapper { position: relative; width: 300px; }
                .search-wrapper i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
                .search-wrapper input {
                    width: 100%;
                    padding: 0.6rem 1rem 0.6rem 2.5rem;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    background: var(--bg-card);
                    color: var(--text-main);
                    outline: none;
                }
                .status-filter { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-muted); }
                .select-wrapper select {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    color: var(--text-main);
                    font-weight: 600;
                }

                /* Modals Styling */
                .custom-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(0.9);
                    background: var(--bg-card);
                    border-radius: 20px;
                    z-index: 1000;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid var(--border);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .custom-modal.active { opacity: 1; visibility: visible; transform: translate(-50%, -50%) scale(1); }
                .history-modal { width: 450px; }
                .details-modal { width: 400px; }

                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h3 { margin: 0; font-size: 1.25rem; color: var(--text-main); font-weight: 700; }
                .modal-header p { margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted); }
                .close-x { background: none; border: none; font-size: 1.2rem; color: var(--text-muted); cursor: pointer; }

                .modal-body { padding: 1.5rem; }
                .modal-footer { padding: 1.5rem; border-top: 1px solid var(--border); text-align: right; }

                .history-list { display: flex; flex-direction: column; gap: 12px; }
                .history-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem;
                    border-radius: 12px;
                    background: var(--bg-main);
                    border: 1px solid var(--border);
                }
                .history-item.current { background: var(--primary-light, rgba(79, 70, 229, 0.05)); border-color: var(--primary); }
                .rate-amount { font-size: 1.1rem; font-weight: 700; color: var(--text-main); }
                .effective-date { font-size: 0.75rem; color: var(--text-muted); }
                .current-badge { font-size: 0.65rem; font-weight: 800; background: var(--primary); color: white; padding: 2px 6px; border-radius: 4px; }

                .secondary-btn {
                    padding: 0.6rem 1.5rem;
                    background: var(--bg-main);
                    border: 1px solid var(--border);
                    color: var(--text-main);
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .worker-header-info { display: flex; gap: 12px; align-items: center; }
                .worker-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: var(--primary);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                }
                .worker-id-badge { font-size: 0.75rem; color: var(--primary); font-weight: 700; }

                .details-grid { display: flex; flex-direction: column; gap: 1.5rem; }
                .detail-field label { display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
                .detail-value { font-size: 1rem; font-weight: 600; color: var(--text-main); }
                .detail-value.highlight { color: var(--primary); font-weight: 800; }
                .detail-value.status.active { color: #10b981; }
                .detail-value.status.archived { color: #ef4444; }
                .detail-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

                .modal-actions-list { margin-top: 1rem; display: flex; flex-direction: column; gap: 10px; }
                .action-btn {
                    width: 100%;
                    padding: 0.8rem;
                    border-radius: 10px;
                    background: var(--bg-main);
                    border: 1px solid var(--border);
                    color: var(--text-main);
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                }
                .action-btn:hover { background: var(--border); }
                .action-btn.warning { color: #f59e0b; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.05); }

                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    z-index: 999;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s;
                }
                .modal-overlay.active { opacity: 1; visibility: visible; }
            `}</style>
        </div>
    );
};
