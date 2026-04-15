import React, { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

interface AdminLeaveNotification {
    id: string;
    worker_name: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    hours_requested: number;
    request_id: string;
}

export const Layout: React.FC = () => {
    const { user, loading } = useAuth();
    const { t, i18n } = useTranslation();
    const { toggleTheme, setLanguage, currentTheme } = useTheme();
    const navigate = useNavigate();
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [leaveNotifications, setLeaveNotifications] = useState<AdminLeaveNotification[]>([]);
    // Track the latest known request timestamp so we only show notifications for NEW ones
    // Stores ALL known pending request IDs (seeded on mount, never shrinks)
    const knownPendingIds = useRef<Set<string>>(new Set());
    const isInitialized = useRef(false);

    useEffect(() => {
        if (!user) return;

        const pollForNewRequests = async () => {
            const { data, error } = await (supabase as any)
                .from('leave_requests')
                .select('id, type, start_date, end_date, hours_requested, user_id, status, user:users(name)')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error || !data) return;

            if (!isInitialized.current) {
                // First load: seed known IDs silently — don't show popups for existing requests
                data.forEach((r: any) => knownPendingIds.current.add(r.id));
                isInitialized.current = true;
                return;
            }

            // Subsequent polls: anything not yet known is a NEW request → show popup
            const newRequests = data.filter((r: any) => !knownPendingIds.current.has(r.id));

            for (const req of newRequests) {
                knownPendingIds.current.add(req.id);
                const workerName = (req.user as any)?.name || 'A Worker';
                const notifId = `notif-${req.id}`;

                setLeaveNotifications(prev => {
                    if (prev.some(n => n.id === notifId)) return prev;
                    const newNotif: AdminLeaveNotification = {
                        id: notifId,
                        worker_name: workerName,
                        leave_type: req.type === 'pto' ? 'PTO' : 'Sick Leave',
                        start_date: req.start_date,
                        end_date: req.end_date,
                        hours_requested: req.hours_requested,
                        request_id: req.id,
                    };
                    return [newNotif, ...prev.slice(0, 4)];
                });

                setTimeout(() => {
                    setLeaveNotifications(prev => prev.filter(n => n.id !== notifId));
                }, 15000);
            }
        };

        // Seed immediately, then poll every 10 seconds
        pollForNewRequests();
        const interval = setInterval(pollForNewRequests, 10000);

        return () => {
            clearInterval(interval);
            isInitialized.current = false;
            knownPendingIds.current.clear();
        };
    }, [user?.id]);

    const dismissNotification = (id: string) => {
        setLeaveNotifications(prev => prev.filter(n => n.id !== id));
    };

    if (loading) return <div className="loading-screen">Authenticating...</div>;
    if (!user) return <Navigate to="/login" replace />;

    // Redirect employees away from manager area
    if (user.role === 'employee') return <Navigate to="/worker-portal" replace />;

    return (
        <div className="app-container">
            {/* Admin Leave Request Notifications */}
            <div style={{
                position: 'fixed',
                top: '1.5rem',
                right: '1.5rem',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxWidth: '420px',
                width: '100%',
                pointerEvents: 'none',
            }}>
                {leaveNotifications.map((notif, index) => (
                    <div key={notif.id} style={{
                        background: 'white',
                        borderRadius: '20px',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        borderLeft: '5px solid #f59e0b',
                        animation: 'adminNotifSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        pointerEvents: 'all',
                        border: '1px solid #fde68a',
                        borderLeftWidth: '5px',
                        borderLeftColor: '#f59e0b',
                        opacity: 1 - index * 0.08,
                        transform: `scale(${1 - index * 0.015})`,
                        transformOrigin: 'top right',
                    }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <i className="fa-solid fa-calendar-plus" style={{ color: '#d97706', fontSize: '1.2rem' }}></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                                New Leave Request
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.4rem' }}>
                                {notif.worker_name}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.5' }}>
                                <span style={{ background: notif.leave_type === 'PTO' ? '#dbeafe' : '#d1fae5', color: notif.leave_type === 'PTO' ? '#1d4ed8' : '#065f46', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginRight: '0.5rem' }}>
                                    {notif.leave_type}
                                </span>
                                {notif.start_date} → {notif.end_date}
                                <span style={{ marginLeft: '0.5rem', fontWeight: 700, color: '#374151' }}>· {notif.hours_requested}h</span>
                            </div>
                            <button
                                onClick={() => { dismissNotification(notif.id); navigate('/leave-requests'); }}
                                style={{
                                    marginTop: '0.75rem',
                                    padding: '0.4rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#f59e0b',
                                    color: 'white',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    letterSpacing: '0.03em',
                                }}
                            >
                                Review Request →
                            </button>
                        </div>
                        <button
                            onClick={() => dismissNotification(notif.id)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, fontSize: '1rem', lineHeight: 1 }}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes adminNotifSlideIn {
                    from { transform: translateX(110%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>

            {isMobileOpen && (
                <div
                    className="mobile-overlay"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <Sidebar
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
            />

            <main className={`main-content ${isCollapsed ? 'collapsed' : ''}`}>
                <header className="admin-top-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginRight: 'auto' }}>
                        <button className="mobile-menu-btn" onClick={() => setIsMobileOpen(true)} style={{ position: 'static', marginRight: '1rem' }}>
                            <i className="fa-solid fa-bars"></i>
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        {/* High priority: theme/language toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.4rem', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    onClick={() => setLanguage('en')}
                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', border: 'none', background: i18n.language === 'en' ? 'var(--primary)' : 'transparent', color: i18n.language === 'en' ? 'white' : 'var(--text-muted)', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s' }}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLanguage('es')}
                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', border: 'none', background: i18n.language === 'es' ? 'var(--primary)' : 'transparent', color: i18n.language === 'es' ? 'white' : 'var(--text-muted)', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s' }}
                                >
                                    ES
                                </button>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
                            <button
                                onClick={toggleTheme}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.5rem', transition: 'transform 0.2s' }}
                                title={t('common.theme')}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'rotate(15deg)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'rotate(0deg)'}
                            >
                                {currentTheme === 'light' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun"></i>}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ textAlign: 'right', display: 'none' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>{user.name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{user.role}</div>
                            </div>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '12px',
                                background: 'var(--primary)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1rem',
                                boxShadow: '0 4px 12px rgba(30, 27, 75, 0.2)'
                            }}>
                                {user.name?.[0]}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="layout-page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
