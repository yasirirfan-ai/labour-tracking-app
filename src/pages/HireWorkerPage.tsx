import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const HireWorkerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isEdit = !!id;

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        worker_id: '', 
        name: '', 
        first_name: '',
        middle_name: '',
        last_name: '',
        preferred_name: '',
        birth_date: '',
        ssn: '',
        gender: '',
        marital_status: '',
        hire_date: new Date().toISOString().split('T')[0],
        address_street1: '',
        address_street2: '',
        address_city: '',
        address_state: '',
        address_zip: '',
        address_country: 'United States',
        work_phone: '',
        work_phone_ext: '',
        mobile_phone: '',
        home_phone: '',
        work_email: '',
        home_email: '',
        username: '', 
        employment_status: '',
        job_title: '',
        reporting_to: '',
        department: '',
        division: '',
        location: '',
        pay_schedule: '',
        pay_type: '',
        pay_rate: '',
        pay_period: 'Hour',
        nfc_id: '' 
    });

    useEffect(() => {
        if (isEdit) {
            fetchWorker();
        } else {
            generateNextId();
        }
    }, [id]);

    const fetchWorker = async () => {
        setLoading(true);
        const { data } = await supabase.from('users').select('*').eq('id', id || '').single();
            setFormData(prev => ({
                ...prev,
                ...(data || {}),
                pay_rate: (data as any)?.hourly_rate?.toString() || ''
            }));
        setLoading(false);
    };

    const generateNextId = async () => {
        const { data } = await supabase.from('users').select('worker_id').order('worker_id', { ascending: false }).limit(1) as { data: any[] | null };
        let nextId = 'W-001';
        if (data && data.length > 0) {
            const lastId = data[0].worker_id;
            const num = (parseInt(lastId?.split('-')[1]) || 0) + 1;
            nextId = `W-${num.toString().padStart(3, '0')}`;
        }
        setFormData(prev => ({ ...prev, worker_id: nextId }));
    };

    const handleSave = async () => {
        if (!formData.name || !formData.username || !formData.pay_rate) return alert('Please fill required fields (Name, Username, Pay Rate)');
        
        setLoading(true);
        const payload = {
            ...formData,
            hourly_rate: parseFloat(formData.pay_rate),
            role: 'employee',
            active: true
        };
        delete (payload as any).pay_rate;

        const { error } = isEdit 
            ? await (supabase.from('users') as any).update(payload).eq('id', id)
            : await (supabase.from('users') as any).insert({ ...payload, password: 'worker' + Math.floor(1000 + Math.random() * 9000) });

        if (!error) {
            navigate('/workers');
        } else {
            alert('Error: ' + error.message);
        }
        setLoading(false);
    };

    return (
        <div className="hire-page">
            <header className="page-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => navigate('/workers')}>
                        <i className="fa-solid fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1>{isEdit ? 'Edit Employee' : 'Hire New Employee'}</h1>
                        <p>{formData.name || 'Set up profile'}</p>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="cancel-btn" onClick={() => navigate('/workers')}>Cancel</button>
                    <button className="save-btn" onClick={handleSave} disabled={loading}>
                        {loading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Hire Employee')}
                    </button>
                </div>
            </header>

            <div className="hire-container">
                <div className="hire-form-layout">
                    {/* Personal */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-user-gear"></i>
                            <h3>Personal</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>Employee ID</label>
                                <input type="text" value={formData.worker_id} readOnly className="read-only" />
                            </div>
                            <div className="form-field quarter-width">
                                <label>First Name*</label>
                                <input type="text" placeholder="First Name" value={formData.first_name} onChange={e => setFormData(prev => ({...prev, first_name: e.target.value, name: `${e.target.value} ${prev.last_name}`}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>Middle Name</label>
                                <input type="text" placeholder="Middle Name" value={formData.middle_name} onChange={e => setFormData(prev => ({...prev, middle_name: e.target.value}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>Last Name*</label>
                                <input type="text" placeholder="Last Name" value={formData.last_name} onChange={e => setFormData(prev => ({...prev, last_name: e.target.value, name: `${prev.first_name} ${e.target.value}`}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>Preferred Name</label>
                                <input type="text" placeholder="Preferred Name" value={formData.preferred_name} onChange={e => setFormData(prev => ({...prev, preferred_name: e.target.value}))} />
                            </div>
                            <div className="form-field">
                                <label>Birth Date</label>
                                <div className="input-with-icon">
                                    <input type="date" value={formData.birth_date} onChange={e => setFormData(prev => ({...prev, birth_date: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field full-width">
                                <label>SSN</label>
                                <input type="text" value={formData.ssn} onChange={e => setFormData(prev => ({...prev, ssn: e.target.value}))} />
                            </div>
                            <div className="form-field">
                                <label>Gender</label>
                                <select value={formData.gender} onChange={e => setFormData(prev => ({...prev, gender: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Marital Status</label>
                                <select value={formData.marital_status} onChange={e => setFormData(prev => ({...prev, marital_status: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Divorced">Divorced</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Job */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-briefcase"></i>
                            <h3>Job</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field">
                                <label>Hire Date</label>
                                <div className="input-with-icon">
                                    <input type="date" value={formData.hire_date} onChange={e => setFormData(prev => ({...prev, hire_date: e.target.value}))} />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-house-user"></i>
                            <h3>Address</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>Street 1</label>
                                <input type="text" value={formData.address_street1} onChange={e => setFormData(prev => ({...prev, address_street1: e.target.value}))} />
                            </div>
                            <div className="form-field full-width">
                                <label>Street 2</label>
                                <input type="text" value={formData.address_street2} onChange={e => setFormData(prev => ({...prev, address_street2: e.target.value}))} />
                            </div>
                            <div className="form-field">
                                <label>City</label>
                                <input type="text" value={formData.address_city} onChange={e => setFormData(prev => ({...prev, address_city: e.target.value}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>State</label>
                                <select value={formData.address_state} onChange={e => setFormData(prev => ({...prev, address_state: e.target.value}))}>
                                    <option value="">State</option>
                                    <option value="NY">NY</option>
                                    <option value="CA">CA</option>
                                    {/* Add more states as needed */}
                                </select>
                            </div>
                            <div className="form-field quarter-width">
                                <label>ZIP</label>
                                <input type="text" value={formData.address_zip} onChange={e => setFormData(prev => ({...prev, address_zip: e.target.value}))} />
                            </div>
                            <div className="form-field full-width">
                                <label>Country</label>
                                <select value={formData.address_country} onChange={e => setFormData(prev => ({...prev, address_country: e.target.value}))}>
                                    <option value="United States">United States</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Contact */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-address-book"></i>
                            <h3>Contact</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field quarter-width">
                                <label>Work Phone</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-phone"></i>
                                    <input type="text" value={formData.work_phone} onChange={e => setFormData(prev => ({...prev, work_phone: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field eighth-width">
                                <label>Ext</label>
                                <input type="text" value={formData.work_phone_ext} onChange={e => setFormData(prev => ({...prev, work_phone_ext: e.target.value}))} />
                            </div>
                            <div className="form-field full-width">
                                <label>Mobile Phone</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-mobile-screen"></i>
                                    <input type="text" value={formData.mobile_phone} onChange={e => setFormData(prev => ({...prev, mobile_phone: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field full-width">
                                <label>Home Phone</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-phone"></i>
                                    <input type="text" value={formData.home_phone} onChange={e => setFormData(prev => ({...prev, home_phone: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field full-width">
                                <label>Work Email</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-envelope"></i>
                                    <input type="text" value={formData.work_email} onChange={e => setFormData(prev => ({...prev, work_email: e.target.value, username: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field full-width">
                                <label>Home Email</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-envelope"></i>
                                    <input type="text" value={formData.home_email} onChange={e => setFormData(prev => ({...prev, home_email: e.target.value}))} />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Employment Status */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-user-clock"></i>
                            <h3>Employment Status</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>Employment Status</label>
                                <select value={formData.employment_status} onChange={e => setFormData(prev => ({...prev, employment_status: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Full Time">Full Time</option>
                                    <option value="Part Time">Part Time</option>
                                    <option value="Contract">Contract</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Job Information */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-briefcase"></i>
                            <h3>Job Information</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field">
                                <label>Job Title</label>
                                <select value={formData.job_title} onChange={e => setFormData(prev => ({...prev, job_title: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Manufacturing Associate">Manufacturing Associate</option>
                                    <option value="Operator">Operator</option>
                                    <option value="Supervisor">Supervisor</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Reports To</label>
                                <select value={formData.reporting_to} onChange={e => setFormData(prev => ({...prev, reporting_to: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Cody Chalker">Cody Chalker</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Department</label>
                                <select value={formData.department} onChange={e => setFormData(prev => ({...prev, department: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Our Babylon">Our Babylon</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Division</label>
                                <select value={formData.division} onChange={e => setFormData(prev => ({...prev, division: e.target.value}))}>
                                    <option value="">-Select-</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Location</label>
                                <select value={formData.location} onChange={e => setFormData(prev => ({...prev, location: e.target.value}))}>
                                    <option value="">-Select-</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Compensation */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-money-bill-wave"></i>
                            <h3>Compensation</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>Pay Schedule</label>
                                <select value={formData.pay_schedule} onChange={e => setFormData(prev => ({...prev, pay_schedule: e.target.value}))}>
                                    <option value="">-Select-</option>
                                    <option value="Twice a month">Twice a month</option>
                                    <option value="Weekly">Weekly</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>Pay Type</label>
                                <select value={formData.pay_type} onChange={e => setFormData(prev => ({...prev, pay_type: e.target.value}))}>
                                    <option value="Hourly">Hourly</option>
                                    <option value="Salary">Salary</option>
                                </select>
                            </div>
                            <div className="form-field full-width">
                                <label>Pay Rate</label>
                                <div className="rate-row">
                                    <span className="currency-symbol">$</span>
                                    <input type="number" step="0.01" value={formData.pay_rate} onChange={e => setFormData(prev => ({...prev, pay_rate: e.target.value}))} />
                                    <span className="currency-label">USD</span>
                                    <span className="per-label">per</span>
                                    <select value={formData.pay_period} onChange={e => setFormData(prev => ({...prev, pay_period: e.target.value}))}>
                                        <option value="Hour">-Select-</option>
                                        <option value="Hour">Hour</option>
                                        <option value="Year">Year</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <style>{`
                .hire-page {
                    min-height: 100vh;
                    background: #fcfdfe;
                    display: flex;
                    flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                .page-header {
                    background: white;
                    padding: 1.25rem 2.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #eef2f6;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .header-left h1 {
                    font-size: 1.5rem;
                    margin: 0;
                    color: #0f172a;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                }
                .header-left p {
                    margin: 2px 0 0;
                    font-size: 0.9rem;
                    color: #64748b;
                }
                .back-btn {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    border: 1px solid #eef2f6;
                    background: white;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    font-size: 1rem;
                }
                .back-btn:hover { background: #f8fafc; color: #0f172a; border-color: #e2e8f0; }
                
                .header-actions { display: flex; gap: 1rem; }
                .cancel-btn {
                    padding: 0.75rem 1.75rem;
                    border-radius: 10px;
                    border: 1px solid #eef2f6;
                    background: white;
                    color: #64748b;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .cancel-btn:hover { background: #f8fafc; color: #0f172a; }
                .save-btn {
                    padding: 0.75rem 2rem;
                    border-radius: 10px;
                    background: #1e1b4b;
                    color: white;
                    border: none;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(30, 27, 75, 0.15);
                    transition: all 0.2s;
                }
                .save-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(30, 27, 75, 0.2); }
                .save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                
                .hire-container {
                    flex: 1;
                    padding: 3rem 2rem;
                    max-width: 1000px;
                    margin: 0 auto;
                    width: 100%;
                }
                .hire-form-layout {
                    display: flex;
                    flex-direction: column;
                    gap: 2.5rem;
                }
                .hire-section {
                    background: white;
                    border-radius: 20px;
                    border: 1px solid #eef2f6;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                }
                .section-header {
                    padding: 1.25rem 2.5rem;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: #f0fdf4;
                    border-bottom: 1px solid #dcfce7;
                }
                .section-header i { color: #166534; font-size: 1.1rem; }
                .section-header h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #166534; letter-spacing: -0.01em; }
                
                .form-grid { padding: 2.5rem; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2rem; }
                .form-field { display: flex; flex-direction: column; gap: 8px; }
                .full-width { grid-column: span 4; }
                .half-width { grid-column: span 2; }
                .quarter-width { grid-column: span 1; }
                .eighth-width { grid-column: span 0.5; }

                .form-field label { font-size: 0.8rem; font-weight: 800; color: #2d6a4f; margin-bottom: 2px; }
                .form-field input, .form-field select {
                    padding: 0.85rem 1.25rem;
                    border: 1px solid #eef2f6;
                    border-radius: 12px;
                    font-size: 1rem;
                    outline: none;
                    background: #f8fafc;
                    color: #1e293b;
                    transition: all 0.2s;
                }
                .form-field input:focus, .form-field select:focus { 
                    border-color: #166534; 
                    background: white; 
                    box-shadow: 0 0 0 4px rgba(22, 101, 52, 0.05);
                }
                .form-field input::placeholder { color: #94a3b8; }
                .read-only { background: #f1f5f9 !important; color: #64748b !important; cursor: not-allowed; border-color: #e2e8f0 !important; }
                
                .input-with-icon { position: relative; }
                .input-with-icon.left i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.9rem; }
                .input-with-icon.left input { padding-left: 3rem; }
                
                .rate-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: #f8fafc;
                    border: 1px solid #eef2f6;
                    border-radius: 12px;
                    padding: 0 1.25rem;
                }
                .rate-row input { border: none !important; background: transparent !important; padding: 0.85rem 0; width: 80px; box-shadow: none !important; }
                .currency-symbol { color: #64748b; font-weight: 600; }
                .currency-label, .per-label { color: #94a3b8; font-size: 0.85rem; font-weight: 700; }
                .rate-row select { border: none !important; background: transparent !important; width: auto; padding: 0.85rem 0; font-weight: 600; }
            `}</style>
        </div>
    );
};
