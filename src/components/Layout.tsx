import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
    const { user, loading } = useAuth();
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

            <main className={`main-content ${isCollapsed ? 'expanded' : ''}`}>
                <button className="mobile-menu-btn" onClick={() => setIsMobileOpen(true)}>
                    <i className="fa-solid fa-bars"></i>
                </button>
                <Outlet />
            </main>
        </div>
    );
};
