import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
    syncLeaveBalances,
    fetchLeaveHistory,
    getTenureMonths,
    getPtoRate,
    isSickLeaveUsable
} from '../lib/accrualService';
import type { LeaveHistoryRow } from '../lib/accrualService';
import type { User } from '../types';
import { trainingService } from '../lib/trainingService';
import type { TrainingMaterial } from '../lib/trainingService';
import { useTranslation } from 'react-i18next';

export const EmployeeDetailView: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [employee, setEmployee] = useState<User | null>(null);
    const [initialEmployee, setInitialEmployee] = useState<User | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Overview');
    const isSyncing = useRef(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [historySearch, setHistorySearch] = useState('');
    const [eeoSearch, setEeoSearch] = useState('');
    const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
    const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
    const [isEquityModalOpen, setIsEquityModalOpen] = useState(false);
    const [isOrgChartModalOpen, setIsOrgChartModalOpen] = useState(false);
    const [accrualHistoryType, setAccrualHistoryType] = useState<'pto' | 'sick'>('pto');
    const [leaveHistory, setLeaveHistory] = useState<LeaveHistoryRow[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [isProcessingLeave, setIsProcessingLeave] = useState<string | null>(null);
    const [selectedTrainingRole, setSelectedTrainingRole] = useState<string | null>(null);
    const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
    const [trainingLanguage, setTrainingLanguage] = useState<'en' | 'es'>('en');
    const [selectedHistoryYear, setSelectedHistoryYear] = useState<string>('All');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyView, setHistoryView] = useState<'balance' | 'requests'>('balance');
    const itemsPerPage = 20;

    // Modals
    const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
    const [isCalculateModalOpen, setIsCalculateModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [adjustmentType, setAdjustmentType] = useState<'pto' | 'sick'>('pto');
    const [calculateAsOfDate, setCalculateAsOfDate] = useState(new Date().toISOString().split('T')[0]);
    const [adjustmentForm, setAdjustmentForm] = useState({ amount: 0, direction: 'add' as 'add' | 'deduct', description: '', effectiveDate: new Date().toISOString().split('T')[0] });
    const [recordForm, setRecordForm] = useState({ type: 'pto' as 'pto' | 'sick', startDate: new Date().toISOString().split('T')[0], hours: 8, description: '' });
    const [calculatedFutureBalance, setCalculatedFutureBalance] = useState<{ pto: number, sick: number } | null>(null);

    useEffect(() => {
        const fetchTrainings = async () => {
            const materials = await trainingService.getAllMaterials(trainingLanguage);
            setTrainingMaterials(materials);
        };
        fetchTrainings();
    }, [trainingLanguage]);

    const fetchLeaveRequests = async (employeeId: string) => {
        const { data } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('user_id', employeeId)
            .order('created_at', { ascending: false });
        if (data) setLeaveRequests(data);
    };

    const fetchEmployee = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id || '')
            .single();

        if (data) {
            setEmployee(data as User);
            setInitialEmployee(data as User);
        } else if (error) {
            console.error('Error fetching employee:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (id) fetchEmployee();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    /** Auto-fetch history whenever the Time Off tab becomes active */
    useEffect(() => {
        if (activeTab === 'Time Off' && employee) {
            if (isSyncing.current) return;
            isSyncing.current = true;

            const sync = async () => {
                try {
                    const res: any = await syncLeaveBalances(employee as any);
                    if (res && !res.error) {
                        setEmployee(prev => prev ? { ...prev, pto_balance: String(res.pto), sick_balance: String(res.sick) } : null);
                    }
                    const rows = await fetchLeaveHistory(employee.id);
                    setLeaveHistory(rows);
                    fetchLeaveRequests(employee.id);
                } finally {
                    isSyncing.current = false;
                }
            };
            sync();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, !!employee]);

    /** Reset history page when filters change */
    useEffect(() => {
        setHistoryPage(1);
    }, [accrualHistoryType, selectedHistoryYear, historySearch]);

    /** Real-time name sync */
    useEffect(() => {
        if (employee && (employee.first_name || employee.last_name)) {
            const newName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
            if (employee.name !== newName) {
                setEmployee(prev => prev ? { ...prev, name: newName } : null);
            }
        }
    }, [employee?.first_name, employee?.last_name]);

    if (loading) return <div className="loading-screen">{t('common.loading')}</div>;
    if (!employee || !initialEmployee) return <div>{t('common.notFound')}</div>;

    const isDirty = JSON.stringify(employee) !== JSON.stringify(initialEmployee);

    const handleSave = async () => {
        if (!employee) return;
        setValidationErrors({});

        // Validation
        const errors: Record<string, string> = {};
        if (!employee.worker_id?.trim()) errors.worker_id = t('employeeDetail.personal.idRequired');
        if (!employee.first_name?.trim()) errors.first_name = t('employeeDetail.personal.firstNameRequired');

        const validatePhone = (val?: string) => {
            if (!val) return true;
            return /^[0-9+() -]*$/.test(val);
        };

        if (!validatePhone(employee.phone)) errors.phone = t('employeeDetail.personal.phoneNumeric');
        if (!validatePhone(employee.work_phone)) errors.work_phone = t('employeeDetail.personal.phoneNumeric');
        if (!validatePhone(employee.mobile_phone)) errors.mobile_phone = t('employeeDetail.personal.phoneNumeric');
        if (!validatePhone(employee.home_phone)) errors.home_phone = t('employeeDetail.personal.phoneNumeric');
        if (!validatePhone(employee.emergency_contact_phone)) errors.emergency_contact_phone = t('employeeDetail.personal.phoneNumeric');

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);

            // Map each field to the tab it lives on so we can auto-navigate.
            const fieldTabMap: Record<string, string> = {
                worker_id: 'Personal',
                first_name: 'Personal',
                phone: 'Personal',
                work_phone: 'Personal',
                mobile_phone: 'Personal',
                home_phone: 'Personal',
                emergency_contact_phone: 'Emergency',
            };

            // Find the first failing field and switch to its tab.
            const firstErrorField = Object.keys(errors)[0];
            const targetTab = fieldTabMap[firstErrorField] || 'Personal';
            setActiveTab(targetTab);

            // Build a helpful message.
            const fieldLabels: Record<string, string> = {
                worker_id: t('employeeDetail.personal.employeeNum'),
                first_name: t('employeeDetail.personal.firstName'),
                phone: t('employeeDetail.personal.phone'),
                work_phone: t('employeeDetail.personal.workPhone'),
                mobile_phone: t('employeeDetail.personal.mobilePhone'),
                home_phone: t('employeeDetail.personal.homePhone'),
                emergency_contact_phone: t('employeeDetail.emergency.phone'),
            };
            const missingLabels = Object.keys(errors)
                .map(k => fieldLabels[k] || k)
                .join(', ');

            setToast({
                message: t('employeeDetail.personal.fixOnTab', { tab: targetTab, fields: missingLabels }),
                type: 'error',
            });
            setTimeout(() => setToast(null), 5000);
            return;
        }

        setIsSaving(true);
        try {
            const { error } = await (supabase.from('users') as any).update(employee).eq('id', (employee as any).id);
            if (error) throw error;

            setInitialEmployee(employee);
            setToast({ message: t('employeeDetail.personal.updateSuccess'), type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast({ message: err.message || t('common.error'), type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLeaveAction = async (request: any, status: 'approved' | 'rejected') => {
        const adminNotes = window.prompt(`Add a note for this ${status} (optional):`);
        if (adminNotes === null) return;

        setIsProcessingLeave(request.id);

        try {
            // 1. Update request status
            const { error: reqError } = await (supabase.from('leave_requests') as any)
                .update({
                    status,
                    admin_notes: adminNotes,
                    processed_at: new Date().toISOString()
                })
                .eq('id', request.id);

            if (reqError) throw reqError;

            // 2. If approved, deduct balance
            if (status === 'approved') {
                const isMonthly = (employee as any)?.pay_schedule?.toLowerCase().includes('monthly') && !(employee as any)?.pay_schedule?.toLowerCase().includes('semi');
                const balanceField = (request.type === 'sick' && isMonthly) ? 'pto_balance' : (request.type === 'pto' ? 'pto_balance' : 'sick_balance');
                const typeForHistory = (request.type === 'sick' && isMonthly) ? 'pto' : request.type;

                const currentBalance = parseFloat((employee as any)?.[balanceField] || '0');
                const newBalance = (currentBalance - request.hours_requested).toFixed(2);

                // Update balance on user
                const { error: balanceError } = await (supabase.from('users') as any)
                    .update({ [balanceField]: newBalance })
                    .eq('id', request.user_id);

                if (balanceError) throw balanceError;

                // 3. Add to leave_history
                const description = (request.type === 'sick' && isMonthly)
                    ? `Sick leave approved – deducted from PTO for ${request.start_date} - ${request.end_date}`
                    : `Approved ${request.type.toUpperCase()} for ${request.start_date} - ${request.end_date}`;

                const { error: historyError } = await (supabase.from('leave_history') as any).insert([{
                    user_id: request.user_id,
                    type: typeForHistory,
                    used_hours: request.hours_requested,
                    earned_hours: null,
                    balance: parseFloat(newBalance),
                    description: description,
                    entry_date: request.start_date,
                    created_at: new Date().toISOString()
                }]);

                if (historyError) throw historyError;
            }

            setToast({ message: t('leave.actions.success', { status: t(`leave.filters.${status}`) }), type: 'success' });
            setTimeout(() => setToast(null), 3000);
            fetchEmployee();
            if (employee?.id) fetchLeaveRequests(employee.id);
        } catch (err: any) {
            setToast({ message: err.message || t('leave.actions.error', { message: '' }), type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsProcessingLeave(null);
        }
    };

    const handleRecordTimeOff = async () => {
        if (!employee) return;
        setIsSaving(true);
        try {
            const { data: req } = await (supabase.from('leave_requests') as any).insert({
                user_id: employee.id,
                type: recordForm.type,
                start_date: recordForm.startDate,
                end_date: recordForm.startDate,
                hours_requested: recordForm.hours,
                reason: recordForm.description,
                status: 'approved'
            }).select().single();

            if (req) {
                const currentBal = parseFloat((employee as any)[recordForm.type === 'pto' ? 'pto_balance' : 'sick_balance'] || '0');
                await (supabase.from('leave_history') as any).insert({
                    user_id: employee.id,
                    type: recordForm.type,
                    used_hours: recordForm.hours,
                    balance: currentBal - recordForm.hours,
                    entry_date: recordForm.startDate,
                    description: recordForm.description || `Admin Recorded: ${recordForm.hours}hrs ${recordForm.type.toUpperCase()}`
                });
                await syncLeaveBalances(employee!);
                setIsRecordModalOpen(false);
                // Refresh both employee data AND leave history
                await fetchEmployee();
                const updatedHistory = await fetchLeaveHistory(employee.id);
                setLeaveHistory(updatedHistory);
                setToast({ message: 'Time off recorded successfully', type: 'success' });
                setTimeout(() => setToast(null), 3000);
            }
        } catch (err: any) {
            setToast({ message: err.message || 'Error recording time off', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdjustBalance = async () => {
        if (!employee) return;
        setIsSaving(true);
        try {
            const balanceField = adjustmentType === 'pto' ? 'pto_balance' : 'sick_balance';
            const currentBalance = parseFloat((employee as any)[balanceField] || '0');
            // direction: 'add' increases, 'deduct' decreases
            const delta = adjustmentForm.direction === 'add'
                ? Math.abs(adjustmentForm.amount)
                : -Math.abs(adjustmentForm.amount);
            const newBalance = parseFloat((currentBalance + delta).toFixed(2));

            const description = adjustmentForm.description ||
                `Admin ${adjustmentForm.direction === 'add' ? 'Added' : 'Deducted'} ${Math.abs(adjustmentForm.amount)} hrs (${adjustmentType.toUpperCase()})`;

            await (supabase.from('leave_history') as any).insert({
                user_id: employee.id,
                type: adjustmentType,
                earned_hours: delta > 0 ? delta : null,
                used_hours: delta < 0 ? Math.abs(delta) : null,
                balance: newBalance,
                entry_date: adjustmentForm.effectiveDate,
                description
            });

            await (supabase.from('users') as any).update({ [balanceField]: newBalance }).eq('id', employee.id);
            setIsAdjustModalOpen(false);
            setAdjustmentForm({ amount: 0, direction: 'add', description: '', effectiveDate: new Date().toISOString().split('T')[0] });
            // Refresh both employee data AND leave history
            await fetchEmployee();
            const updatedHistory = await fetchLeaveHistory(employee.id);
            setLeaveHistory(updatedHistory);
            setToast({ message: `Balance ${adjustmentForm.direction === 'add' ? 'increased' : 'decreased'} by ${Math.abs(adjustmentForm.amount)} hrs`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast({ message: err.message || 'Error adjusting balance', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsSaving(false);
        }
    };



    const handleProjectFuture = () => {
        if (!employee) return;
        const targetDate = new Date(calculateAsOfDate);
        const today = new Date();
        if (targetDate <= today) {
            setCalculatedFutureBalance({
                pto: parseFloat(employee.pto_balance || '0'),
                sick: parseFloat(employee.sick_balance || '0')
            });
            return;
        }

        // Simple simulation: Accrual every 15 days
        const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const cycles = Math.floor(diffDays / 15);

        const ptoPerCycle = 5; // Example rates
        const sickPerCycle = 2.5;

        setCalculatedFutureBalance({
            pto: parseFloat(employee.pto_balance || '0') + (cycles * ptoPerCycle),
            sick: parseFloat(employee.sick_balance || '0') + (cycles * sickPerCycle)
        });
    };


    const tabs = ['Personal', 'Job', 'Training', 'Emergency', 'Time Off', 'Benefits'];

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
                        <i className="fa-solid fa-arrow-left"></i> {t('common.backToPeople')}
                    </button>
                </div>

                <div className="header-main">
                    <div className="profile-photo-container">
                        {employee.photo_url ? (
                            <img src={employee.photo_url} alt={String(employee.name || 'Worker')} />
                        ) : (
                            <div className="profile-photo-placeholder">
                                {employee.name ? String(employee.name).substring(0, 2).toUpperCase() : '??'}
                            </div>
                        )}
                    </div>
                    <div className="profile-title-info">
                        <h1>{employee.name}</h1>
                        <p>{employee.job_title || 'Manufacturing Associate'}</p>
                    </div>
                </div>

                <nav className="profile-nav">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {t(`employeeDetail.tabs.${tab.toLowerCase()}`, tab)}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="profile-content">
                <aside className="profile-sidebar">
                    <section className="sidebar-section">
                        <h3>{t('employeeDetail.vitals')}</h3>
                        <div className="vitals-list">
                            <div className="vital-item"><i className="fa-solid fa-phone"></i> {employee.work_phone || employee.phone || t('common.notAvailable')}</div>
                            <div className="vital-item"><i className="fa-solid fa-envelope"></i> <a href={`mailto:${employee.work_email || employee.email || employee.username}`} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{employee.work_email || employee.email || employee.username}</a></div>
                            <div className="vital-item"><i className="fa-solid fa-briefcase"></i> {employee.job_title || t('employeeDetail.job.defaultTitle')} <br /> {t('hire.options.employment.fullTime')}</div>
                            <div className="vital-item"><i className="fa-solid fa-building"></i> {employee.department || t('employeeDetail.job.defaultDepartment')}</div>
                        </div>
                    </section>

                    <section className="sidebar-section">
                        <h3>{t('employeeDetail.hireDate')}</h3>
                        <div className="vital-item">
                            <i className="fa-solid fa-calendar"></i>
                            {employee.hire_date || '—'}
                            <br />
                            {employee.hire_date ? (
                                (() => {
                                    const m = getTenureMonths(employee.hire_date);
                                    const y = Math.floor(m / 12);
                                    const r = m % 12;
                                    return `${y > 0 ? y + 'y ' : ''}${r}m`;
                                })()
                            ) : '—'}
                        </div>
                    </section>

                    <section className="sidebar-section">
                        <h3>{t('employeeDetail.manager')}</h3>
                        <div className="manager-info">
                            <div className="manager-photo">
                                <i className="fa-solid fa-user"></i>
                            </div>
                            <div>
                                <strong>Cody Chalker</strong>
                                <p>Chief Technology Officer</p>
                            </div>
                        </div>
                        <button className="text-link" onClick={() => setIsOrgChartModalOpen(true)}>{t('employeeDetail.viewInOrgChart')}</button>
                    </section>
                </aside>

                <main className="main-details">
                    {activeTab === 'Training' && (() => {
                        const completed = employee.completed_trainings || [];

                        const l1Materials = trainingMaterials.filter(m => m.level === 1);
                        const l1Categories = Array.from(new Set(l1Materials.map(m => m.category)));

                        // Level 1 Progress
                        const l1CompletedCount = completed.filter(t => l1Categories.includes(t)).length;
                        const l1Total = l1Categories.length;
                        const l1Percent = l1Total > 0 ? Math.round((l1CompletedCount / l1Total) * 100) : 0;

                        // Get unique roles from L2
                        const l2Roles = Array.from(new Set(trainingMaterials.filter(m => m.level === 2).map(m => m.department))).filter(Boolean) as string[];

                        // Level 2 Progress (using role-based SOPs)
                        const autoRole = (employee.job_title?.includes('QC') || employee.department === 'QC') ? 'QC' :
                            (employee.job_title?.includes('Compounder')) ? 'Compounder I' :
                                (employee.job_title?.includes('QA') || employee.department === 'QA') ? 'Quality Assurance' :
                                    (employee.department?.toLowerCase().includes('shipp')) ? 'Shipping & Recieving' :
                                        (employee.department?.toLowerCase().includes('purchas')) ? 'Purchase' : 'Production';

                        const role = selectedTrainingRole || autoRole;

                        const roleMaterials = trainingMaterials.filter(m => m.level === 2 && m.department === role);

                        const l2Total = roleMaterials.length;
                        const l2CompletedCount = completed.filter(t => roleMaterials.some(m => m.display_name === t)).length;
                        const l2Percent = l2Total > 0 ? Math.round((l2CompletedCount / l2Total) * 100) : 0;
                        const totalPercent = Math.round((l1Percent + l2Percent) / 2);

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div className="section-title-row">
                                    <i className="fa-solid fa-graduation-cap"></i>
                                    <h2>{t('employeeDetail.training.title')}</h2>
                                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <i className="fa-solid fa-language" style={{ color: 'var(--primary)', fontSize: '1rem' }}></i>
                                            <select
                                                value={trainingLanguage}
                                                onChange={(e) => setTrainingLanguage(e.target.value as any)}
                                                style={{ background: 'transparent', border: 'none', color: '#1e1b4b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                                            >
                                                <option value="en">English</option>
                                                <option value="es">Español</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('employeeDetail.training.viewingRole')}</span>
                                            <select
                                                value={role}
                                                onChange={(e) => setSelectedTrainingRole(e.target.value)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e2e8f0',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    color: '#1e1b4b',
                                                    cursor: 'pointer',
                                                    background: '#f8fafc'
                                                }}
                                            >
                                                {l2Roles.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="training-summary-row" style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '2rem',
                                    background: 'white',
                                    padding: '2.5rem',
                                    borderRadius: '24px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                }}>
                                    {/* Level 1 Circle */}
                                    <div style={{ textAlign: 'center' }}>
                                        <div className="progress-circle-mid" style={{ marginBottom: '1.25rem' }}>
                                            <svg viewBox="0 0 36 36">
                                                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <path className="circle" style={{ stroke: l1Percent === 100 ? '#10b981' : '#f59e0b' }} strokeDasharray={`${l1Percent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <text x="18" y="20.35" className="progress-percentage-mid">{l1Percent}%</text>
                                            </svg>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('employeeDetail.training.level1Progress')}</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '0.5rem' }}>{l1CompletedCount} / {l1Total} SOPs</div>
                                    </div>

                                    {/* Level 2 Circle */}
                                    <div style={{ textAlign: 'center' }}>
                                        <div className="progress-circle-mid" style={{ marginBottom: '1.25rem' }}>
                                            <svg viewBox="0 0 36 36">
                                                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <path className="circle" style={{ stroke: l2Percent === 100 ? '#10b981' : '#4f46e5' }} strokeDasharray={`${l2Percent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <text x="18" y="20.35" className="progress-percentage-mid">{l2Percent}%</text>
                                            </svg>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Level 2 Progress</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#1e293b', marginTop: '0.5rem' }}>{l2CompletedCount} / {l2Total} SOPs</div>
                                    </div>

                                    {/* Total Circle */}
                                    <div style={{ textAlign: 'center' }}>
                                        <div className="progress-circle-mid" style={{ marginBottom: '1.25rem' }}>
                                            <svg viewBox="0 0 36 36">
                                                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <path className="circle" style={{ stroke: totalPercent === 100 ? '#10b981' : '#1e1b4b' }} strokeDasharray={`${totalPercent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                <text x="18" y="20.35" className="progress-percentage-mid">{l1CompletedCount + l2CompletedCount}</text>
                                            </svg>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('employeeDetail.training.totalCompleted')}</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#1e293b', marginTop: '0.5rem' }}>{Math.round(((l1CompletedCount + l2CompletedCount) / (l1Total + l2Total)) * 100)}% {t('employeeDetail.training.overall')}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>{t('employeeDetail.training.coreTitle')}</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                                        {l1Categories.map((tName, idx) => {
                                            const isDone = completed.includes(tName);
                                            return (
                                                <div key={idx} style={{
                                                    background: 'white',
                                                    padding: '1.25rem',
                                                    borderRadius: '16px',
                                                    border: '1px solid #e2e8f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem'
                                                }}>
                                                    <div style={{
                                                        width: '40px', height: '40px', borderRadius: '10px',
                                                        background: isDone ? '#dcfce7' : '#f1f5f9',
                                                        color: isDone ? '#10b981' : '#94a3b8',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        <i className={`fa-solid ${isDone ? 'fa-check' : 'fa-clock'}`}></i>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b' }}>{tName}</div>
                                                        <div style={{ fontSize: '0.75rem', color: isDone ? '#10b981' : '#64748b', fontWeight: 700 }}>
                                                            {isDone ? t('employeeDetail.training.completed') : t('employeeDetail.training.pending')}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>{t('employeeDetail.training.roleTitle', { role })}</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                                        {roleMaterials.map((doc, idx) => {
                                            const isDone = completed.includes(doc.display_name);
                                            return (
                                                <div key={`${doc.category}-${idx}`} style={{
                                                    background: 'white',
                                                    padding: '1.25rem',
                                                    borderRadius: '16px',
                                                    border: '1px solid #e2e8f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem'
                                                }}>
                                                    <div style={{
                                                        width: '40px', height: '40px', borderRadius: '10px',
                                                        background: isDone ? '#dcfce7' : '#f1f5f9',
                                                        color: isDone ? '#10b981' : '#94a3b8',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        <i className={`fa-solid ${isDone ? 'fa-check' : 'fa-book'}`}></i>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.display_name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: isDone ? '#10b981' : '#64748b', fontWeight: 700 }}>
                                                            {isDone ? t('employeeDetail.training.completed') : t('employeeDetail.training.pending')}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'Time Off' && (() => {
                        const hireDate = employee.hire_date || '';
                        const tenureMonths = hireDate ? getTenureMonths(hireDate) : 0;
                        const ptoRate = getPtoRate(tenureMonths);
                        const sickUsable = hireDate ? isSickLeaveUsable(hireDate) : false;
                        const ptoBalance = parseFloat(employee.pto_balance || '0');
                        const sickBalance = parseFloat(employee.sick_balance || '0');

                        const isMonthly = (employee as any)?.pay_schedule?.toLowerCase().includes('monthly') && !(employee as any)?.pay_schedule?.toLowerCase().includes('semi');
                        const periodLabel = isMonthly ? '30 days' : '15 days';

                        /** Filter real leave history by selected type, year, and search */
                        const displayRows = leaveHistory.filter(r => {
                            const matchesType = r.type === accrualHistoryType;
                            const matchesYear = selectedHistoryYear === 'All' || (r.entry_date || '').startsWith(selectedHistoryYear);
                            const matchesSearch = (r.description || '').toLowerCase().includes(historySearch.toLowerCase());
                            return matchesType && matchesYear && matchesSearch;
                        });

                        const sortedRows = [...displayRows].sort((a, b) => {
                            if (b.entry_date !== a.entry_date) {
                                return (b.entry_date || '').localeCompare(a.entry_date || '');
                            }
                            return (b.created_at || '').localeCompare(a.created_at || '');
                        });

                        const totalPages = Math.ceil(displayRows.length / itemsPerPage);

                        const paginatedRows = sortedRows.slice(
                            (historyPage - 1) * itemsPerPage,
                            historyPage * itemsPerPage
                        );

                        const years = Array.from({ length: 12 }, (_, i) => String(2026 - i));

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                                {/* Header */}
                                <div className="section-title-row">
                                    <i className="fa-solid fa-calendar-alt"></i>
                                    <h2>{t('employeeDetail.timeOff.title')}</h2>
                                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }}></span>
                                        {t('common.live', 'Live')}
                                    </div>
                                </div>


                                {/* Balance Cards */}
                                <div className="time-off-grid" style={{ display: 'grid', gridTemplateColumns: isMonthly ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
                                    {/* PTO Card */}
                                    <div className="time-off-card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                            <div className="card-icon"><i className="fa-solid fa-palm-tree"></i></div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button className="pill-control-btn" onClick={() => setIsCalculateModalOpen(true)} title="Project Future Balance"><i className="fa-solid fa-calculator"></i></button>
                                                <button className="pill-control-btn" onClick={() => { setAdjustmentType('pto'); setIsAdjustModalOpen(true); }} title="Adjust Balance"><i className="fa-solid fa-plus"></i></button>
                                            </div>
                                        </div>
                                        <div className="card-value">
                                            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                                                {ptoBalance.toFixed(2)}
                                            </span>
                                            <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>{t('employeeDetail.timeOff.hrs', 'Hrs')}</span>
                                        </div>
                                        <div className="card-label">{t('employeeDetail.timeOff.ptoLabel')}</div>
                                        <div className="card-sublabel">{ptoRate.toFixed(2)} hrs / {periodLabel}</div>
                                    </div>

                                    {/* Sick Card */}
                                    {!isMonthly && (
                                        <div className="time-off-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                                <div className="card-icon">
                                                    <i className="fa-solid fa-hospital"></i>
                                                    {!sickUsable && (
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 700, background: '#fef3c7',
                                                            color: '#92400e', padding: '0.15rem 0.5rem',
                                                            borderRadius: '20px', marginLeft: '0.5rem',
                                                        }}>{t('employeeDetail.timeOff.waitPeriod')}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="pill-control-btn" onClick={() => setIsCalculateModalOpen(true)} title="Project Future Balance"><i className="fa-solid fa-calculator"></i></button>
                                                    <button className="pill-control-btn" onClick={() => { setAdjustmentType('sick'); setIsAdjustModalOpen(true); }} title="Adjust Balance"><i className="fa-solid fa-plus"></i></button>
                                                </div>
                                            </div>
                                            <div className="card-value">
                                                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                                                    {sickBalance.toFixed(2)}
                                                </span>
                                                <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>{t('employeeDetail.timeOff.hrs', 'Hrs')}</span>
                                            </div>
                                            <div className="card-label">{t('employeeDetail.timeOff.sickLabel')}</div>
                                            <div className="card-sublabel">{t('employeeDetail.timeOff.sickCap')}</div>
                                        </div>
                                    )}

                                    {/* Monthly Sick Notification */}
                                    {isMonthly && (
                                        <div className="time-off-card" style={{ opacity: 0.8, background: '#f8fafc', borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                            <div>
                                                <i className="fa-solid fa-hospital" style={{ color: '#94a3b8', fontSize: '1.5rem', marginBottom: '0.5rem' }}></i>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b' }}>Sick leave is deducted from PTO</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Monthly worker policy applied</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Upcoming & Pending Requests */}
                                <div className="upcoming-section">
                                    <h3><i className="fa-solid fa-clock"></i> {t('employeeDetail.timeOff.requests')}</h3>
                                    {leaveRequests.filter(req => req.status === 'pending').length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                            {leaveRequests.filter(req => req.status === 'pending').map(req => (
                                                <div key={req.id} style={{
                                                    background: 'white',
                                                    padding: '1.25rem',
                                                    borderRadius: '16px',
                                                    border: '1px solid #e2e8f0',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                        <div style={{
                                                            width: '45px',
                                                            height: '45px',
                                                            borderRadius: '12px',
                                                            background: req.type === 'pto' ? '#e0f2fe' : '#f0fdf4',
                                                            color: req.type === 'pto' ? '#0369a1' : '#15803d',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '1.2rem'
                                                        }}>
                                                            <i className={`fa-solid ${req.type === 'pto' ? 'fa-umbrella-beach' : 'fa-briefcase-medical'}`}></i>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1rem' }}>
                                                                {req.type.toUpperCase()} Request • {req.hours_requested} hrs
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                                                                {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                                                            </div>
                                                            {req.reason && <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '0.25rem' }}>"{req.reason}"</div>}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            background: req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                                            color: req.status === 'approved' ? '#15803d' : req.status === 'rejected' ? '#991b1b' : '#92400e'
                                                        }}>
                                                            {String(t(`leave.filters.${req.status}`, req.status))}
                                                        </span>
                                                        {req.status === 'pending' && (
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button
                                                                    onClick={() => handleLeaveAction(req, 'approved')}
                                                                    disabled={isProcessingLeave === req.id}
                                                                    className="small-action-btn"
                                                                    style={{ background: '#10b981', color: 'white', border: 'none' }}
                                                                >
                                                                    {t('leave.actions.approve')}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleLeaveAction(req, 'rejected')}
                                                                    disabled={isProcessingLeave === req.id}
                                                                    className="small-action-btn"
                                                                    style={{ background: '#ef4444', color: 'white', border: 'none' }}
                                                                >
                                                                    {t('leave.actions.reject')}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <i className="fa-solid fa-calendar-xmark" style={{ fontSize: '3rem', color: '#e2e8f0' }}></i>
                                            <p>{t('employeeDetail.timeOff.noRequests')}</p>
                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{t('employeeDetail.timeOff.getAway')}</span>
                                        </div>
                                    )}
                                </div>

                                {/* History */}
                                <div className="history-section">
                                    <div className="history-header">
                                        <span className="history-title"><i className="fa-solid fa-clock-rotate-left"></i> {t('employeeDetail.timeOff.history')}</span>
                                        <div className="history-filters">
                                            <div className="custom-dropdown-container">
                                                <div
                                                    className={`custom-dropdown-header ${openDropdown === 'type' ? 'active' : ''}`}
                                                    onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
                                                >
                                                    {accrualHistoryType === 'pto' ? 'Paid Time Off (PTO)' : 'Sick Time'}
                                                    <i className="fa-solid fa-chevron-down"></i>
                                                </div>
                                                {openDropdown === 'type' && (
                                                    <div className="dropdown-menu">
                                                        <div
                                                            className={`dropdown-item ${accrualHistoryType === 'pto' ? 'selected' : ''}`}
                                                            onClick={() => { setAccrualHistoryType('pto'); setOpenDropdown(null); }}
                                                        >Paid Time Off (PTO)</div>
                                                        <div
                                                            className={`dropdown-item ${accrualHistoryType === 'sick' ? 'selected' : ''}`}
                                                            onClick={() => { setAccrualHistoryType('sick'); setOpenDropdown(null); }}
                                                        >Sick Time</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="custom-dropdown-container">
                                                <div
                                                    className={`custom-dropdown-header small ${openDropdown === 'year' ? 'active' : ''}`}
                                                    onClick={() => setOpenDropdown(openDropdown === 'year' ? null : 'year')}
                                                >
                                                    {selectedHistoryYear} <i className="fa-solid fa-chevron-down"></i>
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
                                                        <div
                                                            className={`dropdown-item ${selectedHistoryYear === 'All' ? 'selected' : ''}`}
                                                            onClick={() => { setSelectedHistoryYear('All'); setOpenDropdown(null); }}
                                                        >All</div>
                                                        {years.map(y => (
                                                            <div
                                                                key={y}
                                                                className={`dropdown-item ${selectedHistoryYear === y ? 'selected' : ''}`}
                                                                onClick={() => { setSelectedHistoryYear(y); setOpenDropdown(null); }}
                                                            >{y}</div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="custom-dropdown-container">
                                                <div
                                                    className={`custom-dropdown-header ${openDropdown === 'view' ? 'active' : ''}`}
                                                    onClick={() => setOpenDropdown(openDropdown === 'view' ? null : 'view')}
                                                >
                                                    {historyView === 'requests' ? 'Requests' : 'Balance History'} <i className="fa-solid fa-chevron-down"></i>
                                                </div>
                                                {openDropdown === 'view' && (
                                                    <div className="dropdown-menu">
                                                        <div
                                                            className={`dropdown-item ${historyView === 'requests' ? 'selected' : ''}`}
                                                            onClick={() => { setHistoryView('requests'); setOpenDropdown(null); }}
                                                        >Requests</div>
                                                        <div
                                                            className={`dropdown-item ${historyView === 'balance' ? 'selected' : ''}`}
                                                            onClick={() => { setHistoryView('balance'); setOpenDropdown(null); }}
                                                        >Balance History</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {historyView === 'requests' ? (
                                        leaveRequests.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                                                <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}></i>
                                                No leave requests found.
                                            </div>
                                        ) : (
                                            <table className="history-table">
                                                <thead>
                                                    <tr>
                                                        <th>Date <i className="fa-solid fa-arrow-up"></i></th>
                                                        <th>Description</th>
                                                        <th>Submitted</th>
                                                        <th>Status</th>
                                                        <th>(-)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {leaveRequests
                                                        .filter(req => accrualHistoryType === 'pto' ? (req.type === 'pto' || req.type === 'vacation') : req.type === 'sick')
                                                        .map((req) => {
                                                            const fmtDate = (d: string) => {
                                                                if (!d) return '';
                                                                const [y, m, day] = d.split('T')[0].split('-');
                                                                return `${m}/${day}/${y}`;
                                                            };
                                                            const statusColor = req.status === 'approved' ? '#16a34a' : req.status === 'rejected' || req.status === 'cancelled' ? '#dc2626' : '#d97706';
                                                            const approverName = req.approved_by_name || req.rejected_by_name || '';
                                                            const actionDate = req.approved_at || req.rejected_at || req.updated_at || '';
                                                            const actionDateFmt = actionDate ? fmtDate(actionDate) : '';
                                                            return (
                                                                <tr key={req.id}>
                                                                    <td style={{ whiteSpace: 'nowrap' }}>
                                                                        {fmtDate(req.start_date)} - {fmtDate(req.end_date)}
                                                                    </td>
                                                                    <td>
                                                                        <div>{req.type === 'pto' || req.type === 'vacation' ? 'Paid Time Off (PTO)' : 'Sick Time'}</div>
                                                                        {req.reason && <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>See Comments</div>}
                                                                    </td>
                                                                    <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                                                                        {fmtDate(req.created_at)}
                                                                    </td>
                                                                    <td>
                                                                        <span style={{ color: statusColor, fontWeight: 700, textTransform: 'capitalize' }}>
                                                                            {req.status}
                                                                        </span>
                                                                        {approverName && actionDateFmt && (
                                                                            <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.8rem' }}>
                                                                                {' '}({approverName} {actionDateFmt})
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="used-cell" style={{ color: '#dc2626', fontWeight: 700 }}>
                                                                        {req.hours_requested != null ? `-${Number(req.hours_requested).toFixed(2)}` : ''}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    }
                                                </tbody>
                                            </table>
                                        )
                                    ) : displayRows.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                                            <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}></i>
                                            {t('No History')}
                                        </div>
                                    ) : (
                                        <>
                                            <table className="history-table">
                                                <thead>
                                                    <tr>
                                                        <th>{t('employeeDetail.timeOff.date')} <i className="fa-solid fa-arrow-up"></i></th>
                                                        <th>{t('employeeDetail.timeOff.description')}</th>
                                                        <th>{t('employeeDetail.timeOff.usedHours')}</th>
                                                        <th>{t('employeeDetail.timeOff.earnedHours')}</th>
                                                        <th>{t('employeeDetail.timeOff.balance')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedRows.map((item) => (
                                                        <tr key={item.id}>
                                                            <td>{item.entry_date.includes('-') ? (() => { const [y, m, d] = item.entry_date.split('-'); return `${m}/${d}/${y}`; })() : item.entry_date}</td>
                                                            <td>{item.description}</td>
                                                            <td className="used-cell">{item.used_hours != null ? item.used_hours.toFixed(2) : ''}</td>
                                                            <td className="earned-cell">{item.earned_hours != null ? item.earned_hours.toFixed(2) : ''}</td>
                                                            <td className="balance-cell">
                                                                {item.balance != null ? Number(item.balance).toFixed(2) : '0.00'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            {/* Pagination Controls */}
                                            {totalPages > 1 && (
                                                <div className="pagination-container" style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    gap: '1.5rem',
                                                    marginTop: '2rem',
                                                    padding: '1rem',
                                                    background: '#f8fafc',
                                                    borderRadius: '16px',
                                                    border: '1px solid #e2e8f0'
                                                }}>
                                                    <button
                                                        onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                                                        disabled={historyPage === 1}
                                                        className="pagination-btn"
                                                        style={{
                                                            padding: '0.6rem 1.2rem',
                                                            borderRadius: '10px',
                                                            border: '1px solid #e2e8f0',
                                                            background: historyPage === 1 ? '#f1f5f9' : 'white',
                                                            color: historyPage === 1 ? '#94a3b8' : '#1e1b4b',
                                                            fontWeight: 700,
                                                            fontSize: '0.85rem',
                                                            cursor: historyPage === 1 ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <i className="fa-solid fa-chevron-left"></i> {t('common.previous', 'Previous')}
                                                    </button>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e1b4b' }}>{historyPage}</span>
                                                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>/ {totalPages}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                                                        disabled={historyPage === totalPages}
                                                        className="pagination-btn"
                                                        style={{
                                                            padding: '0.6rem 1.2rem',
                                                            borderRadius: '10px',
                                                            border: '1px solid #e2e8f0',
                                                            background: historyPage === totalPages ? '#f1f5f9' : 'white',
                                                            color: historyPage === totalPages ? '#94a3b8' : '#1e1b4b',
                                                            fontWeight: 700,
                                                            fontSize: '0.85rem',
                                                            cursor: historyPage === totalPages ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {t('common.next', 'Next')} <i className="fa-solid fa-chevron-right"></i>
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'Personal' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-user-gear"></i>
                                <h2>{t('employeeDetail.tabs.personal')}</h2>
                            </div>

                            {isOrgChartModalOpen && (
                                <div className="modal-overlay" onClick={() => setIsOrgChartModalOpen(false)}>
                                    <div className="modal-content org-chart-modal" onClick={e => e.stopPropagation()}>
                                        <div className="modal-header">
                                            <h2>{t('employeeDetail.viewInOrgChart')}</h2>
                                            <button className="close-modal" onClick={() => setIsOrgChartModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                                        </div>
                                        <div className="modal-body" style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc' }}>
                                            <img
                                                src="/images/org_chart.png"
                                                alt="Organizational Chart"
                                                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                        </div>
                                        <div className="modal-footer">
                                            <button className="modal-save-btn" onClick={() => setIsOrgChartModalOpen(false)}>{t('common.close', 'Close')}</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Basic Information */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-id-card"></i>
                                    <h3>{t('employeeDetail.personal.basicInfo')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.employeeNum')}</label>
                                        <input type="text" className={`info-input ${validationErrors.worker_id ? 'error' : ''}`} value={employee.worker_id || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, worker_id: e.target.value } : null)} />
                                        {validationErrors.worker_id && <span className="error-text" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{validationErrors.worker_id}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.status')}</label>
                                        <select className="info-input" value={employee.active === false ? "false" : "true"} onChange={(e) => setEmployee(prev => prev ? { ...prev, active: e.target.value === "true" } : null)}>
                                            <option value="true">{t('common.active')}</option>
                                            <option value="false">{t('common.archived')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.firstName')}</label>
                                        <input type="text" className={`info-input ${validationErrors.first_name ? 'error' : ''}`} value={employee.first_name || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, first_name: e.target.value } : null)} />
                                        {validationErrors.first_name && <span className="error-text" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{validationErrors.first_name}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.middleName')}</label>
                                        <input type="text" className="info-input" value={employee.middle_name || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, middle_name: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.lastName')}</label>
                                        <input type="text" className="info-input" value={employee.last_name || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, last_name: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.preferredName')}</label>
                                        <input type="text" className="info-input" value={employee.preferred_name || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, preferred_name: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.birthDate')}</label>
                                        <input type="date" className="info-input" value={employee.birth_date || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, birth_date: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.gender')}</label>
                                        <select className="info-input" value={employee.gender || ""} onChange={(e) => setEmployee(prev => prev ? { ...prev, gender: e.target.value } : null)}>
                                            <option value="">{t('common.select')}</option>
                                            <option value="Male">{t('common.male')}</option>
                                            <option value="Female">{t('common.female')}</option>
                                            <option value="Not specified">{t('hire.options.gender.notSpecified')}</option>
                                            <option value="Other">{t('common.other')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.maritalStatus')}</label>
                                        <select className="info-input" value={employee.marital_status || ""} onChange={(e) => setEmployee(prev => prev ? { ...prev, marital_status: e.target.value } : null)}>
                                            <option value="">{t('common.select')}</option>
                                            <option value="Single">{t('common.single')}</option>
                                            <option value="Married">{t('common.married')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.shirtSize')}</label>
                                        <select className="info-input" value={employee.shirt_size || ""} onChange={(e) => setEmployee(prev => prev ? { ...prev, shirt_size: e.target.value } : null)}>
                                            <option value="">-Select-</option>
                                            <option value="S">S</option>
                                            <option value="M">M</option>
                                            <option value="L">L</option>
                                            <option value="XL">XL</option>
                                            <option value="2XL">2XL</option>
                                            <option value="3XL">3XL</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-house"></i>
                                    <h3>{t('employeeDetail.personal.address')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.street1')}</label>
                                        <input type="text" className="info-input" value={employee.address_street1 || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_street1: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.street2')}</label>
                                        <input type="text" className="info-input" value={employee.address_street2 || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_street2: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.city')}</label>
                                        <input type="text" className="info-input" value={employee.address_city || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_city: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.state')}</label>
                                        <input type="text" className="info-input" value={employee.address_state || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_state: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.zip')}</label>
                                        <input type="text" className="info-input" value={employee.address_zip || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_zip: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.country')}</label>
                                        <input type="text" className="info-input" value={employee.address_country || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, address_country: e.target.value } : null)} />
                                    </div>
                                </div>
                            </div>

                            {/* Contact */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-address-book"></i>
                                    <h3>{t('contact')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('Phone')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-phone" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.work_phone ? 'error' : ''}`} style={{ flex: 1 }} value={employee.work_phone || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, work_phone: e.target.value } : null)} /></div>
                                        {validationErrors.work_phone && <span className="error-text" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{validationErrors.work_phone}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>Ext</label>
                                        <input type="text" className="info-input" value={employee.work_phone_ext || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, work_phone_ext: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>Mobile Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-mobile-screen" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.mobile_phone ? 'error' : ''}`} style={{ flex: 1 }} value={employee.mobile_phone || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, mobile_phone: e.target.value } : null)} /></div>
                                        {validationErrors.mobile_phone && <span className="error-text" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{validationErrors.mobile_phone}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>Home Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-phone" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.home_phone ? 'error' : ''}`} style={{ flex: 1 }} value={employee.home_phone || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, home_phone: e.target.value } : null)} /></div>
                                        {validationErrors.home_phone && <span className="error-text" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{validationErrors.home_phone}</span>}
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('Email')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-envelope" style={{ color: "var(--text-muted)" }}></i><input type="email" className="info-input" style={{ flex: 1 }} value={employee.work_email || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, work_email: e.target.value } : null)} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('Home Email')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-envelope" style={{ color: "var(--text-muted)" }}></i><input type="email" className="info-input" style={{ flex: 1 }} value={employee.home_email || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, home_email: e.target.value } : null)} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-share-nodes"></i>
                                    <h3>{t('common.socialLinks', 'Social Links')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>{t('common.linkedin', 'LinkedIn')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-linkedin" style={{ color: "#94a3b8" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={employee.linkedin_url || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, linkedin_url: e.target.value } : null)} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('common.twitter', 'Twitter Username')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-twitter" style={{ color: "#94a3b8" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={employee.twitter_url || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, twitter_url: e.target.value } : null)} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('common.facebook', 'Facebook')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-facebook" style={{ color: "#94a3b8" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={employee.facebook_url || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, facebook_url: e.target.value } : null)} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Education */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-graduation-cap"></i>
                                    <h3>{t('education.title')}</h3>
                                </div>
                                <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                                    <button className="text-link" style={{ color: 'var(--primary, #1e1b4b)', fontWeight: 700 }}><i className="fa-solid fa-plus-circle"></i> {t('education.add')}</button>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'Job' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-briefcase"></i>
                                <h2>{t('employeeDetail.job.title')}</h2>
                            </div>

                            <div className="info-card">
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('employeeDetail.hireDate')}</label>
                                        <input type="date" className="info-input" value={employee.hire_date || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, hire_date: e.target.value } : null)} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.job.payGroup')}</label>
                                        <select className="info-input" value={employee.pay_schedule || ''} onChange={(e) => {
                                            const val = e.target.value;
                                            let updates: any = { pay_schedule: val };
                                            if (val === 'Monthly') {
                                                updates.pay_type = 'Salary';
                                                updates.pay_period = 'Year';
                                            } else if (val === 'Semi-monthly') {
                                                updates.pay_type = 'Hourly';
                                                updates.pay_period = 'Hour';
                                            }
                                            setEmployee(prev => prev ? { ...prev, ...updates } : null);
                                        }}>
                                            <option value="">{t('common.select')}</option>
                                            <option value="Monthly">{t('hire.options.paySchedule.monthly')}</option>
                                            <option value="Semi-monthly">{t('hire.options.paySchedule.semiMonthly')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('hire.fields.staffType')}</label>
                                        <select className="info-input" value={employee.staff_type || 'Permanent Staff'} onChange={(e) => setEmployee(prev => prev ? { ...prev, staff_type: e.target.value } : null)}>
                                            <option value="Permanent Staff">{t('hire.options.staffType.permanent')}</option>
                                            <option value="Temporary Staff">{t('hire.options.staffType.temporary')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>{t('employeeDetail.job.directReports')}</label>
                                        <input type="text" className="info-input" value={employee.reporting_to || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, reporting_to: e.target.value } : null)} placeholder="Enter manager name" />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.job.annualPay')}</label>
                                        <div className="info-icon-value">
                                            <span>$</span>
                                            <input
                                                type="number"
                                                className="info-input"
                                                style={{ border: 'none', background: 'transparent', width: '80px', padding: '0', fontSize: 'inherit' }}
                                                value={employee.hourly_rate || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, hourly_rate: parseFloat(e.target.value) } : null)}
                                            />
                                            <span>USD</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Employment Status */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-user-clock"></i>
                                        <h3>{t('employeeDetail.job.employmentStatus')}</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>{t('employeeDetail.job.effectiveDate')}</th>
                                            <th>{t('employeeDetail.job.employmentStatus')}</th>
                                            <th>{t('employeeDetail.job.comment')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><input type="date" className="table-input" value={employee.hire_date || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, hire_date: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.employment_status || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, employment_status: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" placeholder="Add comment..." /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Compensation */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-money-check-dollar"></i>
                                        <h3>{t('employeeDetail.job.compensation')}</h3>
                                    </div>
                                    <button className="small-action-btn">{t('common.addPolicy')}</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>{t('employeeDetail.job.effectiveDate')}</th>
                                            <th>{t('employeeDetail.job.paySchedule')}</th>
                                            <th>{t('employeeDetail.job.payType')}</th>
                                            <th>{t('employeeDetail.job.payRate')}</th>
                                            <th>{t('employeeDetail.job.overtime')}</th>
                                            <th>{t('employeeDetail.job.changeReason')}</th>
                                            <th>{t('employeeDetail.job.comment')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><input type="date" className="table-input" value={employee.hire_date || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, hire_date: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.pay_schedule || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, pay_schedule: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.pay_type || 'Hourly'} onChange={(e) => setEmployee(prev => prev ? { ...prev, pay_type: e.target.value } : null)} /></td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>$</span>
                                                    <input type="number" className="table-input" style={{ width: '60px' }} value={employee.hourly_rate || 0} onChange={(e) => setEmployee(prev => prev ? { ...prev, hourly_rate: parseFloat(e.target.value) } : null)} />
                                                    <span>USD</span>
                                                </div>
                                            </td>
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
                                        <h3>{t('employeeDetail.job.jobInfo')}</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>{t('employeeDetail.job.effectiveDate')}</th>
                                            <th>{t('employeeDetail.job.location')}</th>
                                            <th>{t('employeeDetail.job.division')}</th>
                                            <th>{t('employeeDetail.job.department')}</th>
                                            <th>{t('employeeDetail.job.teams')}</th>
                                            <th>{t('employeeDetail.job.jobTitle')}</th>
                                            <th>{t('employeeDetail.job.reportsTo')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><input type="date" className="table-input" value={employee.hire_date || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, hire_date: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.location || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, location: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.division || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, division: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.department || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, department: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" placeholder="-" /></td>
                                            <td><input type="text" className="table-input" value={employee.job_title || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, job_title: e.target.value } : null)} /></td>
                                            <td><input type="text" className="table-input" value={employee.reporting_to || ''} onChange={(e) => setEmployee(prev => prev ? { ...prev, reporting_to: e.target.value } : null)} /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* EEO */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-scale-balanced"></i>
                                    <h3>{t('eeo.title')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field half-width">
                                        <label>{t('eeo.ethnicity')}</label>
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
                                        <label>{t('eeo.category')}</label>
                                        <div className="custom-eeo-dropdown">
                                            <div
                                                className={`eeo-select-trigger ${openDropdown === 'eeo_category' ? 'active' : ''}`}
                                                onClick={() => {
                                                    setOpenDropdown(openDropdown === 'eeo_category' ? null : 'eeo_category');
                                                    setEeoSearch('');
                                                }}
                                            >
                                                <span>{employee.eeo_category || '-Select-'}</span>
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
                                                                className={`eeo-option ${employee.eeo_category === opt ? 'selected' : ''}`}
                                                                onClick={async () => {
                                                                    setEmployee(prev => prev ? { ...prev, eeo_category: opt } : null);
                                                                    setOpenDropdown(null);
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
                                        <label>{t('eeo.veteranStatus')}</label>
                                        <div className="veteran-status-list">
                                            <label className="custom-checkbox-container">
                                                <input
                                                    type="checkbox"
                                                    checked={!!employee.is_active_duty_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_active_duty_veteran: val } : null);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                {t('eeo.activeDuty')}
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input
                                                    type="checkbox"
                                                    checked={!!employee.is_armed_forces_medal_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_armed_forces_medal_veteran: val } : null);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                {t('eeo.armedForces')}
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input
                                                    type="checkbox"
                                                    checked={!!employee.is_disabled_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_disabled_veteran: val } : null);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                {t('eeo.disabled')}
                                            </label>
                                            <label className="custom-checkbox-container">
                                                <input
                                                    type="checkbox"
                                                    checked={!!employee.is_recently_separated_veteran}
                                                    onChange={async (e) => {
                                                        const val = e.target.checked;
                                                        setEmployee(prev => prev ? { ...prev, is_recently_separated_veteran: val } : null);
                                                    }}
                                                />
                                                <span className="checkmark"></span>
                                                {t('eeo.recentlySeparated')}
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Potential Bonus */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-gift"></i>
                                    <h3>{t('bonus.potential')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('bonus.percentage')}</label>
                                        <div className="bonus-input-wrapper bonus-percentage">
                                            <input
                                                type="number"
                                                value={employee.annual_bonus_percentage ?? ''}
                                                onChange={async (e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEmployee(prev => prev ? { ...prev, annual_bonus_percentage: val } : null);
                                                }}
                                                placeholder="0"
                                            />
                                            <span>%</span>
                                        </div>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('bonus.amount')}</label>
                                        <div className="bonus-input-wrapper amount">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={employee.annual_bonus_amount ?? ''}
                                                onChange={async (e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEmployee(prev => prev ? { ...prev, annual_bonus_amount: val } : null);
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
                                        <h3>{t('bonus.title')}</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsBonusModalOpen(true)}>{t('bonus.add')}</button>
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
                                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>{t('bonus.noEntries')}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Commission */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-chart-line-up"></i>
                                        <h3>{t('commission.title')}</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsCommissionModalOpen(true)}>{t('bonus.add')}</button>
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
                                            <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>{t('commission.noEntries')}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Equity */}
                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-gem"></i>
                                        <h3>{t('equity.title')}</h3>
                                    </div>
                                    <button className="add-entry-btn" onClick={() => setIsEquityModalOpen(true)}>{t('bonus.add')}</button>
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
                                            <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>{t('equity.noEntries')}</td>
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
                                <h2>{t('emergency.title')}</h2>
                            </div>

                            <div className="info-card">
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fa-solid fa-address-card"></i>
                                        <h3>{t('emergency.contactInfo')}</h3>
                                    </div>
                                    <button className="small-action-btn">Add Policy</button>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                                            <input
                                                type="checkbox"
                                                checked={employee.is_primary_contact !== false}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, is_primary_contact: e.target.checked } : null)}
                                                style={{ transform: 'scale(1.2)' }}
                                            />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{t('emergency.primary')}</span>
                                        </div>
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Contact Name</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_name || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_name: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Relationship</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_relationship || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_relationship: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                            <i className="fa-solid fa-phone" style={{ color: "#94a3b8" }}></i>
                                            <input
                                                type="text"
                                                className="info-input"
                                                style={{ flex: 1 }}
                                                value={employee.emergency_contact_phone || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_phone: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                    <div className="info-field">
                                        <label>Ext</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_phone_ext || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_phone_ext: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>Home Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                            <i className="fa-solid fa-phone" style={{ color: "#94a3b8" }}></i>
                                            <input
                                                type="text"
                                                className="info-input"
                                                style={{ flex: 1 }}
                                                value={employee.emergency_contact_home_phone || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_home_phone: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                    <div className="info-field">
                                        <label>Mobile Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                            <i className="fa-solid fa-mobile-screen" style={{ color: "#94a3b8" }}></i>
                                            <input
                                                type="text"
                                                className="info-input"
                                                style={{ flex: 1 }}
                                                value={employee.emergency_contact_mobile_phone || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_mobile_phone: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('common.email', 'Email')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                            <i className="fa-solid fa-envelope" style={{ color: "#94a3b8" }}></i>
                                            <input
                                                type="email"
                                                className="info-input"
                                                style={{ flex: 1 }}
                                                value={employee.emergency_contact_email || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_email: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Emergency Contact Address */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-house-medical"></i>
                                    <h3>{t('emergency.addressTitle')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.street1')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_street1 || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_street1: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.street2')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_street2 || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_street2: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.city')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_city || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_city: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.state')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_state || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_state: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.zip')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_zip || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_zip: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.country')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_address_country || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, emergency_contact_address_country: e.target.value } : null)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Contact */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-user-friends"></i>
                                    <h3>{t('emergency.secondaryTitle')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field half-width">
                                        <label>Contact Name</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.secondary_contact_name || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, secondary_contact_name: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field half-width">
                                        <label>Relationship</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.secondary_contact_relationship || ''}
                                            onChange={(e) => setEmployee(prev => prev ? { ...prev, secondary_contact_relationship: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Phone</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                            <i className="fa-solid fa-phone" style={{ color: "#94a3b8" }}></i>
                                            <input
                                                type="text"
                                                className="info-input"
                                                style={{ flex: 1 }}
                                                value={employee.secondary_contact_phone || ''}
                                                onChange={(e) => setEmployee(prev => prev ? { ...prev, secondary_contact_phone: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Benefits' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-umbrella"></i>
                                <h2>{t('benefits.title')}</h2>
                            </div>

                            <div className="info-card">
                                <div className="card-header" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                    <select className="table-input" style={{ width: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '4px' }}>
                                        <option>{t('benefits.allEventTypes')}</option>
                                    </select>
                                    <select className="table-input" style={{ width: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '4px' }}>
                                        <option>{t('benefits.allPlanTypes')}</option>
                                    </select>
                                    <select className="table-input" style={{ width: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '4px' }}>
                                        <option>{t('benefits.changedByAnyone')}</option>
                                    </select>
                                    <button className="small-action-btn" style={{ marginLeft: '0' }}>{t('benefits.apply')}</button>
                                </div>
                                <table className="info-table">
                                    <thead>
                                        <tr>
                                            <th>{t('benefits.table.dateTime')}</th>
                                            <th>{t('benefits.table.event')}</th>
                                            <th>{t('benefits.table.plan')}</th>
                                            <th>{t('benefits.table.changedBy')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>03/20/2026 10:45 AM</td>
                                            <td>{t('benefits.eligible')}</td>
                                            <td>{t('benefits.dental')}</td>
                                            <td>System</td>
                                        </tr>
                                        <tr>
                                            <td>03/20/2026 10:45 AM</td>
                                            <td>{t('benefits.eligible')}</td>
                                            <td>{t('benefits.health')}</td>
                                            <td>System</td>
                                        </tr>
                                        <tr>
                                            <td>03/20/2026 10:45 AM</td>
                                            <td>{t('benefits.eligible')}</td>
                                            <td>{t('benefits.vision')}</td>
                                            <td>System</td>
                                        </tr>
                                        <tr>
                                            <td>03/20/2026 10:45 AM</td>
                                            <td>{t('benefits.eligible')}</td>
                                            <td>{t('benefits.401k')}</td>
                                            <td>System</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                                    <button className="text-link" style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>{t('benefits.viewHistory')}</button>
                                </div>
                            </div>
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

                    {activeTab === 'Emergency' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-truck-medical"></i>
                                <h2>Emergency Contacts</h2>
                            </div>

                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-address-book"></i>
                                    <h3>Primary Contact</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('contact Name')}</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_name || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEmployee(prev => prev ? { ...prev, emergency_contact_name: val } : null);
                                            }}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>Relationship</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_relationship || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEmployee(prev => prev ? { ...prev, emergency_contact_relationship: val } : null);
                                            }}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>Contact Phone</label>
                                        <input
                                            type="text"
                                            className="info-input"
                                            value={employee.emergency_contact_phone || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEmployee(prev => prev ? { ...prev, emergency_contact_phone: val } : null);
                                            }}
                                        />
                                    </div>
                                    <div className="info-field">
                                        <label>Contact Email</label>
                                        <input
                                            type="email"
                                            className="info-input"
                                            value={employee.emergency_contact_email || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEmployee(prev => prev ? { ...prev, emergency_contact_email: val } : null);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>

            {isDirty && (
                <div className="sticky-footer" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', padding: '1rem 2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', zIndex: 100 }}>
                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Unsaved changes</span>
                    <button
                        onClick={() => { setEmployee(initialEmployee); setValidationErrors({}); }}
                        style={{ padding: '0.5rem 1rem', background: '#f1f5f9', color: '#334155', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{ padding: '0.5rem 1.5rem', background: 'var(--primary, #2563eb)', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {isSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-save"></i>}
                        Save Changes
                    </button>
                </div>
            )}

            {toast && (
                <div style={{ position: 'fixed', bottom: '80px', right: '2rem', padding: '1rem 1.5rem', background: toast.type === 'error' ? '#fee2e2' : '#dcfce3', color: toast.type === 'error' ? '#991b1b' : '#166534', border: `1px solid ${toast.type === 'error' ? '#f87171' : '#4ade80'}`, borderRadius: '8px', zIndex: 101, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <i className={toast.type === 'error' ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check"}></i>
                    {toast.message}
                </div>
            )}

            <style>{`
                .profile-container {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                    color: #1e293b;
                }
                .profile-header {
                    background: var(--primary, #1e1b4b);
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.1);
                    margin-bottom: 2rem;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header-top {
                    padding: 1rem 2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .back-btn {
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.6);
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
                .profile-title-info h1 { margin: 0; font-size: 2.25rem; font-weight: 900; color: white; letter-spacing: -0.02em; }
                .profile-title-info p { margin: 0.25rem 0 0; color: var(--accent, #f59e0b); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem; }
                .header-actions { margin-left: auto; }
                .more-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); width: 40px; height: 40px; border-radius: 10px; color: white; cursor: pointer; }
                
                .profile-nav {
                    display: flex;
                    padding: 0 2rem;
                    gap: 2.5rem;
                    border-top: 1px solid rgba(255,255,255,0.05);
                    background: rgba(0,0,0,0.1);
                }
                .nav-tab {
                    padding: 1.25rem 0;
                    background: none;
                    border: none;
                    font-weight: 700;
                    color: rgba(255,255,255,0.6);
                    cursor: pointer;
                    position: relative;
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }
                .nav-tab.active { color: white; }
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
                .card-value { 
                    font-size: 2.25rem; 
                    font-weight: 900; 
                    color: #0f172a; 
                    letter-spacing: -0.02em; 
                    margin-bottom: 0.25rem;
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                    white-space: nowrap;
                }
                .card-value-input {
                    background: transparent;
                    border: none;
                    font-size: inherit;
                    font-weight: inherit;
                    color: inherit;
                    width: auto;
                    min-width: 40px;
                    max-width: 100px;
                    padding: 0;
                    margin: 0;
                    outline: none;
                    text-align: left;
                }
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
                .table-input {
                    width: 100%;
                    border: none;
                    background: transparent;
                    font-size: inherit;
                    font-family: inherit;
                    color: inherit;
                    padding: 4px 0;
                    outline: none;
                    transition: all 0.2s;
                    border-bottom: 1px solid transparent;
                }
                .table-input:focus {
                    border-bottom-color: var(--accent, #f59e0b);
                    background: rgba(245, 158, 11, 0.03);
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
                .progress-circle-mid {
                    width: 100px;
                    height: 100px;
                    margin: 0 auto;
                }
                .progress-circle-mid svg {
                    transform: rotate(-90deg);
                }
                .circle-bg {
                    fill: none;
                    stroke: #f1f5f9;
                    stroke-width: 3.5;
                }
                .circle {
                    fill: none;
                    stroke-width: 3.5;
                    stroke-linecap: round;
                    transition: stroke-dasharray 0.5s ease;
                }
                .progress-percentage-mid {
                    fill: #1e1b4b;
                    font-size: 9px;
                    font-weight: 900;
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

                /* --- Responsive Media Queries --- */
                @media (max-width: 1024px) {
                    .profile-content {
                        grid-template-columns: 1fr;
                    }
                    .profile-sidebar {
                        order: 2;
                    }
                    .main-details {
                        order: 1;
                    }
                    .card-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .profile-container {
                        padding: 1rem;
                    }
                    .header-main {
                        flex-direction: column;
                        text-align: center;
                        padding: 1.5rem;
                        gap: 1rem;
                    }
                    .profile-photo-container {
                        width: 80px;
                        height: 80px;
                    }
                    .profile-title-info h1 {
                        font-size: 1.5rem;
                    }
                    .header-actions {
                        margin-left: 0;
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }
                    .profile-nav {
                        padding: 0 1rem;
                        gap: 1.5rem;
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                    }
                    .nav-tab {
                        white-space: nowrap;
                    }
                    .time-off-grid {
                        grid-template-columns: 1fr;
                    }
                    .card-grid {
                        grid-template-columns: 1fr;
                    }
                    .info-field.half-width {
                        grid-column: span 4;
                    }
                    .section-title-row h2 {
                        font-size: 1.25rem;
                    }
                    .training-summary-card {
                        flex-direction: column;
                        text-align: center;
                        padding: 1.5rem;
                    }
                    .history-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }
                    .history-filters {
                        width: 100%;
                        overflow-x: auto;
                    }
                }

                @media (max-width: 480px) {
                    .profile-header {
                        border-radius: 12px;
                    }
                    .card-value {
                        font-size: 1.75rem;
                    }
                    .modal-content.add-entry-modal {
                        width: 100%;
                        height: 100%;
                        max-height: 100vh;
                        border-radius: 0;
                    }
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

                .org-chart-modal {
                    max-width: 90vw !important;
                    width: fit-content !important;
                }

                .pill-control-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    background: white;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
                    transition: all 0.2s ease;
                }
                .pill-control-btn:hover {
                    background: #f8fafc;
                    color: #1e1b4b;
                    border-color: #cbd5e1;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                }
                .modal-content-new {
                    background: white;
                    border-radius: 20px;
                    width: 100%;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .modal-header-new {
                    padding: 20px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-title-new {
                    font-size: 1.15rem;
                    font-weight: 800;
                    color: #1e1b4b;
                    margin: 0;
                }
                .close-btn-new {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    cursor: pointer;
                    font-size: 1.25rem;
                }
                .full-input-new {
                    width: 100%;
                    padding: 10px 14px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    outline: none;
                    background: #fff;
                }
                .full-input-new:focus {
                    border-color: #1e1b4b;
                }
                .modal-footer-new {
                    padding: 16px 24px;
                    background: #f8fafc;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    border-top: 1px solid #f1f5f9;
                }
                .modal-cancel-btn-new {
                    padding: 8px 18px;
                    border: 1.5px solid #e2e8f0;
                    background: white;
                    border-radius: 8px;
                    font-weight: 700;
                    cursor: pointer;
                    color: #1e293b;
                }
                .modal-save-btn-new {
                    padding: 8px 18px;
                    background: #1e1b4b;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 700;
                    cursor: pointer;
                }
            `}</style>

            {/* MODALS */}
            {isRecordModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content-new" style={{ maxWidth: '450px' }}>
                        <div className="modal-header-new">
                            <h2 className="modal-title-new">Record Time Off</h2>
                            <button className="close-btn-new" onClick={() => setIsRecordModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <div className="modal-form-field">
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>{t('Type')}</label>
                                <select className="full-input-new" value={recordForm.type} onChange={e => setRecordForm({ ...recordForm, type: e.target.value as any })}>
                                    <option value="pto">PTO</option>
                                    <option value="sick">Sick Leave</option>
                                </select>
                            </div>
                            <div className="modal-form-field" style={{ marginTop: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>{t('Date')}</label>
                                <input type="date" className="full-input-new" value={recordForm.startDate} onChange={e => setRecordForm({ ...recordForm, startDate: e.target.value })} />
                            </div>
                            <div className="modal-form-field" style={{ marginTop: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>{t('Hours')}</label>
                                <input type="number" className="full-input-new" value={recordForm.hours} onChange={e => setRecordForm({ ...recordForm, hours: parseFloat(e.target.value) })} />
                            </div>
                        </div>
                        <div className="modal-footer-new">
                            <button className="modal-cancel-btn-new" onClick={() => setIsRecordModalOpen(false)}>{t('common.cancel')}</button>
                            <button className="modal-save-btn-new" onClick={handleRecordTimeOff} disabled={isSaving}>{isSaving ? t('common.saving') : t('common.save')}</button>
                        </div>
                    </div>
                </div>
            )}

            {isAdjustModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content-new" style={{ maxWidth: '460px' }}>
                        <div className="modal-header-new">
                            <h2 className="modal-title-new">Adjust {adjustmentType.toUpperCase()} Balance</h2>
                            <button className="close-btn-new" onClick={() => setIsAdjustModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            {/* Add / Deduct toggle */}
                            <div className="modal-form-field">
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '8px', display: 'block' }}>Adjustment Type</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => setAdjustmentForm({ ...adjustmentForm, direction: 'add' })}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', border: '2px solid',
                                            background: adjustmentForm.direction === 'add' ? '#dcfce7' : '#fff',
                                            borderColor: adjustmentForm.direction === 'add' ? '#16a34a' : '#e2e8f0',
                                            color: adjustmentForm.direction === 'add' ? '#15803d' : '#64748b'
                                        }}
                                    >
                                        <i className="fa-solid fa-plus" style={{ marginRight: '6px' }}></i> Add Hours
                                    </button>
                                    <button
                                        onClick={() => setAdjustmentForm({ ...adjustmentForm, direction: 'deduct' })}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', border: '2px solid',
                                            background: adjustmentForm.direction === 'deduct' ? '#fee2e2' : '#fff',
                                            borderColor: adjustmentForm.direction === 'deduct' ? '#dc2626' : '#e2e8f0',
                                            color: adjustmentForm.direction === 'deduct' ? '#b91c1c' : '#64748b'
                                        }}
                                    >
                                        <i className="fa-solid fa-minus" style={{ marginRight: '6px' }}></i> Deduct Hours
                                    </button>
                                </div>
                            </div>
                            <div className="modal-form-field" style={{ marginTop: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>Hours</label>
                                <input
                                    type="number" min="0" step="0.5"
                                    className="full-input-new"
                                    value={adjustmentForm.amount || ''}
                                    onChange={e => setAdjustmentForm({ ...adjustmentForm, amount: Math.abs(parseFloat(e.target.value) || 0) })}
                                    placeholder="e.g. 8"
                                />
                                <p style={{ fontSize: '0.75rem', marginTop: '6px', color: adjustmentForm.direction === 'add' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                    {adjustmentForm.direction === 'add'
                                        ? `Will increase ${adjustmentType.toUpperCase()} balance by ${adjustmentForm.amount} hrs`
                                        : `Will decrease ${adjustmentType.toUpperCase()} balance by ${adjustmentForm.amount} hrs`
                                    }
                                </p>
                            </div>
                            <div className="modal-form-field" style={{ marginTop: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>Effective Date</label>
                                <input type="date" className="full-input-new" value={adjustmentForm.effectiveDate} onChange={e => setAdjustmentForm({ ...adjustmentForm, effectiveDate: e.target.value })} />
                            </div>
                            <div className="modal-form-field" style={{ marginTop: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>Reason</label>
                                <textarea className="full-input-new" style={{ height: '80px', paddingTop: '10px' }} value={adjustmentForm.description} onChange={e => setAdjustmentForm({ ...adjustmentForm, description: e.target.value })} placeholder="Why is this change being made?" />
                            </div>
                            <div style={{ marginTop: '1rem', padding: '10px', background: '#fff9e6', border: '1px solid #ffe58f', borderRadius: '8px', fontSize: '0.75rem', color: '#856404' }}>
                                <i className="fa-solid fa-circle-info"></i> Note: Adjusting balances directly bypasses standard caps. Ensure this change is documented.
                            </div>
                        </div>
                        <div className="modal-footer-new">
                            <button className="modal-cancel-btn-new" onClick={() => setIsAdjustModalOpen(false)}>{t('common.cancel')}</button>
                            <button
                                className="modal-save-btn-new"
                                onClick={handleAdjustBalance}
                                disabled={isSaving || adjustmentForm.amount <= 0}
                                style={{ background: adjustmentForm.direction === 'deduct' ? '#dc2626' : '#1e1b4b' }}
                            >
                                {isSaving ? t('common.saving') : (adjustmentForm.direction === 'add' ? 'Add Hours' : 'Deduct Hours')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isCalculateModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content-new" style={{ maxWidth: '450px' }}>
                        <div className="modal-header-new">
                            <h2 className="modal-title-new">Calculate Future Balance</h2>
                            <button className="close-btn-new" onClick={() => setIsCalculateModalOpen(false)}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <div className="modal-form-field">
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px', display: 'block' }}>Calculate As Of Date</label>
                                <input type="date" className="full-input-new" value={calculateAsOfDate} onChange={e => setCalculateAsOfDate(e.target.value)} />
                            </div>

                            {calculatedFutureBalance && (
                                <div style={{ marginTop: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#166534' }}>Projected Balances:</h4>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>PTO</span>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>{calculatedFutureBalance.pto.toFixed(2)} hrs</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Sick Leave</span>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>{calculatedFutureBalance.sick.toFixed(2)} hrs</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer-new">
                            <button className="modal-cancel-btn-new" onClick={() => { setIsCalculateModalOpen(false); setCalculatedFutureBalance(null); }}>{t('common.close')}</button>
                            <button className="modal-save-btn-new" onClick={handleProjectFuture}>Calculate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
