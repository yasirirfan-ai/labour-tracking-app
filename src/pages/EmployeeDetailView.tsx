import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

export const EmployeeDetailView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [employee, setEmployee] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Time Off');
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [historySearch, setHistorySearch] = useState('');
    const [eeoSearch, setEeoSearch] = useState('');
    const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
    const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
    const [isEquityModalOpen, setIsEquityModalOpen] = useState(false);

    const fetchEmployee = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id || '')
            .single();
        
        if (data) setEmployee(data as User);
        else if (error) console.error('Error fetching employee:', error);
        setLoading(false);
    };

    useEffect(() => {
        if (id) fetchEmployee();
    }, [id]);


    if (loading) return <div className="loading-screen">Loading Profile...</div>;
    if (!employee) return <div>Employee not found</div>;

    const tabs = ['Personal', 'Job', 'Time Off', 'Emergency'];

    const historyData = [
        { date: '04/16/2025', description: `${employee.name.split(' ')[0]} is now eligible to begin accruing time`, used: null, earned: null, balance: '0.00' },
        { date: '04/30/2025', description: 'Prorated accrual for 04/16/2025 to 04/29/2025', used: null, earned: '1.56', balance: '1.56' },
        { date: '05/15/2025', description: 'Accrual for 04/30/2025 to 05/14/2025', used: null, earned: '1.67', balance: '3.23' },
        { date: '05/31/2025', description: 'Accrual for 05/15/2025 to 05/30/2025', used: null, earned: '1.67', balance: '4.90' },
        { date: '06/15/2025', description: 'Accrual for 05/31/2025 to 06/14/2025', used: null, earned: '1.67', balance: '6.57' },
        { date: '12/03/2025', description: 'Time off used for 12/03/2025 to 12/05/2025 - Family vacation', used: '-24.00', earned: null, balance: '0.94' },
        { date: '03/15/2026', description: 'Accrual for 02/28/2026 to 03/14/2026', used: null, earned: '1.67', balance: '12.63' },
    ];

    const ethnicityOptions = [
        "American Indian or Alaska Native",
        "Asian",
        "Black or African American",
        "Decline to answer",
        "Hispanic or Latino",
        "Middle Eastern or North African",
        "Native Hawaiian or Other Pacific Islander",
        "Two or More Races",
        "White"
    ];

    const eeoCategoryOptions = [
        "Administrative Support Workers",
        "Craft Workers",
        "Executive/Senior Level Officials and Managers",
        "First/Mid Level Officials and Managers",
        "Laborers and Helpers",
        "Operatives",
        "Professionals",
        "Sales Workers"
    ];

    const filteredOptions = (options: string[]) => 
        options.filter(opt => opt.toLowerCase().includes(eeoSearch.toLowerCase()));

    return (
        <div className="profile-container">
            <header className="profile-header">
                <div className="header-top">
                    <button className="back-btn" onClick={() => navigate('/workers')}>
                        <i className="fa-solid fa-arrow-left"></i> Back to People
                    </button>
                    <div className="pagination-info">
                        1 of 5 Next <i className="fa-solid fa-chevron-right"></i>
                    </div>
                </div>
                
                <div className="header-main">
                    <div className="profile-photo-container">
                        {employee.photo_url ? (
                            <img src={employee.photo_url} alt={employee.name} />
                        ) : (
                            <div className="profile-photo-placeholder">
                                {employee.name ? employee.name.substring(0, 2).toUpperCase() : '??'}
                            </div>
                        )}
                    </div>
                    <div className="profile-title-info">
                        <h1>{employee.name}</h1>
                        <p>{employee.job_title || 'Manufacturing Associate'}</p>
                    </div>
                    <div className="header-actions">
                        <button className="more-btn"><i className="fa-solid fa-ellipsis"></i></button>
                    </div>
                </div>

                <nav className="profile-nav">
                    {tabs.map(tab => (
                        <button 
                            key={tab} 
                            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="profile-content">
                <aside className="profile-sidebar">
                    <section className="sidebar-section">
                        <h3>Vitals</h3>
                        <div className="vitals-list">
                            <div className="vital-item"><i className="fa-solid fa-phone"></i> {employee.phone || 'N/A'}</div>
                            <div className="vital-item"><i className="fa-solid fa-envelope"></i> {employee.email || employee.username}</div>
                            <div className="vital-item"><i className="fa-solid fa-briefcase"></i> {employee.job_title || 'Manufacturing Associate'} <br/> Full Time</div>
                            <div className="vital-item"><i className="fa-solid fa-building"></i> {employee.department || 'Our Babylon'}</div>
                        </div>
                    </section>

                    <section className="sidebar-section">
                        <h3>Hire Date</h3>
                        <div className="vital-item"><i className="fa-solid fa-calendar"></i> {employee.hire_date || 'Apr 16, 2025'} <br/> 11m - 3d</div>
                    </section>

                    <section className="sidebar-section">
                        <h3>Manager</h3>
                        <div className="manager-info">
                            <div className="manager-photo">
                                <i className="fa-solid fa-user"></i>
                            </div>
                            <div>
                                <strong>Cody Chalker</strong>
                                <p>Chief Technology Officer</p>
                            </div>
                        </div>
                        <button className="text-link">View in org chart</button>
                    </section>
                </aside>

                <main className="main-details">
                    {activeTab === 'Time Off' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-calendar-alt"></i>
                                <h2>Time Off</h2>
                                <button className="settings-btn"><i className="fa-solid fa-wand-magic-sparkles"></i> Customize Layout</button>
                            </div>
                        <div className="time-off-grid">
                            <div className="time-off-card">
                                <div className="card-icon"><i className="fa-solid fa-palm-tree"></i></div>
                                <div className="card-value">12.6 Hours</div>
                                <div className="card-label">Paid Time Off (PTO) Available</div>
                                <div className="card-sublabel">Babylon PTO</div>
                                <div className="card-actions">
                                    <button><i className="fa-solid fa-calendar-plus"></i></button>
                                    <button><i className="fa-solid fa-list-check"></i></button>
                                    <button><i className="fa-solid fa-plus-minus"></i></button>
                                    <button className="more"><i className="fa-solid fa-gear"></i> <i className="fa-solid fa-chevron-down"></i></button>
                                </div>
                            </div>

                            <div className="time-off-card">
                                <div className="card-icon"><i className="fa-solid fa-hospital"></i></div>
                                <div className="card-value">11.5 Hours</div>
                                <div className="card-label">Sick Time Available</div>
                                <div className="card-sublabel">Babylon Sick Time Year 1</div>
                                <div className="card-actions">
                                     <button><i className="fa-solid fa-calendar-plus"></i></button>
                                    <button><i className="fa-solid fa-list-check"></i></button>
                                    <button><i className="fa-solid fa-plus-minus"></i></button>
                                    <button className="more"><i className="fa-solid fa-gear"></i> <i className="fa-solid fa-chevron-down"></i></button>
                                </div>
                            </div>
                        </div>

                        <div className="upcoming-section">
                            <h3><i className="fa-solid fa-clock"></i> Upcoming Time Off</h3>
                            <div className="empty-state">
                                <div className="shiba-container">
                                    <i className="fa-solid fa-calendar-xmark" style={{ fontSize: '3rem', color: '#e2e8f0' }}></i>
                                </div>
                                <p>No upcoming time off.</p>
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Do you need to get away?</span>
                            </div>
                        </div>

                        <div className="history-section">
                            <div className="history-header">
                                <span className="history-title"><i className="fa-solid fa-clock-rotate-left"></i> History</span>
                                <div className="history-filters">
                                    <div className="custom-dropdown-container">
                                        <div 
                                            className={`custom-dropdown-header ${openDropdown === 'type' ? 'active' : ''}`}
                                            onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
                                        >
                                            Paid Time Off (PTO) <i className="fa-solid fa-chevron-down"></i>
                                        </div>
                                        {openDropdown === 'type' && (
                                            <div className="dropdown-menu">
                                                <div className="dropdown-item selected">Paid Time Off (PTO)</div>
                                                <div className="dropdown-item">Sick Time</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="custom-dropdown-container">
                                        <div 
                                            className={`custom-dropdown-header small ${openDropdown === 'year' ? 'active' : ''}`}
                                            onClick={() => setOpenDropdown(openDropdown === 'year' ? null : 'year')}
                                        >
                                            All <i className="fa-solid fa-chevron-down"></i>
                                        </div>
                                        {openDropdown === 'year' && (
                                            <div className="dropdown-menu has-search">
                                                <div className="dropdown-search">
                                                    <i className="fa-solid fa-magnifying-glass"></i>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Search..." 
                                                        value={historySearch}
                                                        onChange={(e) => setHistorySearch(e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="dropdown-item">2026</div>
                                                <div className="dropdown-item">2025</div>
                                                <div className="dropdown-item selected">All</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="custom-dropdown-container">
                                        <div 
                                            className={`custom-dropdown-header ${openDropdown === 'view' ? 'active' : ''}`}
                                            onClick={() => setOpenDropdown(openDropdown === 'view' ? null : 'view')}
                                        >
                                            Balance History <i className="fa-solid fa-chevron-down"></i>
                                        </div>
                                        {openDropdown === 'view' && (
                                            <div className="dropdown-menu">
                                                <div className="dropdown-item">Requests</div>
                                                <div className="dropdown-item selected">Balance History</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Date <i className="fa-solid fa-arrow-up"></i></th>
                                        <th>Description</th>
                                        <th>Used Hours (-)</th>
                                        <th>Earned Hours (+)</th>
                                        <th>Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyData.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.date}</td>
                                            <td>{item.description}</td>
                                            <td className="used-cell">{item.used || ''}</td>
                                            <td className="earned-cell">{item.earned || ''}</td>
                                            <td className="balance-cell">{item.balance}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    )}

                    {activeTab === 'Personal' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-user-gear"></i>
                                <h2>Personal</h2>
                                <button className="settings-btn"><i className="fa-solid fa-wand-magic-sparkles"></i> Customize Layout</button>
                            </div>

                            {/* Basic Information */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-id-card"></i>
                                    <h3>Basic Information</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>Employee #</label>
                                        <div className="info-value">{employee.worker_id}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Status</label>
                                        <div className="info-value"><span className="status-badge active">Active</span></div>
                                    </div>
                                    <div className="info-field">
                                        <label>First Name</label>
                                        <div className="info-value">{employee.first_name || employee.name?.split(' ')[0]}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Middle Name</label>
                                        <div className="info-value">{employee.middle_name || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Last Name</label>
                                        <div className="info-value">{employee.last_name || employee.name?.split(' ').slice(1).join(' ')}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Preferred Name</label>
                                        <div className="info-value">{employee.preferred_name || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Birth Date</label>
                                        <div className="info-value">{employee.birth_date ? new Date(employee.birth_date).toLocaleDateString() : '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>SSN</label>
                                        <div className="info-value">{employee.ssn ? 'XXX-XX-' + employee.ssn.slice(-4) : '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Gender</label>
                                        <div className="info-value">{employee.gender || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Marital Status</label>
                                        <div className="info-value">{employee.marital_status || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Shirt Size</label>
                                        <div className="info-value">{employee.shirt_size || '-Select-'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-house"></i>
                                    <h3>Address</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>Street 1</label>
                                        <div className="info-value">{employee.address_street1 || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Street 2</label>
                                        <div className="info-value">{employee.address_street2 || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>City</label>
                                        <div className="info-value">{employee.address_city || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>State</label>
                                        <div className="info-value">{employee.address_state || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>ZIP</label>
                                        <div className="info-value">{employee.address_zip || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Country</label>
                                        <div className="info-value">{employee.address_country || 'United States'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Contact */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-address-book"></i>
                                    <h3>Contact</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>Work Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-phone-office"></i> {employee.work_phone || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Ext</label>
                                        <div className="info-value">{employee.work_phone_ext || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Mobile Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-mobile-screen"></i> {employee.mobile_phone || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Home Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-phone"></i> {employee.home_phone || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Work Email</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-envelope"></i> {employee.work_email || employee.username || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Home Email</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-envelope"></i> {employee.home_email || '-'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-share-nodes"></i>
                                    <h3>Social Links</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>LinkedIn</label>
                                        <div className="info-icon-value"><i className="fa-brands fa-linkedin"></i> {employee.linkedin_url || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Twitter Username</label>
                                        <div className="info-icon-value"><i className="fa-brands fa-twitter"></i> {employee.twitter_url || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Facebook</label>
                                        <div className="info-icon-value"><i className="fa-brands fa-facebook"></i> {employee.facebook_url || '-'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Education */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-graduation-cap"></i>
                                    <h3>Education</h3>
                                </div>
                                <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                                    <button className="text-link" style={{ color: 'var(--primary, #1e1b4b)', fontWeight: 700 }}><i className="fa-solid fa-plus-circle"></i> Add Education</button>
                                </div>
                            </div>

                            {/* Licenses */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-file-certificate"></i>
                                        <h3>Licenses/Passport/Visa Information</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <div style={{ padding: '0' }}>
                                    <table className="info-table">
                                        <thead>
                                            <tr>
                                                <th>Type</th>
                                                <th>Effective Date</th>
                                                <th>Expiration Date</th>
                                                <th>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No licenses/passport/visa information entries have been added.</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Job' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-briefcase"></i>
                                <h2>Job</h2>
                                <button className="settings-btn"><i className="fa-solid fa-wand-magic-sparkles"></i> Customize Layout</button>
                            </div>

                            <div className="info-card">
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>Hire Date</label>
                                        <div className="info-value">{employee.hire_date || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Pay Group</label>
                                        <div className="info-value">-Select-</div>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Direct Reports</label>
                                        <div className="info-value">No Direct Reports</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Annual Pay</label>
                                        <div className="info-icon-value"><span>$</span> {employee.hourly_rate ? (employee.hourly_rate * 2080).toLocaleString() : '-'} <span>USD</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* Employment Status */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-user-clock"></i>
                                        <h3>Employment Status</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Effective Date</th>
                                            <th>Employment Status</th>
                                            <th>Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>{employee.hire_date || '04/16/2025'}</td>
                                            <td>{employee.employment_status || 'Full Time'}</td>
                                            <td>-</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Compensation */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-money-check-dollar"></i>
                                        <h3>Compensation</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Effective Date</th>
                                            <th>Pay Schedule</th>
                                            <th>Pay Type</th>
                                            <th>Pay Rate</th>
                                            <th>Overtime</th>
                                            <th>Change Reason</th>
                                            <th>Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>{employee.hire_date || '04/16/2025'}</td>
                                            <td>{employee.pay_schedule || 'Twice a month'}</td>
                                            <td>{employee.pay_type || 'Hourly'}</td>
                                            <td>${(Number(employee.hourly_rate) || 0).toFixed(2)} USD / {employee.pay_period || 'Hour'}</td>
                                            <td>-</td>
                                            <td>-</td>
                                            <td>-</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Job Information */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-briefcase"></i>
                                        <h3>Job Information</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Effective Date</th>
                                            <th>Location</th>
                                            <th>Division</th>
                                            <th>Department</th>
                                            <th>Teams</th>
                                            <th>Job Title</th>
                                            <th>Reports To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>{employee.hire_date || '04/16/2025'}</td>
                                            <td>{employee.location || '-'}</td>
                                            <td>{employee.division || '-'}</td>
                                            <td>{employee.department || '-'}</td>
                                            <td>-</td>
                                            <td>{employee.job_title || '-'}</td>
                                            <td style={{ color: 'var(--primary, #1e1b4b)', fontWeight: 700 }}>{employee.reporting_to || '-'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* EEO */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-scale-balanced"></i>
                                    <h3>Equal Employment Opportunity</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field half-width">
                                        <label>Ethnicity</label>
                                        <div className="custom-eeo-dropdown">
                                            <div 
                                                className={`eeo-select-trigger ${openDropdown === 'ethnicity' ? 'active' : ''}`}
                                                onClick={() => {
                                                    setOpenDropdown(openDropdown === 'ethnicity' ? null : 'ethnicity');
                                                    setEeoSearch('');
                                                }}
                                            >
                                                <span>{employee.ethnicity || '-Select-'}</span>
                                                <div className="trigger-divider"></div>
                                                <i className="fa-solid fa-chevron-down"></i>
                                            </div>
                                            {openDropdown === 'ethnicity' && (
                                                <div className="eeo-dropdown-menu">
                                                    <div className="eeo-search-box">
                                                        <i className="fa-solid fa-magnifying-glass"></i>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Search..." 
                                                            value={eeoSearch}
                                                            onChange={(e) => setEeoSearch(e.target.value)}
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="eeo-options-list">
                                                        {filteredOptions(ethnicityOptions).map(opt => (
                                                            <div 
                                                                key={opt} 
                                                                className={`eeo-option ${employee.ethnicity === opt ? 'selected' : ''}`}
                                                                onClick={async () => {
                                                                    setEmployee(prev => prev ? { ...prev, ethnicity: opt } : null);
                                                                    setOpenDropdown(null);
                                                                    await (supabase.from('users') as any).update({ ethnicity: opt }).eq('id', employee.id);
                                                                }}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>EEO Job Category</label>
                                        <div className="custom-eeo-dropdown">
                                            <div 
                                                className={`eeo-select-trigger ${openDropdown === 'eeo_category' ? 'active' : ''}`}
                                                onClick={() => {
                                                    setOpenDropdown(openDropdown === 'eeo_category' ? null : 'eeo_category');
                                                    setEeoSearch('');
                                                }}
                                            >
                                                <span>{employee.eeo_job_category || '-Select-'}</span>
                                                <div className="trigger-divider"></div>
                                                <i className="fa-solid fa-chevron-down"></i>
                                            </div>
                                            {openDropdown === 'eeo_category' && (
                                                <div className="eeo-dropdown-menu">
                                                    <div className="eeo-search-box">
                                                        <i className="fa-solid fa-magnifying-glass"></i>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Search..." 
                                                            value={eeoSearch}
                                                            onChange={(e) => setEeoSearch(e.target.value)}
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="eeo-options-list">
                                                        {filteredOptions(eeoCategoryOptions).map(opt => (
                                                            <div 
                                                                key={opt} 
                                                                className={`eeo-option ${employee.eeo_job_category === opt ? 'selected' : ''}`}
                                                                onClick={async () => {
                                                                    setEmployee(prev => prev ? { ...prev, eeo_job_category: opt } : null);
                                                                    setOpenDropdown(null);
                                                                    await (supabase.from('users') as any).update({ eeo_job_category: opt }).eq('id', employee.id);
                                                                }}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Veteran Status</label>
                                        <div className="veteran-status-list">
                                            <label className="custom-checkbox-container">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!employee.is_active_duty_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_active_duty_veteran: val } : null);
                                                        await (supabase.from('users') as any).update({ is_active_duty_veteran: val }).eq('id', employee.id);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                Active Duty Wartime or Campaign Badge Veteran
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!employee.is_armed_forces_medal_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_armed_forces_medal_veteran: val } : null);
                                                        await (supabase.from('users') as any).update({ is_armed_forces_medal_veteran: val }).eq('id', employee.id);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                Armed Forces Service Medal Veteran
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!employee.is_disabled_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_disabled_veteran: val } : null);
                                                        await (supabase.from('users') as any).update({ is_disabled_veteran: val }).eq('id', employee.id);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                Disabled Veteran
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!employee.is_recently_separated_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_recently_separated_veteran: val } : null);
                                                        await (supabase.from('users') as any).update({ is_recently_separated_veteran: val }).eq('id', employee.id);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                Recently Separated Veteran
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Potential Bonus */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-gift"></i>
                                    <h3>Potential Bonus</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>Annual Percentage</label>
                                        <div className="bonus-input-wrapper bonus-percentage">
                                            <input 
                                                type="number" 
                                                value={employee.annual_bonus_percentage ?? ''}
                                                onChange={async (e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEmployee(prev => prev ? { ...prev, annual_bonus_percentage: val } : null);
                                                    await (supabase.from('users') as any).update({ annual_bonus_percentage: val }).eq('id', employee.id);
                                                }}
                                                placeholder="0"
                                            />
                                            <span>%</span>
                                        </div>
                                    </div>
                                    <div className="info-field">
                                        <label>Annual Amount</label>
                                        <div className="bonus-input-wrapper amount">
                                            <span className="prefix">$</span>
                                            <input 
                                                type="number" 
                                                value={employee.annual_bonus_amount ?? ''}
                                                onChange={async (e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEmployee(prev => prev ? { ...prev, annual_bonus_amount: val } : null);
                                                    await (supabase.from('users') as any).update({ annual_bonus_amount: val }).eq('id', employee.id);
                                                }}
                                                placeholder="0.00"
                                            />
                                            <div className="bonus-divider"></div>
                                            <span className="suffix">USD</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bonus Table */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-coins"></i>
                                        <h3>Bonus</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsBonusModalOpen(true)}>Add Entry</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Amount</th>
                                            <th>Reason</th>
                                            <th>Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No bonus entries have been added.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Commission */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-chart-line-up"></i>
                                        <h3>Commission</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsCommissionModalOpen(true)}>Add Entry</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Amount</th>
                                            <th>Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commission entries have been added.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Equity */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-gem"></i>
                                        <h3>Equity</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsEquityModalOpen(true)}>Add Entry</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>Grant Type</th>
                                            <th>Custom Grant Type Name</th>
                                            <th>Grant Date</th>
                                            <th>Vesting Start Date</th>
                                            <th># of Equity Granted</th>
                                            <th>Strike Price</th>
                                            <th>Vesting Schedule</th>
                                            <th>Vesting Months</th>
                                            <th>Cliff Months</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No equity entries have been added.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Emergency' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-life-ring"></i>
                                <h2>Emergency</h2>
                                <button className="settings-btn"><i className="fa-solid fa-wand-magic-sparkles"></i> Customize Layout</button>
                            </div>

                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-address-card"></i>
                                        <h3>Emergency Contact Information</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                                            <input type="checkbox" checked={employee.is_primary_contact !== false} readOnly style={{ transform: 'scale(1.2)' }} />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>This is the primary emergency contact</span>
                                        </div>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Contact Name</label>
                                        <div className="info-value">{employee.emergency_contact_name || '-'}</div>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Relationship</label>
                                        <div className="info-value">{employee.emergency_contact_relationship || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-phone"></i> {employee.emergency_contact_phone || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Ext</label>
                                        <div className="info-value">{employee.emergency_contact_phone_ext || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Home Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-phone"></i> {employee.emergency_contact_home_phone || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Mobile Phone</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-mobile-screen"></i> {employee.emergency_contact_mobile_phone || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Email</label>
                                        <div className="info-icon-value"><i className="fa-solid fa-envelope"></i> {employee.emergency_contact_email || '-'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Emergency Contact Address */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-house-medical"></i>
                                    <h3>Emergency Contact Address</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>Street 1</label>
                                        <div className="info-value">{employee.emergency_contact_address_street1 || '-'}</div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Street 2</label>
                                        <div className="info-value">{employee.emergency_contact_address_street2 || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>City</label>
                                        <div className="info-value">{employee.emergency_contact_address_city || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>State</label>
                                        <div className="info-value">{employee.emergency_contact_address_state || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>ZIP</label>
                                        <div className="info-value">{employee.emergency_contact_address_zip || '-'}</div>
                                    </div>
                                    <div className="info-field">
                                        <label>Country</label>
                                        <div className="info-value">{employee.emergency_contact_address_country || 'United States'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Contact */}
                            {employee.secondary_contact_name && (
                                <div className="info-card">
                                    <div className="card-header">
                                        <i className="fa-solid fa-user-friends"></i>
                                        <h3>Secondary Emergency Contact</h3>
                                    </div>
                                    <div className="card-grid">
                                        <div className="info-field half-width">
                                            <label>Contact Name</label>
                                            <div className="info-value">{employee.secondary_contact_name}</div>
                                        </div>
                                        <div className="info-field half-width">
                                            <label>Relationship</label>
                                            <div className="info-value">{employee.secondary_contact_relationship}</div>
                                        </div>
                                        <div className="info-field full-width">
                                            <label>Phone</label>
                                            <div className="info-icon-value"><i className="fa-solid fa-phone"></i> {employee.secondary_contact_phone}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Modals for Bonus, Commission, and Equity */}
                    {isBonusModalOpen && (
                        <div className="modal-overlay">
                            <div className="modal-content add-entry-modal">
                                <div className="modal-header">
                                    <h2>Add Bonus Item</h2>
                                    <button className="close-modal" onClick={() => setIsBonusModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                                </div>
                                <div className="modal-body">
                                    <div className="modal-employee-info">
                                        <div className="modal-avatar">
                                            {employee.photo_url ? (
                                                <img src={employee.photo_url} alt={employee.name} />
                                            ) : (
                                                <i className="fa-solid fa-user"></i>
                                            )}
                                        </div>
                                        <div className="modal-name-info">
                                            <h3>{employee.name}</h3>
                                            <p>{employee.job_title || 'Manufacturing Associate II'}</p>
                                        </div>
                                    </div>
                                    <div className="modal-divider"></div>
                                    
                                    <div className="modal-form">
                                        <div className="modal-form-field">
                                            <label>Date</label>
                                            <div className="modal-input-group icon-right">
                                                <input type="text" defaultValue="03/19/2026" />
                                                <i className="fa-solid fa-calendar"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Amount</label>
                                            <div className="modal-input-group dual-side">
                                                <span className="prefix">$</span>
                                                <input type="text" placeholder="" />
                                                <span className="suffix">USD</span>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Reason</label>
                                            <div className="modal-select">
                                                <span>-Select-</span>
                                                <i className="fa-solid fa-chevron-down"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Comment</label>
                                            <textarea rows={4}></textarea>
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-cancel-btn" onClick={() => setIsBonusModalOpen(false)}>Cancel</button>
                                    <button className="modal-save-btn">Save</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {isCommissionModalOpen && (
                        <div className="modal-overlay">
                            <div className="modal-content add-entry-modal">
                                <div className="modal-header">
                                    <h2>Add Commission Item</h2>
                                    <button className="close-modal" onClick={() => setIsCommissionModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                                </div>
                                <div className="modal-body">
                                    <div className="modal-employee-info">
                                        <div className="modal-avatar">
                                            {employee.photo_url ? <img src={employee.photo_url} alt={employee.name} /> : <i className="fa-solid fa-user"></i>}
                                        </div>
                                        <div className="modal-name-info">
                                            <h3>{employee.name}</h3>
                                            <p>{employee.job_title || 'Manufacturing Associate II'}</p>
                                        </div>
                                    </div>
                                    <div className="modal-divider"></div>
                                    <div className="modal-form">
                                        <div className="modal-form-field">
                                            <label>Date</label>
                                            <div className="modal-input-group icon-right">
                                                <input type="text" defaultValue="03/19/2026" />
                                                <i className="fa-solid fa-calendar"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Amount</label>
                                            <div className="modal-input-group dual-side">
                                                <span className="prefix">$</span>
                                                <input type="text" placeholder="" />
                                                <span className="suffix">USD</span>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Comment</label>
                                            <textarea rows={4}></textarea>
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-cancel-btn" onClick={() => setIsCommissionModalOpen(false)}>Cancel</button>
                                    <button className="modal-save-btn">Save</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEquityModalOpen && (
                        <div className="modal-overlay">
                            <div className="modal-content add-entry-modal">
                                <div className="modal-header">
                                    <h2>Add Equity Item</h2>
                                    <button className="close-modal" onClick={() => setIsEquityModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                                </div>
                                <div className="modal-body">
                                    <div className="modal-employee-info">
                                        <div className="modal-avatar">
                                            {employee.photo_url ? <img src={employee.photo_url} alt={employee.name} /> : <i className="fa-solid fa-user"></i>}
                                        </div>
                                        <div className="modal-name-info">
                                            <h3>{employee.name}</h3>
                                            <p>{employee.job_title || 'Manufacturing Associate II'}</p>
                                        </div>
                                    </div>
                                    <div className="modal-divider"></div>
                                    <div className="modal-form">
                                        <div className="modal-form-field">
                                            <label>Grant Date*</label>
                                            <div className="modal-input-group icon-right">
                                                <input type="text" placeholder="mm/dd/yyyy" />
                                                <i className="fa-solid fa-calendar"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Vesting Start Date*</label>
                                            <div className="modal-input-group icon-right">
                                                <input type="text" placeholder="mm/dd/yyyy" />
                                                <i className="fa-solid fa-calendar"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Grant Type*</label>
                                            <div className="modal-select">
                                                <span>-Select-</span>
                                                <i className="fa-solid fa-chevron-down"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Custom Grant Type Name</label>
                                            <input type="text" className="full-input" />
                                        </div>
                                        <div className="modal-form-field">
                                            <label># of Equity Granted*</label>
                                            <input type="text" className="full-input" />
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Vesting Schedule</label>
                                            <div className="modal-select">
                                                <span>-Select-</span>
                                                <i className="fa-solid fa-chevron-down"></i>
                                            </div>
                                        </div>
                                        <div className="modal-form-field">
                                            <label>Cliff Months</label>
                                            <input type="text" className="full-input" />
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-cancel-btn" onClick={() => setIsEquityModalOpen(false)}>Cancel</button>
                                    <button className="modal-save-btn">Save</button>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>

            <style>{`
                .profile-container {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                    color: #1e293b;
                }
                .profile-header {
                    background: white;
                    border-radius: 20px;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 2rem;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                }
                .header-top {
                    padding: 1rem 2rem;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .back-btn {
                    background: none;
                    border: none;
                    color: #64748b;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .back-btn:hover { color: var(--primary, #1e1b4b); transform: translateX(-4px); }
                .pagination-info { font-size: 0.85rem; color: #94a3b8; font-weight: 600; }
                
                .header-main {
                    padding: 2rem;
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                }
                .profile-photo-container {
                    width: 100px;
                    height: 100px;
                    border-radius: 24px;
                    overflow: hidden;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .profile-photo-container img { width: 100%; height: 100%; object-fit: cover; }
                .profile-photo-placeholder {
                    width: 100%;
                    height: 100%;
                    background: var(--primary, #1e1b4b);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2rem;
                    font-weight: 800;
                    letter-spacing: 2px;
                }
                .profile-title-info h1 { margin: 0; font-size: 2rem; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; }
                .profile-title-info p { margin: 0.25rem 0 0; color: #3b82f6; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem; }
                .header-actions { margin-left: auto; }
                .more-btn { background: #f8fafc; border: 1px solid #e2e8f0; width: 40px; height: 40px; border-radius: 10px; color: #64748b; cursor: pointer; }
                
                .profile-nav {
                    display: flex;
                    padding: 0 2rem;
                    gap: 2.5rem;
                    border-top: 1px solid #f1f5f9;
                }
                .nav-tab {
                    padding: 1.25rem 0;
                    background: none;
                    border: none;
                    font-weight: 700;
                    color: #64748b;
                    cursor: pointer;
                    position: relative;
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }
                .nav-tab.active { color: var(--primary, #1e1b4b); }
                .nav-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 3px;
                    background: var(--accent, #f59e0b);
                    border-radius: 3px 3px 0 0;
                }
                
                .profile-content {
                    display: grid;
                    grid-template-columns: 320px 1fr;
                    gap: 2rem;
                    align-items: start;
                }
                .profile-sidebar {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .sidebar-section {
                    background: white;
                    border-radius: 20px;
                    border: 1px solid #e2e8f0;
                    padding: 1.5rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                }
                .sidebar-section h3 { margin: 0 0 1rem; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.1em; }
                .vitals-list { display: flex; flex-direction: column; gap: 0.75rem; }
                .vital-item { display: flex; align-items: flex-start; gap: 12px; font-size: 0.9rem; font-weight: 600; color: #334155; line-height: 1.4; }
                .vital-item i { width: 16px; color: #cbd5e1; margin-top: 3px; }
                .manager-info { display: flex; align-items: center; gap: 12px; margin-bottom: 1rem; }
                .manager-photo { width: 40px; height: 40px; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
                .manager-info strong { display: block; font-size: 0.95rem; color: #0f172a; }
                .manager-info p { margin: 0; font-size: 0.8rem; color: #64748b; }
                .text-link { background: none; border: none; color: #3b82f6; font-size: 0.85rem; font-weight: 700; cursor: pointer; padding: 0; }
                
                .main-details {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                }
                .section-title-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 0.5rem;
                }
                .section-title-row i { font-size: 1.5rem; color: var(--primary, #1e1b4b); opacity: 0.4; }
                .section-title-row h2 { margin: 0; font-size: 1.75rem; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; }
                .settings-btn { margin-left: auto; background: #fff; border: 1.5px solid #e2e8f0; padding: 0.5rem 1rem; border-radius: 10px; font-size: 0.85rem; font-weight: 700; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 8px; }

                .time-off-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                }
                .time-off-card {
                    background: white;
                    border-radius: 20px;
                    border: 1px solid #e2e8f0;
                    padding: 2rem;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                }
                .card-icon { font-size: 2.5rem; color: #f1f5f9; position: absolute; right: -10px; top: -10px; transform: rotate(-15deg); }
                .card-value { font-size: 2.25rem; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; margin-bottom: 0.25rem; }
                .card-label { font-size: 0.95rem; font-weight: 700; color: #1e293b; }
                .card-sublabel { font-size: 0.85rem; color: #64748b; font-weight: 500; margin-top: 0.1rem; }
                .card-actions { display: flex; gap: 8px; margin-top: 1.5rem; }
                .card-actions button { width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .card-actions button:hover { background: #f8fafc; color: var(--primary, #1e1b4b); border-color: #cbd5e1; }
                .card-actions button.more { width: auto; padding: 0 10px; gap: 6px; font-size: 0.75rem; }

                .upcoming-section h3 { margin: 0 0 1.5rem; font-size: 1.1rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                .upcoming-section h3 i { color: #f59e0b; }
                .empty-state {
                    background: #f8fafc;
                    border: 2px dashed #e2e8f0;
                    border-radius: 20px;
                    padding: 3rem;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .empty-state p { margin: 0.5rem 0 0.25rem; font-weight: 800; color: #475569; }

                .info-card {
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .card-header {
                    padding: 1.25rem 1.5rem;
                    background: #fcfdfe;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .card-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: var(--primary, #1e1b4b);
                }
                .card-header i {
                    font-size: 1.1rem;
                    color: var(--primary, #1e1b4b);
                    opacity: 0.8;
                }
                .card-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1.5rem;
                    padding: 1.5rem;
                }
                .info-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .info-field.full-width {
                    grid-column: span 4;
                }
                .info-field.half-width {
                    grid-column: span 2;
                }
                .info-field label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: capitalize;
                }
                .info-value {
                    font-size: 0.95rem;
                    font-weight: 500;
                    color: #1e293b;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #f1f5f9;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                }
                .info-icon-value {
                    font-size: 0.95rem;
                    font-weight: 500;
                    color: #1e293b;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #f1f5f9;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .info-icon-value i {
                    color: #94a3b8;
                    font-size: 0.9rem;
                }
                .status-badge.active {
                    background: #dcfce7;
                    color: #166534;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .info-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .info-table th {
                    text-align: left;
                    padding: 1rem 1.5rem;
                    background: #f8fafc;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid #e2e8f0;
                }
                .info-table td {
                    padding: 1rem 1.5rem;
                    font-size: 0.9rem;
                    border-bottom: 1px solid #f1f5f9;
                    color: #475569;
                }
                .small-action-btn {
                    background: white;
                    border: 1px solid var(--primary, #1e1b4b);
                    color: var(--primary, #1e1b4b);
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .small-action-btn:hover {
                    background: var(--primary, #1e1b4b);
                    color: white;
                }
                    color: #1e293b;
                }
                .training-summary-card {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                    background: white;
                    padding: 2rem;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 2rem;
                }
                .progress-circle-large {
                    width: 100px;
                    height: 100px;
                }
                .progress-circle-large svg {
                    transform: rotate(-90deg);
                }
                .circle-bg {
                    fill: none;
                    stroke: #f1f5f9;
                    stroke-width: 3.8;
                }
                .circle {
                    fill: none;
                    stroke: var(--accent, #f59e0b);
                    stroke-width: 3.8;
                    stroke-linecap: round;
                }
                .progress-percentage {
                    fill: var(--primary, #1e1b4b);
                    font-size: 8px;
                    font-weight: 800;
                    text-anchor: middle;
                    transform: rotate(90deg);
                }
                .training-list {
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    padding: 2rem;
                }
                .training-list h3 {
                    margin-bottom: 1.5rem;
                }
                .training-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 0;
                    border-bottom: 1px solid #f1f5f9;
                }
                .text-green { color: var(--success, #10b981); }
                .text-gray { color: #cbd5e1; }
                .sop-info { flex: 1; }
                .sop-info p { margin: 0; font-size: 0.8rem; color: #64748b; }
                .sop-type {
                    font-size: 0.75rem;
                    padding: 4px 8px;
                    background: #f1f5f9;
                    border-radius: 4px;
                    color: #64748b;
                }
                .history-section {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    margin-top: 2.5rem;
                    overflow: hidden;
                }
                .history-header {
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #f1f5f9;
                }
                .history-title {
                    font-weight: 800;
                    color: var(--primary, #1e1b4b);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 1.1rem;
                }
                .history-filters {
                    display: flex;
                    gap: 12px;
                }
                .history-filters select {
                    padding: 6px 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    color: #475569;
                    outline: none;
                }
                .balance-history-btn {
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    color: #475569;
                    cursor: pointer;
                }
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .history-table th {
                    background: #f8fafc;
                    padding: 0.75rem 1.5rem;
                    text-align: left;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: #64748b;
                    font-weight: 700;
                    border-bottom: 1px solid #f1f5f9;
                }
                .history-table td {
                    padding: 1rem 1.5rem;
                    font-size: 0.875rem;
                    color: #1e293b;
                    border-bottom: 1px solid #f8fafc;
                }
                .history-table tr:hover td {
                    background: #fdfdfd;
                }
                .used-cell { color: #ef4444 !important; font-weight: 600; }
                .earned-cell { color: #107c41 !important; font-weight: 600; }
                .balance-cell { font-weight: 700; }
                .shiba-container {
                    margin-bottom: 1rem;
                }
                .custom-dropdown-container {
                    position: relative;
                }
                .custom-dropdown-header {
                    border: 2px solid transparent;
                    background: white;
                    padding: 6px 16px;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #475569;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    border: 1px solid #e2e8f0;
                    transition: all 0.2s;
                }
                .custom-dropdown-header i {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }
                .custom-dropdown-header.active {
                    border: 2px solid var(--accent, #f59e0b);
                    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
                }
                .custom-dropdown-header.small {
                    min-width: 80px;
                }
                .dropdown-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
                    border: 1px solid #e2e8f0;
                    min-width: 200px;
                    z-index: 50;
                    overflow: hidden;
                    padding: 8px 0;
                }
                .dropdown-menu.has-search {
                    padding-top: 0;
                }
                .dropdown-search {
                    padding: 12px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: white;
                    position: sticky;
                    top: 0;
                }
                .dropdown-search i {
                    color: #94a3b8;
                    font-size: 0.9rem;
                }
                .dropdown-search input {
                    border: none;
                    outline: none;
                    font-size: 0.9rem;
                    width: 100%;
                }
                .dropdown-item {
                    padding: 10px 16px;
                    font-size: 0.9rem;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .dropdown-item:hover {
                    background: #f8fafc;
                    color: var(--primary, #1e1b4b);
                }
                .dropdown-item.selected {
                    background: #f1f5f9;
                    color: var(--primary, #1e1b4b);
                    font-weight: 600;
                }
                .custom-eeo-dropdown {
                    position: relative;
                    width: 100%;
                }
                .eeo-select-trigger {
                    display: flex;
                    align-items: center;
                    padding: 0 16px;
                    height: 44px;
                    background: white;
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.95rem;
                    color: #475569;
                    justify-content: space-between;
                }
                .eeo-select-trigger:hover {
                    border-color: #2d6a4f;
                }
                .eeo-select-trigger.active {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                .eeo-select-trigger span {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .trigger-divider {
                    width: 1px;
                    height: 20px;
                    background: #eef2f6;
                    margin: 0 12px;
                }
                .eeo-select-trigger i {
                    font-size: 0.8rem;
                    color: #94a3b8;
                    transition: transform 0.2s;
                }
                .eeo-select-trigger.active i {
                    transform: rotate(180deg);
                    color: #2d6a4f;
                }
                
                .eeo-dropdown-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    width: 100%;
                    min-width: 320px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
                    border: 1px solid #eef2f6;
                    z-index: 1000;
                    overflow: hidden;
                    animation: dropdownSlideIn 0.2s ease-out;
                }
                @keyframes dropdownSlideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .eeo-search-box {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: white;
                    position: sticky;
                    top: 0;
                }
                .eeo-search-box i {
                    color: #94a3b8;
                    font-size: 0.95rem;
                }
                .eeo-search-box input {
                    border: none;
                    outline: none;
                    font-size: 0.95rem;
                    width: 100%;
                    color: #1e293b;
                }
                .eeo-search-box input::placeholder {
                    color: #cbd5e1;
                }

                .eeo-options-list {
                    max-height: 280px;
                    overflow-y: auto;
                    padding: 8px 0;
                }
                .eeo-options-list::-webkit-scrollbar {
                    width: 8px;
                }
                .eeo-options-list::-webkit-scrollbar-track {
                    background: #f8fafc;
                }
                .eeo-options-list::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 4px;
                    border: 2px solid #f8fafc;
                }
                .eeo-options-list::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }

                .bonus-input-wrapper .suffix {
                    color: #94a3b8;
                    font-weight: 500;
                }

                .add-entry-btn {
                    padding: 4px 16px;
                    border: 1px solid #166534;
                    color: #166534;
                    background: transparent;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 100px;
                }
                .add-entry-btn:hover {
                    background: #f0fdf4;
                }

                /* Modal Styling */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(2px);
                }
                .modal-content.add-entry-modal {
                    background: white;
                    width: 480px;
                    max-width: 95vw;
                    max-height: 90vh;
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .modal-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .modal-header h2 {
                    font-size: 1.25rem;
                    color: #2d6a4f;
                    font-weight: 700;
                    margin: 0;
                }
                .close-modal {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    cursor: pointer;
                }
                .modal-body {
                    padding: 0;
                    overflow-y: auto;
                    flex: 1;
                }
                .modal-employee-info {
                    padding: 16px 24px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: #fcfdfe;
                }
                .modal-avatar {
                    width: 56px;
                    height: 56px;
                    background: #f1f5f9;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    color: #94a3b8;
                    font-size: 1.5rem;
                }
                .modal-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .modal-name-info h3 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                }
                .modal-name-info p {
                    font-size: 0.9rem;
                    color: #64748b;
                    margin: 2px 0 0;
                }
                .modal-divider {
                    height: 1px;
                    background: #f1f5f9;
                    margin: 0;
                }
                .modal-form {
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .modal-form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .modal-form-field label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #475569;
                }
                .modal-input-group {
                    display: flex;
                    align-items: center;
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    background: white;
                    transition: all 0.2s;
                }
                .modal-input-group:focus-within {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                .modal-input-group input {
                    border: none;
                    outline: none;
                    flex: 1;
                    font-size: 0.95rem;
                    color: #1e293b;
                }
                .modal-input-group i {
                    color: #94a3b8;
                    font-size: 0.95rem;
                }
                .modal-input-group.dual-side .prefix {
                    color: #64748b;
                    margin-right: 12px;
                    font-weight: 500;
                }
                .modal-input-group.dual-side .suffix {
                    color: #94a3b8;
                    margin-left: 12px;
                    border-left: 1.5px solid #eef2f6;
                    padding-left: 12px;
                    font-size: 0.85rem;
                    font-weight: 600;
                }
                .modal-select {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    background: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-select:hover {
                    border-color: #2d6a4f;
                }
                .modal-select span {
                    font-size: 0.95rem;
                    color: #64748b;
                }
                .modal-select i {
                    color: #94a3b8;
                    font-size: 0.8rem;
                }
                .full-input {
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    transition: all 0.2s;
                }
                .full-input:focus {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                textarea {
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 12px 16px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    resize: none;
                    transition: all 0.2s;
                }
                textarea:focus {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                .modal-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .modal-cancel-btn {
                    padding: 10px 24px;
                    border: 1.5px solid #2d6a4f;
                    color: #2d6a4f;
                    background: white;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-cancel-btn:hover {
                    background: #f0fdf4;
                }
                .modal-save-btn {
                    padding: 10px 24px;
                    border: none;
                    color: white;
                    background: #2d6a4f;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-save-btn:hover {
                    background: #1b4332;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }

                .eeo-option {
                    padding: 10px 20px;
                    font-size: 0.95rem;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                    line-height: 1.5;
                }
                .eeo-option:hover {
                    background: #f8fafc;
                    color: #2d6a4f;
                }
                .eeo-option.selected {
                    background: #f1f5f9;
                    color: #2d6a4f;
                    font-weight: 700;
                }

                /* Veteran Status Custom Checkbox */
                .veteran-status-list {
                    display: flex; 
                    flex-direction: column; 
                    gap: 12px; 
                    padding: 12px 0;
                }
                .custom-checkbox-container {
                    display: flex;
                    align-items: center;
                    position: relative;
                    padding-left: 30px;
                    cursor: pointer;
                    font-size: 0.95rem;
                    color: #475569;
                    user-select: none;
                }
                .custom-checkbox-container input {
                    position: absolute;
                    opacity: 0;
                    cursor: pointer;
                    height: 0;
                    width: 0;
                }
                .checkmark {
                    position: absolute;
                    top: 50%;
                    left: 0;
                    transform: translateY(-50%);
                    height: 18px;
                    width: 18px;
                    background-color: white;
                    border: 1.5px solid #cbd5e1;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .custom-checkbox-container:hover input ~ .checkmark {
                    border-color: #2d6a4f;
                }
                .custom-checkbox-container input:checked ~ .checkmark {
                    background-color: #2d6a4f;
                    border-color: #2d6a4f;
                }
                .checkmark:after {
                    content: "";
                    position: absolute;
                    display: none;
                }
                .custom-checkbox-container input:checked ~ .checkmark:after {
                    display: block;
                }
                .custom-checkbox-container .checkmark:after {
                    left: 5px;
                    top: 1px;
                    width: 5px;
                    height: 10px;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }

                /* Bonus Inputs */
                .bonus-input-wrapper {
                    display: flex;
                    align-items: center;
                    padding: 0 12px;
                    height: 40px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    transition: all 0.2s;
                    margin-top: 4px;
                    width: fit-content;
                    min-width: 140px;
                }
                .bonus-input-wrapper:focus-within {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 3px rgba(45, 106, 79, 0.05);
                }
                .bonus-input-wrapper input {
                    border: none;
                    outline: none;
                    font-size: 0.95rem;
                    color: #1e293b;
                    width: 60px;
                    padding: 0 8px;
                    background: transparent;
                }
                .bonus-input-wrapper.amount input {
                    width: 100px;
                }
                .bonus-input-wrapper span {
                    color: #64748b;
                    font-size: 0.85rem;
                }
                .bonus-input-wrapper .prefix {
                    font-weight: 500;
                    margin-right: 4px;
                }
                .bonus-divider {
                    width: 1px;
                    height: 18px;
                    background: #e2e8f0;
                    margin: 0 12px;
                }
                .bonus-input-wrapper .suffix {
                    color: #94a3b8;
                    font-weight: 500;
                }

                .add-entry-btn {
                    padding: 4px 16px;
                    border: 1px solid #166534;
                    color: #166534;
                    background: transparent;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 100px;
                }
                .add-entry-btn:hover {
                    background: #f0fdf4;
                }

                /* Modal Styling */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(2px);
                }
                .modal-content.add-entry-modal {
                    background: white;
                    width: 480px;
                    max-width: 95vw;
                    max-height: 90vh;
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .modal-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .modal-header h2 {
                    font-size: 1.25rem;
                    color: #2d6a4f;
                    font-weight: 700;
                    margin: 0;
                }
                .close-modal {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    cursor: pointer;
                }
                .modal-body {
                    padding: 0;
                    overflow-y: auto;
                    flex: 1;
                }
                .modal-employee-info {
                    padding: 16px 24px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: #fcfdfe;
                }
                .modal-avatar {
                    width: 56px;
                    height: 56px;
                    background: #f1f5f9;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    color: #94a3b8;
                    font-size: 1.5rem;
                }
                .modal-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .modal-name-info h3 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                }
                .modal-name-info p {
                    font-size: 0.9rem;
                    color: #64748b;
                    margin: 2px 0 0;
                }
                .modal-divider {
                    height: 1px;
                    background: #f1f5f9;
                    margin: 0;
                }
                .modal-form {
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .modal-form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .modal-form-field label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #475569;
                }
                .modal-input-group {
                    display: flex;
                    align-items: center;
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    background: white;
                    transition: all 0.2s;
                }
                .modal-input-group:focus-within {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                .modal-input-group input {
                    border: none;
                    outline: none;
                    flex: 1;
                    font-size: 0.95rem;
                    color: #1e293b;
                }
                .modal-input-group i {
                    color: #94a3b8;
                    font-size: 0.95rem;
                }
                .modal-input-group.dual-side .prefix {
                    color: #64748b;
                    margin-right: 12px;
                    font-weight: 500;
                }
                .modal-input-group.dual-side .suffix {
                    color: #94a3b8;
                    margin-left: 12px;
                    border-left: 1.5px solid #eef2f6;
                    padding-left: 12px;
                    font-size: 0.85rem;
                    font-weight: 600;
                }
                .modal-select {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    background: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-select:hover {
                    border-color: #2d6a4f;
                }
                .modal-select span {
                    font-size: 0.95rem;
                    color: #64748b;
                }
                .modal-select i {
                    color: #94a3b8;
                    font-size: 0.8rem;
                }
                .full-input {
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 0 16px;
                    height: 44px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    transition: all 0.2s;
                }
                .full-input:focus {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                textarea {
                    border: 1.5px solid #eef2f6;
                    border-radius: 10px;
                    padding: 12px 16px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    resize: none;
                    transition: all 0.2s;
                }
                textarea:focus {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.05);
                }
                .modal-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .modal-cancel-btn {
                    padding: 10px 24px;
                    border: 1.5px solid #2d6a4f;
                    color: #2d6a4f;
                    background: white;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-cancel-btn:hover {
                    background: #f0fdf4;
                }
                .modal-save-btn {
                    padding: 10px 24px;
                    border: none;
                    color: white;
                    background: #2d6a4f;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .modal-save-btn:hover {
                    background: #1b4332;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
            `}</style>
        </div>
    );
};
