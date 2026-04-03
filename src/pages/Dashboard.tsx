import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const [stats, setStats] = useState({ activeWorkers: 0, totalWorkers: 0, runningTimers: 0, todayHours: 0, todayCost: 0 });
    const [activeMos, setActiveMos] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Reset page to 1 when total records or page size changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeMos.length, pageSize]);

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: taskData } = await supabase.from('tasks').select('*') as { data: any[] };
            const { data: moData } = await supabase.from('manufacturing_orders').select('*') as { data: any[] };

            if (userData && taskData) {
                const activeWorkers = userData.filter(u => taskData.some((t: any) => t.assigned_to_id === u.id && t.status === 'active')).length;
                const runningTimers = taskData.filter((t: any) => t.status === 'active').length;
                const totalSec = taskData.reduce((acc, t: any) => acc + (t.active_seconds || 0), 0);
                const totalCost = taskData.reduce((acc, t: any) => {
                    const emp = userData.find(u => u.id === t.assigned_to_id);
                    return acc + (((t.active_seconds || 0) / 3600) * (emp?.hourly_rate || 0));
                }, 0);

                setStats({
                    activeWorkers,
                    totalWorkers: userData.length,
                    runningTimers,
                    todayHours: parseFloat((totalSec / 3600).toFixed(1)),
                    todayCost: parseFloat(totalCost.toFixed(2))
                });

                setTasks(taskData);
                if (moData) {
                     // Filter for active/in-progress orders roughly
                     const active = moData.filter((m: any) => {
                         const s = (m.current_status || '').toLowerCase();
                         return s !== 'completed' && s !== 'done' && s !== 'draft';
                     });
                     setActiveMos(active);
                }
            }
        } catch (err) {
            console.error('Error fetching dashboard:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div className="loading-screen">{t('common.loading')}</div>;

    const getActiveCountForMo = (moRef: string) => {
        return tasks.filter(t => t.mo_reference === moRef && t.status === 'active').length;
    };

    // Pagination logic
    const totalPages = Math.ceil(activeMos.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedMos = activeMos.slice(startIndex, startIndex + pageSize);

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">{t('dashboard.title')}</h1>
                <p className="page-subtitle">{t('dashboard.subtitle')}</p>
            </div>

            <div className="stats-grid">
                <Link to="/employee-activity" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">{t('dashboard.activeWorkers')}</div>
                        <div className="stat-value">{stats.activeWorkers}</div>
                        <div className="stat-detail">{stats.totalWorkers} {t('dashboard.totalWorkers')}</div>
                    </div>
                    <div className="icon-box icon-blue" style={{ background: 'var(--primary-light)', color: 'white' }}>
                        <i className="fa-solid fa-user-group"></i>
                    </div>
                </Link>

                <Link to="/control-matrix" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">{t('dashboard.runningTimers')}</div>
                        <div className="stat-value">{stats.runningTimers}</div>
                        <div className="stat-detail">{t('dashboard.currentlyActive')}</div>
                    </div>
                    <div className="icon-box icon-green">
                        <i className="fa-regular fa-circle-play"></i>
                    </div>
                </Link>

                <Link to="/reports" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">{t('dashboard.todayHours')}</div>
                        <div className="stat-value">{stats.todayHours}</div>
                        <div className="stat-detail">{t('dashboard.hoursLogged')}</div>
                    </div>
                    <div className="icon-box icon-yellow">
                        <i className="fa-regular fa-clock"></i>
                    </div>
                </Link>

                <div className="stat-card">
                    <div>
                        <div className="stat-label">{t('dashboard.todayCost')}</div>
                        <div className="stat-value">${stats.todayCost}</div>
                        <div className="stat-detail">{t('dashboard.calculatedFromEntries')}</div>
                    </div>
                    <div className="icon-box icon-red">
                        <i className="fa-solid fa-dollar-sign"></i>
                    </div>
                </div>
            </div>

            <div className="content-grid" style={{ gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <div className="section-card" style={{ paddingBottom: '0' }}>
                    <div className="section-header" style={{ padding: '0 1.25rem 1.25rem 1.25rem', borderBottom: '1px solid var(--border)', margin: '0 -1.25rem 1.25rem -1.25rem' }}>
                        <h2 className="section-title" style={{ paddingLeft: '1.25rem' }}>{t('dashboard.activeOrders')}</h2>
                        <Link to="/manufacturing-orders" className="view-link" style={{ paddingRight: '1.25rem' }}>{t('dashboard.viewAll')} <i className="fa-solid fa-arrow-right"></i></Link>
                    </div>

                    <div className="list-container">
                        {paginatedMos.length > 0 ? (
                            paginatedMos.map(mo => (
                                <Link key={mo.id} to={`/control-matrix#mo-${mo.mo_number}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className="item-main">
                                        <div style={{ width: '40px', height: '40px', background: 'var(--bg-main)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', fontWeight: 800, fontSize: '0.75rem', border: '1.5px solid var(--border)', flexShrink: 0 }}>
                                            {t('common.mo')}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div className="item-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mo.mo_number} {mo.product_name ? `- ${mo.product_name}` : ''}</div>
                                            <div style={{ marginTop: '4px' }}>
                                                <span className={`badge badge-${(mo.current_status || 'draft').toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                                                    {t(`mo.statuses.${(mo.current_status || 'draft').toLowerCase()}`)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`status-badge ${getActiveCountForMo(mo.mo_number) > 0 ? 'badge-green' : 'badge-blue'}`} style={{ flexShrink: 0 }}>
                                        {getActiveCountForMo(mo.mo_number)} {t('dashboard.activeOperations')}
                                    </span>
                                </Link>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('dashboard.noActiveOrders')}</div>
                        )}
                    </div>

                    {/* Pagination Footer */}
                    {activeMos.length > 0 && (
                        <div className="pagination-container" style={{ margin: '0 -1.25rem' }}>
                            <div className="pagination-left">
                                <div className="pagination-page-size">
                                    <span>{t('pagination.recordsPerPage')}:</span>
                                    <select 
                                        className="pagination-select" 
                                        value={pageSize} 
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                    >
                                        <option value={10}>10</option>
                                        <option value={30}>30</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                                <div className="pagination-info">
                                    {t('pagination.showing')} {startIndex + 1} {t('pagination.to')} {Math.min(startIndex + pageSize, activeMos.length)} {t('pagination.of')} {activeMos.length} {t('pagination.entries')}
                                </div>
                            </div>
                            <div className="pagination-right">
                                <div className="pagination-btns">
                                    <button 
                                        className="pagination-btn" 
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        title={t('pagination.previous')}
                                    >
                                        <i className="fa-solid fa-chevron-left"></i> {t('pagination.previous')}
                                    </button>
                                    <button 
                                        className="pagination-btn" 
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages || totalPages === 0}
                                        title={t('pagination.next')}
                                    >
                                        {t('pagination.next')} <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
