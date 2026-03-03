import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC<{
    isCollapsed: boolean,
    setIsCollapsed: (c: boolean) => void,
    isMobileOpen?: boolean,
    setIsMobileOpen?: (o: boolean) => void
}> = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) => {
    const { logout } = useAuth();

    const toggleSidebar = () => {
        setIsCollapsed(!isCollapsed);
    };

    const handleMobileClose = () => {
        if (isMobileOpen && setIsMobileOpen) {
            setIsMobileOpen(false);
        }
    };

    return (
        <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
            <div className="brand">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem' }}>
                    <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}>
                        <span style={{ color: 'white', fontWeight: 900 }}>B</span>
                    </div>
                    <span style={{ letterSpacing: '-0.03em', fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>Babylon</span>
                </div>
                <button className="sidebar-toggle" onClick={toggleSidebar}>
                    <i className={`fa-solid ${isCollapsed ? 'fa-bars-staggered' : 'fa-chevron-left'}`}></i>
                </button>
            </div>

            <ul className="nav-menu">
                <li>
                    <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={handleMobileClose}>
                        <i className="fa-solid fa-border-all"></i> <span>Dashboard</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/control-matrix" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-table-cells"></i> <span>Control Matrix</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/control-table" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-table-list"></i> <span>Control Table</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/manufacturing-orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-regular fa-clipboard"></i> <span>Manufacturing Orders</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/employee-activity" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-users-viewfinder"></i> <span>Employee Activity</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/workers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-regular fa-user"></i> <span>Workers</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/operations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-list-check"></i> <span>Operations</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-chart-column"></i> <span>Reports</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/discipline" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-gavel"></i> <span>Discipline</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/nfc" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-rss"></i> <span>NFC Setup</span>
                    </NavLink>
                </li>
            </ul>

            <div className="bottom-menu">
                <ul className="nav-menu">
                    <li>
                        <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); logout(); }}>
                            <i className="fa-solid fa-arrow-right-from-bracket"></i> <span>Logout</span>
                        </a>
                    </li>
                </ul>
            </div>
        </nav>
    );
};
