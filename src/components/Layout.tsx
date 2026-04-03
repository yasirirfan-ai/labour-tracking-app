import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

export const Layout: React.FC = () => {
    const { user, loading } = useAuth();
    const { t, i18n } = useTranslation();
    const { toggleTheme, setLanguage, currentTheme } = useTheme();
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    if (loading) return <div className="loading-screen">Authenticating...</div>;
    if (!user) return <Navigate to="/login" replace />;

    // Redirect employees away from manager area
    if (user.role === 'employee') return <Navigate to="/worker-portal" replace />;

    return (
        <div className="app-container">
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
