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

    // Worker activity notifications state
    const [workerNotifications, setWorkerNotifications] = useState<any[]>(() => {
        const saved = localStorage.getItem('admin_worker_notifications');
        return saved ? JSON.parse(saved) : [];
    });
    const [toastNotifications, setToastNotifications] = useState<any[]>([]);
    const [isBellDropdownOpen, setIsBellDropdownOpen] = useState(false);
    const knownWorkerLogIds = useRef<Set<string>>(new Set());
    const isWorkerInitialized = useRef(false);
    const bellRef = useRef<HTMLDivElement>(null);

    // Sync worker notifications to local storage
    useEffect(() => {
        localStorage.setItem('admin_worker_notifications', JSON.stringify(workerNotifications));
    }, [workerNotifications]);

    // Click outside handler for bell dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setIsBellDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Effect to poll for worker status/activity events
    useEffect(() => {
        if (!user) return;

        const pollForWorkerActivities = async () => {
            try {
                const { data, error } = await supabase
                    .from('activity_logs')
                    .select('id, worker_id, event_type, description, timestamp')
                    .in('event_type', ['clock_in', 'clock_out', 'break_start', 'break_end'])
                    .order('timestamp', { ascending: false })
                    .limit(20);

                if (error || !data) return;

                if (!isWorkerInitialized.current) {
                    // Initial load: seed known IDs silently
                    data.forEach((log: any) => knownWorkerLogIds.current.add(log.id));
                    isWorkerInitialized.current = true;
                    return;
                }

                // Identify new logs
                const newLogs = data.filter((log: any) => !knownWorkerLogIds.current.has(log.id));

                if (newLogs.length === 0) return;

                // Fetch names of workers for new logs
                const workerIds = Array.from(new Set(newLogs.map((l: any) => l.worker_id)));
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', workerIds);

                const workerMap: Record<string, string> = {};
                usersData?.forEach((u: any) => {
                    workerMap[u.id] = u.name;
                });

                const eventLabels: Record<string, string> = {
                    clock_in: 'Clocked In',
                    clock_out: 'Clocked Out',
                    break_start: 'Started Break',
                    break_end: 'Returned from Break',
                };

                const newNotifs: any[] = [];

                for (const log of newLogs) {
                    knownWorkerLogIds.current.add(log.id);
                    const workerName = workerMap[log.worker_id] || 'Unknown Worker';
                    const notifId = `worker-notif-${log.id}`;

                    const newNotif = {
                        id: notifId,
                        worker_name: workerName,
                        event_type: log.event_type,
                        description: log.description || eventLabels[log.event_type] || log.event_type,
                        timestamp: log.timestamp,
                        read: false,
                    };

                    newNotifs.push(newNotif);

                    // Add to slide-in toast notifications
                    setToastNotifications(prev => [newNotif, ...prev]);
                    setTimeout(() => {
                        setToastNotifications(prev => prev.filter(t => t.id !== notifId));
                    }, 10000);
                }

                if (newNotifs.length > 0) {
                    // Prepend new notifications (reverse so chronological order matches)
                    setWorkerNotifications(prev => [...newNotifs.reverse(), ...prev].slice(0, 50));
                }
            } catch (err) {
                console.error('Error polling worker activities:', err);
            }
        };

        // Seed and poll every 5 seconds
        pollForWorkerActivities();
        const interval = setInterval(pollForWorkerActivities, 5000);

        return () => {
            clearInterval(interval);
            isWorkerInitialized.current = false;
            knownWorkerLogIds.current.clear();
        };
    }, [user?.id]);

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
                        {/* Notifications Bell Icon */}
                        <div ref={bellRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setIsBellDropdownOpen(prev => !prev)}
                                style={{
                                    background: 'var(--bg-main)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-main)',
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '1.1rem',
                                    position: 'relative',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                                title="Worker Notifications"
                            >
                                <i className="fa-solid fa-bell"></i>
                                {workerNotifications.some(n => !n.read) && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-4px',
                                        background: '#ef4444',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: '18px',
                                        height: '18px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '2px solid white'
                                    }}>
                                        {workerNotifications.filter(n => !n.read).length}
                                    </span>
                                )}
                            </button>

                            {isBellDropdownOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '48px',
                                    right: '0',
                                    width: '360px',
                                    background: 'white',
                                    border: '1px solid var(--border)',
                                    borderRadius: '16px',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                                    zIndex: 5000,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        padding: '1rem',
                                        borderBottom: '1px solid #F1F5F9',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: '#F8FAFC'
                                    }}>
                                        <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem' }}>Activity Notifications</span>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <button
                                                onClick={() => {
                                                    setWorkerNotifications(prev => prev.map(n => ({ ...n, read: true })));
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                                            >
                                                Mark Read
                                            </button>
                                            <span style={{ color: '#E2E8F0', fontSize: '0.75rem' }}>|</span>
                                            <button
                                                onClick={() => {
                                                    setWorkerNotifications([]);
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        {workerNotifications.length === 0 ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                                No new notifications
                                            </div>
                                        ) : (
                                            workerNotifications.map(notif => {
                                                let badgeColor = '#64748B';
                                                let eventIcon = 'fa-user';
                                                if (notif.event_type === 'clock_in') {
                                                    badgeColor = '#10B981';
                                                    eventIcon = 'fa-right-to-bracket';
                                                } else if (notif.event_type === 'clock_out') {
                                                    badgeColor = '#EF4444';
                                                    eventIcon = 'fa-right-from-bracket';
                                                } else if (notif.event_type === 'break_start') {
                                                    badgeColor = '#F59E0B';
                                                    eventIcon = 'fa-mug-hot';
                                                } else if (notif.event_type === 'break_end') {
                                                    badgeColor = '#10B981';
                                                    eventIcon = 'fa-mug-hot';
                                                }

                                                return (
                                                    <div
                                                        key={notif.id}
                                                        onClick={() => {
                                                            setWorkerNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                                                        }}
                                                        style={{
                                                            padding: '0.85rem 1rem',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            display: 'flex',
                                                            gap: '0.75rem',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                            background: notif.read ? 'white' : '#F0F9FF',
                                                            transition: 'background 0.2s'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '8px',
                                                            background: badgeColor + '15',
                                                            color: badgeColor,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            <i className={`fa-solid ${eventIcon}`} style={{ fontSize: '0.9rem' }}></i>
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>{notif.worker_name}</div>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.1rem' }}>{notif.description}</div>
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                                                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

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

            {/* Worker Presence Toast Notifications */}
            <div style={{
                position: 'fixed',
                bottom: '1.5rem',
                right: '1.5rem',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxWidth: '380px',
                width: '100%',
                pointerEvents: 'none',
            }}>
                {toastNotifications.map((toast, index) => {
                    let badgeColor = '#64748B';
                    let eventIcon = 'fa-user';
                    let borderLeftColor = '#64748B';
                    if (toast.event_type === 'clock_in') {
                        badgeColor = '#10B981';
                        eventIcon = 'fa-right-to-bracket';
                        borderLeftColor = '#10B981';
                    } else if (toast.event_type === 'clock_out') {
                        badgeColor = '#EF4444';
                        eventIcon = 'fa-right-from-bracket';
                        borderLeftColor = '#EF4444';
                    } else if (toast.event_type === 'break_start') {
                        badgeColor = '#F59E0B';
                        eventIcon = 'fa-mug-hot';
                        borderLeftColor = '#F59E0B';
                    } else if (toast.event_type === 'break_end') {
                        badgeColor = '#10B981';
                        eventIcon = 'fa-mug-hot';
                        borderLeftColor = '#10B981';
                    }

                    return (
                        <div key={toast.id} style={{
                            background: 'white',
                            borderRadius: '16px',
                            padding: '1rem 1.25rem',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.85rem',
                            borderLeft: `5px solid ${borderLeftColor}`,
                            animation: 'adminNotifSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            pointerEvents: 'all',
                            opacity: 1 - index * 0.08,
                            transform: `scale(${1 - index * 0.015})`,
                            transformOrigin: 'bottom right',
                        }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: badgeColor + '15',
                                color: badgeColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <i className={`fa-solid ${eventIcon}`} style={{ fontSize: '1rem' }}></i>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: '0.78rem', color: badgeColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Worker Status Alert
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                                    {toast.worker_name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    {toast.description}
                                </div>
                            </div>
                            <button
                                onClick={() => setToastNotifications(prev => prev.filter(t => t.id !== toast.id))}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, fontSize: '0.9rem' }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
