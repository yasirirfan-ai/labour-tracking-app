import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export const HireWorkerPage: React.FC = () => {
    const { t } = useTranslation();
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
        staff_type: 'Permanent Staff',
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

    const handlePayScheduleChange = (value: string) => {
        let updates: any = { pay_schedule: value };
        if (value === 'Monthly') {
            updates.pay_type = 'Salary';
            updates.pay_period = 'Year';
        } else if (value === 'Twice a month') {
            updates.pay_type = 'Hourly';
            updates.pay_period = 'Hour';
        }
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleSave = async () => {
        if (!formData.name || !formData.username || !formData.pay_rate) return alert(t('hire.fillingRequired'));
        
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
            alert(t('common.error') + ': ' + error.message);
        }
        setLoading(false);
    };

    return (
        <div className="hire-page">
            <header className="page-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => navigate('/workers')} title={t('common.back')}>
                        <i className="fa-solid fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1>{isEdit ? t('hire.titleEdit') : t('hire.titleNew')}</h1>
                        <p>{formData.name || t('hire.subtitle')}</p>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="cancel-btn" onClick={() => navigate('/workers')}>{t('common.cancel')}</button>
                    <button className="save-btn" onClick={handleSave} disabled={loading}>
                        {loading ? t('common.saving') : (isEdit ? t('common.saveChanges') : t('hire.hireBtn'))}
                    </button>
                </div>
            </header>

            <div className="hire-container">
                <div className="hire-form-layout">
                    {/* Personal */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-user-gear"></i>
                            <h3>{t('hire.sections.personal')}</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>{t('hire.fields.employeeId')}</label>
                                <input type="text" value={formData.worker_id} readOnly className="read-only" />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.firstName')}</label>
                                <input type="text" placeholder={t('hire.fields.firstName')} value={formData.first_name} onChange={e => setFormData(prev => ({...prev, first_name: e.target.value, name: `${e.target.value} ${prev.last_name}`}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.middleName')}</label>
                                <input type="text" placeholder={t('hire.fields.middleName')} value={formData.middle_name} onChange={e => setFormData(prev => ({...prev, middle_name: e.target.value}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.lastName')}</label>
                                <input type="text" placeholder={t('hire.fields.lastName')} value={formData.last_name} onChange={e => setFormData(prev => ({...prev, last_name: e.target.value, name: `${prev.first_name} ${e.target.value}`}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.preferredName')}</label>
                                <input type="text" placeholder={t('hire.fields.preferredName')} value={formData.preferred_name} onChange={e => setFormData(prev => ({...prev, preferred_name: e.target.value}))} />
                            </div>
                            <div className="form-field">
                                <label>{t('hire.fields.birthDate')}</label>
                                <div className="input-with-icon">
                                    <input type="date" value={formData.birth_date} onChange={e => setFormData(prev => ({...prev, birth_date: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field">
                                <label>{t('hire.fields.gender')}</label>
                                <select value={formData.gender} onChange={e => setFormData(prev => ({...prev, gender: e.target.value}))}>
                                    <option value="">{t('common.select')}</option>
                                    <option value="Male">{t('hire.options.gender.male')}</option>
                                    <option value="Female">{t('hire.options.gender.female')}</option>
                                    <option value="Not specified">{t('hire.options.gender.notSpecified')}</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label>{t('hire.fields.maritalStatus')}</label>
                                <select value={formData.marital_status} onChange={e => setFormData(prev => ({...prev, marital_status: e.target.value}))}>
                                    <option value="">{t('common.select')}</option>
                                    <option value="Single">{t('hire.options.marital.single')}</option>
                                    <option value="Married">{t('hire.options.marital.married')}</option>
                                    <option value="Divorced">{t('hire.options.marital.divorced')}</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Job */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-briefcase"></i>
                            <h3>{t('hire.sections.job')}</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field">
                                <label>{t('hire.fields.hireDate')}</label>
                                <div className="input-with-icon">
                                    <input type="date" value={formData.hire_date} onChange={e => setFormData(prev => ({...prev, hire_date: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field half-width">
                                <label>{t('hire.fields.jobTitle')}</label>
                                <input type="text" value={formData.job_title} onChange={e => setFormData(prev => ({...prev, job_title: e.target.value}))} placeholder="e.g. Production Associate" />
                            </div>
                            <div className="form-field">
                                <label>{t('hire.fields.staffType')}</label>
                                <select value={formData.staff_type} onChange={e => setFormData(prev => ({...prev, staff_type: e.target.value}))}>
                                    <option value="Permanent Staff">{t('hire.options.staffType.permanent')}</option>
                                    <option value="Temporary Staff">{t('hire.options.staffType.temporary')}</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-house-user"></i>
                            <h3>{t('hire.sections.address')}</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field full-width">
                                <label>{t('hire.fields.street1')}</label>
                                <input type="text" value={formData.address_street1} onChange={e => setFormData(prev => ({...prev, address_street1: e.target.value}))} />
                            </div>
                            <div className="form-field full-width">
                                <label>{t('hire.fields.street2')}</label>
                                <input type="text" value={formData.address_street2} onChange={e => setFormData(prev => ({...prev, address_street2: e.target.value}))} />
                            </div>
                            <div className="form-field half-width">
                                <label>{t('hire.fields.city')}</label>
                                <input type="text" value={formData.address_city} onChange={e => setFormData(prev => ({...prev, address_city: e.target.value}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.state')}</label>
                                <input type="text" value={formData.address_state} onChange={e => setFormData(prev => ({...prev, address_state: e.target.value}))} />
                            </div>
                            <div className="form-field quarter-width">
                                <label>{t('hire.fields.zip')}</label>
                                <input type="text" value={formData.address_zip} onChange={e => setFormData(prev => ({...prev, address_zip: e.target.value}))} />
                            </div>
                        </div>
                    </section>

                    {/* Contact */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-address-book"></i>
                            <h3>{t('hire.sections.contact')}</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field half-width">
                                <label>{t('hire.fields.mobilePhone')}</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-mobile-screen"></i>
                                    <input type="text" value={formData.mobile_phone} onChange={e => setFormData(prev => ({...prev, mobile_phone: e.target.value, phone: e.target.value}))} />
                                </div>
                            </div>
                            <div className="form-field half-width">
                                <label>{t('common.username')}</label>
                                <input type="text" value={formData.username} onChange={e => setFormData(prev => ({...prev, username: e.target.value}))} />
                            </div>
                            <div className="form-field full-width">
                                <label>{t('common.email')}</label>
                                <div className="input-with-icon left">
                                    <i className="fa-solid fa-envelope"></i>
                                    <input type="text" value={formData.work_email} onChange={e => setFormData(prev => ({...prev, work_email: e.target.value, email: e.target.value}))} />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Compensation */}
                    <section className="hire-section">
                        <div className="section-header">
                            <i className="fa-solid fa-money-bill-wave"></i>
                            <h3>{t('hire.sections.compensation')}</h3>
                        </div>
                        <div className="form-grid">
                            <div className="form-field half-width">
                                <label>{t('hire.fields.paySchedule')}</label>
                                <select value={formData.pay_schedule} onChange={e => handlePayScheduleChange(e.target.value)}>
                                    <option value="">{t('common.select')}</option>
                                    <option value="Monthly">{t('hire.options.paySchedule.monthly')}</option>
                                    <option value="Twice a month">{t('hire.options.paySchedule.twiceMonth')}</option>
                                    <option value="Weekly">{t('hire.options.paySchedule.weekly')}</option>
                                </select>
                            </div>
                            <div className="form-field half-width">
                                <label>{t('hire.fields.payType')}</label>
                                <select value={formData.pay_type} onChange={e => setFormData(prev => ({...prev, pay_type: e.target.value}))}>
                                    <option value="Hourly">{t('hire.options.payType.hourly')}</option>
                                    <option value="Salary">{t('hire.options.payType.salary')}</option>
                                </select>
                            </div>
                            <div className="form-field full-width">
                                <label>{formData.pay_type === 'Salary' ? t('hire.fields.salary') : t('hire.fields.payRate')}</label>
                                <div className="rate-row">
                                    <span className="currency-symbol">$</span>
                                    <input type="number" step="0.01" value={formData.pay_rate} onChange={e => setFormData(prev => ({...prev, pay_rate: e.target.value}))} />
                                    <span className="currency-label">USD</span>
                                    <span className="per-label">per</span>
                                    <select value={formData.pay_period} onChange={e => setFormData(prev => ({...prev, pay_period: e.target.value}))}>
                                        <option value="Hour">{t('hire.options.payPeriod.hour')}</option>
                                        <option value="Year">{t('hire.options.payPeriod.year')}</option>
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
                    background: var(--bg-main);
                    display: flex;
                    flex-direction: column;
                    font-family: var(--font-main);
                }
                .page-header {
                    background: var(--bg-card);
                    padding: 1.25rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border);
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
                    color: var(--text-main);
                    font-weight: 800;
                }
                .header-left p {
                    margin: 2px 0 0;
                    font-size: 0.9rem;
                    color: var(--text-muted);
                }
                .back-btn {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    border: 1px solid var(--border);
                    background: var(--bg-main);
                    color: var(--text-muted);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .back-btn:hover { background: var(--bg-card); color: var(--text-main); }
                
                .header-actions { display: flex; gap: 1rem; }
                .cancel-btn {
                    padding: 0.75rem 1.5rem;
                    border-radius: 10px;
                    border: 1px solid var(--border);
                    background: var(--bg-main);
                    color: var(--text-muted);
                    font-weight: 700;
                    cursor: pointer;
                }
                .cancel-btn:hover { background: var(--bg-card); color: var(--text-main); }
                .save-btn {
                    padding: 0.75rem 1.75rem;
                    border-radius: 10px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    font-weight: 700;
                    cursor: pointer;
                }
                
                .hire-container {
                    flex: 1;
                    padding: 2rem;
                    max-width: 1000px;
                    margin: 0 auto;
                    width: 100%;
                }
                .hire-form-layout {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                }
                .hire-section {
                    background: var(--bg-card);
                    border-radius: 16px;
                    border: 1px solid var(--border);
                    overflow: hidden;
                }
                .section-header {
                    padding: 1rem 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: var(--bg-main);
                    border-bottom: 1px solid var(--border);
                }
                .section-header i { color: var(--primary); }
                .section-header h3 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-main); }
                
                .form-grid { 
                    padding: 1.5rem; 
                    display: grid; 
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
                    gap: 1.5rem; 
                }
                .form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
                .full-width { grid-column: 1 / -1; }
                .half-width { grid-column: span 2; }
                .quarter-width { grid-column: span 1; }
                .eighth-width { grid-column: span 0.5; }

                @media (max-width: 768px) {
                    .form-grid { grid-template-columns: 1fr 1fr; }
                    .quarter-width, .eighth-width { grid-column: span 1; }
                    .full-width, .half-width { grid-column: span 2; }
                }

                .form-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .form-field input, .form-field select {
                    padding: 0.75rem 1rem;
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    font-size: 0.95rem;
                    outline: none;
                    background: var(--bg-main);
                    color: var(--text-main);
                    transition: all 0.2s;
                }
                .form-field input:focus, .form-field select:focus { 
                    border-color: var(--primary); 
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }
                .read-only { background: var(--bg-main) !important; color: var(--text-muted) !important; opacity: 0.7; }
                
                .input-with-icon { position: relative; }
                .input-with-icon.left i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
                .input-with-icon.left input { padding-left: 2.5rem; }
                
                .rate-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: var(--bg-main);
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    padding: 0 1rem;
                }
                .rate-row input { border: none !important; background: transparent !important; padding: 0.75rem 0; width: 80px; box-shadow: none !important; }
                .currency-symbol { color: var(--text-muted); font-weight: 600; }
                .currency-label, .per-label { color: var(--text-muted); font-size: 0.8rem; font-weight: 600; }
                .rate-row select { border: none !important; background: transparent !important; width: auto; padding: 0.75rem 0; }
            `}</style>
        </div>
    );
};
