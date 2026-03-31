import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

export const Sidebar: React.FC<{
    isCollapsed: boolean,
    setIsCollapsed: (c: boolean) => void,
    isMobileOpen?: boolean,
    setIsMobileOpen?: (o: boolean) => void
}> = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) => {
    const { logout } = useAuth();
    const { t, i18n } = useTranslation();
    const { currentTheme: theme, toggleTheme } = useTheme();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

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
                        <i className="fa-solid fa-border-all"></i> <span>{t('sidebar.dashboard')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/control-matrix" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-table-cells"></i> <span>{t('sidebar.controlMatrix')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/control-table" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-table-list"></i> <span>{t('sidebar.controlTable')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/manufacturing-orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-regular fa-clipboard"></i> <span>{t('sidebar.manufacturingOrders')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/employee-activity" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-users-viewfinder"></i> <span>{t('sidebar.employeeActivity')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/workers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-regular fa-user"></i> <span>{t('sidebar.workers')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/operations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-list-check"></i> <span>{t('sidebar.operations')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-chart-column"></i> <span>{t('sidebar.reports')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/discipline" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-gavel"></i> <span>{t('sidebar.discipline')}</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/nfc" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleMobileClose}>
                        <i className="fa-solid fa-rss"></i> <span>{t('sidebar.nfcSetup')}</span>
                    </NavLink>
                </li>
            </ul>

            <div className="bottom-menu">
                <ul className="nav-menu">
                    <li>
                        <div className="nav-item" onClick={toggleTheme}>
                            <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
                            <span>{theme === 'light' ? t('themes.dark') : t('themes.light')}</span>
                        </div>
                    </li>
                    <li>
                        <div className="nav-item" onClick={() => changeLanguage(i18n.language === 'en' ? 'es' : 'en')}>
                            <i className="fa-solid fa-language"></i>
                            <span>{i18n.language === 'en' ? 'Español' : 'English'}</span>
                        </div>
                    </li>
                    <li>
                        <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); logout(); }}>
                            <i className="fa-solid fa-arrow-right-from-bracket"></i> <span>{t('sidebar.logout')}</span>
                        </a>
                    </li>
                </ul>
            </div>
        </nav>
    );
};
