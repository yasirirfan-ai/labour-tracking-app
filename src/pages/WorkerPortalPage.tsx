import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { completeAllTasks, pauseAllActiveTasks } from '../lib/taskService';
import { Navigate } from 'react-router-dom';
import { trainingService } from '../lib/trainingService';
import type { TrainingMaterial } from '../lib/trainingService';
import type { User } from '../types';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import emailjs from '@emailjs/browser';
import { syncLeaveBalances } from '../lib/accrualService';

export const WorkerPortalPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { toggleTheme, setLanguage, currentTheme } = useTheme();
    const { user, loading: authLoading, logout } = useAuth();
    const [localUser, setLocalUser] = useState(user);
    const isSyncing = useRef(false);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeTasks, setActiveTasks] = useState<any[]>([]);
    const [disciplinaryIncidents, setDisciplinaryIncidents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'personal_info' | 'conduct' | 'settings' | 'training' | 'timeoff'>('dashboard');
    const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
    const [requestHistoryPage, setRequestHistoryPage] = useState(1);
    const [ledgerPage, setLedgerPage] = useState(1);
    const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'pto' | 'sick'>('all');
    const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
    const [leaveFormData, setLeaveFormData] = useState({
        type: 'pto' as 'pto' | 'sick',
        start_date: '',
        end_date: '',
        hours_requested: 8,
        reason: ''
    });
    const [signingData, setSigningData] = useState<{ [key: string]: { explanation: string, signature: string } }>({});
    const [nfcStatus, setNfcStatus] = useState<'idle' | 'listening' | 'reading' | 'error'>('idle');
    const [pendingPolicies, setPendingPolicies] = useState<any[]>([]);
    const [policySignature, setPolicySignature] = useState('');
    const [isSigningPolicy, setIsSigningPolicy] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
    const [trainingRole, setTrainingRole] = useState<'Production' | 'QC' | 'Compounder I' | 'Quality Assurance' | 'Shipping & Recieving' | 'Purchase'>(user?.role === 'manager' ? 'Quality Assurance' : 'Production');
    const [selectedSOPSection, setSelectedSOPSection] = useState<string>('');
    const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
    const [currentTrainingName, setCurrentTrainingName] = useState<string | null>(null);
    const [completedTrainings, setCompletedTrainings] = useState<string[]>([]);
    const [trainingLanguage, setTrainingLanguage] = useState<'en' | 'es'>('en');
    const [showBreakOverlay, setShowBreakOverlay] = useState(false);
    const [readingTimer, setReadingTimer] = useState(0);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const [unlockedHeight, setUnlockedHeight] = useState(4000);
    const [isEndOfPdf, setIsEndOfPdf] = useState(false);

    const MAX_WORK_SECONDS = 5 * 60 * 60; // 5 hours in seconds

    useEffect(() => {
        const fetchTrainings = async () => {
            const materials = await trainingService.getAllMaterials(trainingLanguage);
            setTrainingMaterials(materials);

            // Set initial selected section for SOPs if available
            const initialRole = user?.role === 'manager' ? 'Quality Assurance' : 'Production';
            const initialMaterials = materials.filter(m => m.level === 2 && m.department === initialRole);
            if (initialMaterials.length > 0) {
                setSelectedSOPSection(initialMaterials[0].category);
            }
        };
        fetchTrainings();
    }, [user?.id, trainingLanguage]);

    useEffect(() => {
        if (user?.id) {
            setLocalUser(user);
            // Initial load from user object (synced via AuthContext/Supabase)
            const initialCompleted = (user as any).completed_trainings || ['GMP and Quality Awareness'];
            setCompletedTrainings(initialCompleted);
            fetchMyLeaveRequests();
            
            // Sync leave balances on load
            const sync = async () => {
                if (isSyncing.current) return;
                isSyncing.current = true;
                
                try {
                    const res: any = await syncLeaveBalances(user as any);
                    if (res && !res.error) {
                        setLocalUser(prev => prev ? { ...prev, pto_balance: String(res.pto), sick_balance: String(res.sick) } : prev);
                    }
                    fetchLeaveHistory();
                } finally {
                    isSyncing.current = false;
                }
            };
            sync();
        }
    }, [user?.id]);

    const fetchLeaveHistory = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('leave_history')
            .select('*')
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) { console.error('Error fetching leave history:', error); return; }
        if (data) setLeaveHistory(data);
    };

    const fetchMyLeaveRequests = async () => {
        if (!user) return;
        const { data, error } = await (supabase as any)
            .from('leave_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(25);
        if (error) { console.error('Error fetching leave requests:', error); return; }
        if (data) setMyLeaveRequests(data);
    };

    useEffect(() => {
        let interval: any;
        if (selectedPdf && readingTimer > 0) {
            setIsTimerActive(true);
            interval = setInterval(() => {
                setReadingTimer(prev => {
                    if (prev <= 1) {
                        setIsTimerActive(false);
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (!selectedPdf) {
            setReadingTimer(0);
            setIsTimerActive(false);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [selectedPdf, readingTimer > 0]);

    useEffect(() => {
        if (selectedPdf) {
            setReadingTimer(30);
            setIsTimerActive(true);
            setUnlockedHeight(4000); // Reset height to first 4 pages
            setIsEndOfPdf(false);
        }
    }, [selectedPdf]);

    const handleUnlockNext = () => {
        if (readingTimer > 0) return;
        setUnlockedHeight(prev => prev + 4000);
        setReadingTimer(30);
        setIsTimerActive(true);
    };

    const handleLeaveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!leaveFormData.start_date || !leaveFormData.end_date || leaveFormData.hours_requested <= 0) {
            alert('Please fill in all required fields correctly.');
            return;
        }
        if (leaveFormData.end_date < leaveFormData.start_date) {
            alert('End date cannot be before start date.');
            return;
        }

        setIsSubmittingLeave(true);
        const { error } = await (supabase as any).from('leave_requests').insert([{
            user_id: user.id,
            ...leaveFormData,
            status: 'pending'
        }]);

        if (error) {
            alert('Error submitting request: ' + error.message);
        } else {
            // Send email notification to admin
            try {
                await emailjs.send(
                    import.meta.env.VITE_EMAILJS_SERVICE_ID,
                    import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
                    {
                        to_email: 'ahbhananbajwa123@gmail.com',
                        worker_name: (user as any)?.name || (user as any)?.email || 'A worker',
                        leave_type: leaveFormData.type === 'pto' ? 'PTO (Paid Time Off)' : 'Sick Leave',
                        start_date: leaveFormData.start_date,
                        end_date: leaveFormData.end_date,
                        hours_requested: leaveFormData.hours_requested,
                        reason: leaveFormData.reason || 'No reason provided',
                    },
                    import.meta.env.VITE_EMAILJS_PUBLIC_KEY
                );
            } catch (emailError) {
                console.error('Email notification failed:', emailError);
            }
            setNotification({ show: true, message: 'Your leave request has been submitted and is pending admin review.', severity: 'success' });
            setTimeout(() => setNotification(null), 6000);
            setLeaveFormData({ type: 'pto', start_date: '', end_date: '', hours_requested: 8, reason: '' });
            fetchLeaveHistory();
            fetchMyLeaveRequests();
        }
        setIsSubmittingLeave(false);
    };


    const handleSignIncident = async (incidentId: string) => {
        const data = signingData[incidentId];
        if (!data?.signature) {
            alert('Please provide your name as a signature.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await (supabase as any)
                .from('disciplinary_incidents')
                .update({
                    worker_explanation: data.explanation,
                    worker_signature: data.signature,
                    signed_at: new Date().toISOString(),
                    status: 'acknowledged'
                })
                .eq('id', incidentId);

            if (error) throw error;
            alert('Response recorded and incident signed.');
            fetchDisciplinaryIncidents();
        } catch (err) {
            console.error(err);
            alert('Failed to sign incident');
        } finally {
            setLoading(false);
        }
    };

    const updateSigningLocal = (incidentId: string, field: 'explanation' | 'signature', value: string) => {
        setSigningData(prev => ({
            ...prev,
            [incidentId]: {
                ...(prev[incidentId] || { explanation: '', signature: '' }),
                [field]: value
            }
        }));
    };
    const [notification, setNotification] = useState<{ show: boolean, message: string, severity: string } | null>(null);
    const [myLeaveRequests, setMyLeaveRequests] = useState<any[]>([]);
    const [editMode, setEditMode] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    const [formData, setFormData] = useState<Partial<User>>({
        name: user?.name || '',
        worker_id: user?.worker_id || '',
        first_name: (user as any)?.first_name || '',
        middle_name: (user as any)?.middle_name || '',
        last_name: (user as any)?.last_name || '',
        preferred_name: (user as any)?.preferred_name || '',
        birth_date: (user as any)?.birth_date || '',
        gender: (user as any)?.gender || '',
        marital_status: (user as any)?.marital_status || '',
        shirt_size: (user as any)?.shirt_size || '',
        address_street1: (user as any)?.address_street1 || '',
        address_street2: (user as any)?.address_street2 || '',
        address_city: (user as any)?.address_city || '',
        address_state: (user as any)?.address_state || '',
        address_zip: (user as any)?.address_zip || '',
        address_country: (user as any)?.address_country || 'United States',
        work_phone: (user as any)?.work_phone || '',
        work_phone_ext: (user as any)?.work_phone_ext || '',
        mobile_phone: (user as any)?.mobile_phone || '',
        home_phone: (user as any)?.home_phone || '',
        work_email: (user as any)?.work_email || '',
        home_email: (user as any)?.home_email || '',
        linkedin_url: (user as any)?.linkedin_url || '',
        twitter_url: (user as any)?.twitter_url || '',
        facebook_url: (user as any)?.facebook_url || '',
    });

    useEffect(() => {
        if (!authLoading && user) {
            setLocalUser(user);
            setFormData({
                name: user.name || '',
                worker_id: user.worker_id || '',
                first_name: (user as any).first_name || '',
                middle_name: (user as any).middle_name || '',
                last_name: (user as any).last_name || '',
                preferred_name: (user as any).preferred_name || '',
                birth_date: (user as any).birth_date || '',
                gender: (user as any).gender || '',
                marital_status: (user as any).marital_status || '',
                shirt_size: (user as any).shirt_size || '',
                address_street1: (user as any).address_street1 || '',
                address_street2: (user as any).address_street2 || '',
                address_city: (user as any).address_city || '',
                address_state: (user as any).address_state || '',
                address_zip: (user as any).address_zip || '',
                address_country: (user as any).address_country || 'United States',
                work_phone: (user as any).work_phone || '',
                work_phone_ext: (user as any).work_phone_ext || '',
                mobile_phone: (user as any).mobile_phone || '',
                home_phone: (user as any).home_phone || '',
                work_email: (user as any).work_email || '',
                home_email: (user as any).home_email || '',
                linkedin_url: (user as any).linkedin_url || '',
                twitter_url: (user as any).twitter_url || '',
                facebook_url: (user as any).facebook_url || '',
            });
        }
    }, [user?.id, authLoading]);


    // Clock tick – runs once, never torn down
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 5-hour auto-break check – re-runs only when localUser changes
    useEffect(() => {
        if (
            localUser?.status !== 'present' ||
            localUser?.availability !== 'available' ||
            !localUser?.last_status_change
        ) return;

        const workStarted = new Date(localUser.last_status_change).getTime();
        const elapsed = Math.floor((Date.now() - workStarted) / 1000);
        if (elapsed >= MAX_WORK_SECONDS) {
            handleTakeBreak(true);
            return;
        }

        // Schedule the break at exactly the right moment
        const remaining = (MAX_WORK_SECONDS - elapsed) * 1000;
        const breakTimer = setTimeout(() => handleTakeBreak(true), remaining);
        return () => clearTimeout(breakTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localUser]);

    const handleSaveProfile = async () => {
        if (!user) return;
        setValidationErrors({});

        // Validation
        const errors: Record<string, string> = {};
        if (!formData.worker_id?.trim()) errors.worker_id = "Employee # is required";
        if (!formData.first_name?.trim()) errors.first_name = "First Name is required";

        const validatePhone = (val?: string) => {
            if (!val) return true;
            return /^[0-9+() -]*$/.test(val);
        };

        if (!validatePhone((formData as any).phone)) errors.phone = "Phone must be numeric";
        if (!validatePhone(formData.work_phone)) errors.work_phone = "Work Phone must be numeric";
        if (!validatePhone(formData.mobile_phone)) errors.mobile_phone = "Mobile Phone must be numeric";
        if (!validatePhone(formData.home_phone)) errors.home_phone = "Home Phone must be numeric";

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            return;
        }

        setLoading(true);
        try {
            // Safe Update Strategy: Only include fields that actually exist in the database.
            // The 'user' object from AuthContext (select '*') contains all valid columns currently in the DB.
            const validColumns = Object.keys(user);

            // Transform empty strings to null for database compatibility (especially for DATE columns)
            const cleanData = Object.entries(formData).reduce((acc, [key, value]) => {
                // Only include the field if it's a valid column in the database
                if (validColumns.includes(key)) {
                    acc[key] = value === '' ? null : value;
                }
                return acc;
            }, {} as any);

            // Sync phone with mobile_phone for backward compatibility if needed
            if (cleanData.mobile_phone && !cleanData.phone) {
                cleanData.phone = cleanData.mobile_phone;
            }

            const { error } = await (supabase as any)
                .from('users')
                .update(cleanData)
                .eq('id', user.id);

            if (error) {
                console.error('Supabase Update Error:', error);
                alert(`Update failed: ${error.message}`);
                throw error;
            }

            const updatedUser = { ...user, ...formData };
            localStorage.setItem('bt_user', JSON.stringify(updatedUser));
            setLocalUser(updatedUser as any);
            setEditMode(false);
            alert('Profile updated successfully!');
        } catch (err: any) {
            console.error(err);
            if (!err.message?.includes('Update failed')) {
                alert('An unexpected error occurred while saving.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchUserStatus();
            fetchActiveTasks();
            fetchDisciplinaryIncidents();
            fetchPendingPolicies();

            // Initialize NFC Listening
            if ('NDEFReader' in window) {
                startNfcListening();
            } else {
                setNfcStatus('error');
                console.warn('Web NFC is not supported on this browser/device.');
            }

            const userChannel = supabase
                .channel(`public:users:id=eq.${user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, (payload) => {
                    setLocalUser(payload.new as any);
                })
                .subscribe();

            const taskChannel = supabase
                .channel(`public:tasks:assigned_to_id=eq.${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to_id=eq.${user.id}` }, () => {
                    fetchActiveTasks();
                })
                .subscribe();

            const disciplineChannel = supabase
                .channel(`public:disciplinary_incidents:worker_id=eq.${user.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'disciplinary_incidents', filter: `worker_id=eq.${user.id}` }, (payload) => {
                    fetchDisciplinaryIncidents();
                    setNotification({
                        show: true,
                        message: `New Notice: A ${payload.new.category} incident has been recorded.`,
                        severity: payload.new.severity
                    });
                    setTimeout(() => setNotification(null), 8000);
                })
                .subscribe();

            const leaveRequestChannel = supabase
                .channel(`public:leave_requests:user_id=eq.${user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leave_requests', filter: `user_id=eq.${user.id}` }, (payload) => {
                    fetchMyLeaveRequests();
                    const updated = payload.new as any;
                    if (updated.status === 'approved') {
                        setNotification({
                            show: true,
                            message: `Your ${updated.type === 'pto' ? 'PTO' : 'Sick Leave'} request (${updated.start_date} – ${updated.end_date}) has been approved!`,
                            severity: 'success'
                        });
                        setTimeout(() => setNotification(null), 10000);
                    } else if (updated.status === 'rejected') {
                        setNotification({
                            show: true,
                            message: `Your ${updated.type === 'pto' ? 'PTO' : 'Sick Leave'} request (${updated.start_date} – ${updated.end_date}) was not approved.${updated.admin_notes ? ' Note: ' + updated.admin_notes : ''}`,
                            severity: 'major'
                        });
                        setTimeout(() => setNotification(null), 12000);
                    }
                })
                .subscribe();

            return () => {
                userChannel.unsubscribe();
                taskChannel.unsubscribe();
                disciplineChannel.unsubscribe();
                leaveRequestChannel.unsubscribe();
            };
        }
    }, [user?.id]);


    const fetchUserStatus = async () => {
        if (!user) return;
        const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single();
        if (error) { console.error('Error fetching user status:', error); return; }
        if (data) setLocalUser(data);
    };

    const fetchActiveTasks = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('assigned_to_id', user.id)
            .neq('status', 'completed');
        if (error) { console.error('Error fetching tasks:', error); return; }
        if (data) setActiveTasks(data);
    };

    const fetchDisciplinaryIncidents = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('disciplinary_incidents')
                .select('*, actions:disciplinary_actions(*)')
                .eq('worker_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setDisciplinaryIncidents(data);

                // Show notification if there are unsigned incidents on load
                const unsigned = data.filter((inc: any) => !inc.worker_signature);
                if (unsigned.length > 0) {
                    setNotification({
                        show: true,
                        message: `Notice: You have ${unsigned.length} pending incident reports that require your review.`,
                        severity: 'major'
                    });
                    setTimeout(() => setNotification(null), 10000);
                }
            }
        } catch (err) {
            console.error('Error fetching disciplinary incidents:', err);
        }
    };

    const fetchPendingPolicies = async () => {
        if (!user) return;
        try {
            let { data } = await supabase
                .from('disciplinary_policies')
                .select('*')
                .eq('is_active', true);

            let policies: any[] = data || [];

            const { data: acks } = await supabase
                .from('policy_acknowledgments')
                .select('policy_id')
                .eq('worker_id', user.id);

            const ackedIds = acks?.map((a: any) => a.policy_id) || [];
            const pending = policies?.filter((p: any) => !ackedIds.includes(p.id)) || [];

            setPendingPolicies(pending);
        } catch (err) {
            console.error('Error fetching policies:', err);
        }
    };

    const handleAcknowledgePolicy = async () => {
        if (!policySignature) {
            alert('Please type your full name to sign the document.');
            return;
        }
        if (!user) return;
        setIsSigningPolicy(true);
        try {
            // Remove old signatures for these policies (if any exist) to avoid unique constraint database errors
            const policyIds = pendingPolicies.map(p => p.id);
            if (policyIds.length > 0) {
                await (supabase as any)
                    .from('policy_acknowledgments')
                    .delete()
                    .eq('worker_id', user.id)
                    .in('policy_id', policyIds);
            }

            const inserts = pendingPolicies.map(p => ({
                worker_id: user.id,
                policy_id: p.id,
                signature_data: policySignature,
                signed_at: new Date().toISOString()
            }));

            const { error: insertError } = await (supabase as any)
                .from('policy_acknowledgments')
                .insert(inserts);

            if (insertError) throw insertError;

            setPolicySignature('');
            await fetchPendingPolicies();
        } catch (err) {
            console.error(err);
            alert('Failed to sign document');
        } finally {
            setIsSigningPolicy(false);
        }
    };

    if (authLoading) return <div className="loading-screen">{t('common.authenticating')}</div>;
    if (!user) return <Navigate to="/login" replace />;

    if (pendingPolicies.length > 0) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ background: 'white', width: '100%', maxWidth: '900px', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', height: '95vh', maxHeight: '1000px' }}>
                    <div style={{ background: 'var(--primary)', padding: '1.5rem 2rem', color: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>Standard Operating Procedure & Disciplinary Standards</h1>
                                <p style={{ margin: '0.25rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>Requirement for Work Authorization. Please review and sign below.</p>
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1, backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <iframe
                            src="/disciplinary-standards.pdf#toolbar=0&navpanes=0&view=FitH"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Disciplinary Standards for Employees"
                        />
                    </div>

                    <div style={{ padding: '1.5rem', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Full Legal Name Signature</label>
                            <input
                                type="text"
                                value={policySignature}
                                onChange={e => setPolicySignature(e.target.value)}
                                placeholder="Type your full name exactly as per ID..."
                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1.1rem', background: '#f8fafc' }}
                            />
                        </div>
                        <button
                            disabled={isSigningPolicy || !policySignature}
                            onClick={handleAcknowledgePolicy}
                            style={{
                                width: '100%',
                                padding: '1.25rem',
                                borderRadius: '12px',
                                background: policySignature ? 'var(--primary)' : 'var(--text-muted)',
                                color: 'white',
                                border: 'none',
                                fontSize: '1.1rem',
                                fontWeight: 800,
                                cursor: policySignature ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isSigningPolicy ? 'Submitting Signature...' : 'I Accept & Sign Document'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleClockIn = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateUserStatus(user.id, 'present', 'available');
            await logActivity(user.id, 'clock_in', 'Worker clocked in via portal');
            await fetchUserStatus();
        } catch (err) {
            console.error(err);
            alert('Failed to clock in');
        } finally {
            setLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!user) return;
        if (!window.confirm("Are you sure you want to clock out? All active tasks will be marked as completed.")) return;

        setLoading(true);
        try {
            await completeAllTasks(user.id);
            await updateUserStatus(user.id, 'offline', 'available');
            await logActivity(user.id, 'clock_out', 'Worker clocked out via portal');
            await fetchUserStatus();
            setShowBreakOverlay(false);
        } catch (err) {
            console.error(err);
            alert('Failed to clock out');
        } finally {
            setLoading(false);
        }
    };

    const handleTakeBreak = async (isAuto = false) => {
        if (!user) return;
        setLoading(true);
        try {
            await pauseAllActiveTasks(user.id, isAuto ? 'Break Required (5-Hour Limit)' : 'Worker requested break');
            await updateUserStatus(user.id, 'present', 'break');
            await logActivity(user.id, 'break_start', isAuto ? 'Forced break due to 5-hour limit' : 'Worker started break');
            await fetchUserStatus();
            if (isAuto) {
                setShowBreakOverlay(true);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to start break');
        } finally {
            setLoading(false);
        }
    };

    const handleEndBreak = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateUserStatus(user.id, 'present', 'available');
            await logActivity(user.id, 'break_end', 'Worker ended break');
            // We don't auto-resume tasks here because the user might want choice, 
            // but we could call resumeAllAutoPausedTasks(user.id) if preferred.
            await fetchUserStatus();
            setShowBreakOverlay(false);
        } catch (err) {
            console.error(err);
            alert('Failed to end break');
        } finally {
            setLoading(false);
        }
    };

    const startNfcListening = async () => {
        try {
            const reader = new (window as any).NDEFReader();
            // Permissions: Chrome requires a user gesture if not already allowed.
            await reader.scan();
            setNfcStatus('listening');

            reader.onreading = async (event: any) => {
                const { serialNumber } = event;
                setNfcStatus('reading');
                await processNfcTap(serialNumber);
                setTimeout(() => setNfcStatus('listening'), 2000);
            };

            reader.onreadingerror = () => {
                setNotification({
                    show: true,
                    message: "Tag detected but blocked by Chrome. Please use 'NFC Tools' to write a small Text record to this card first.",
                    severity: 'warning'
                });
                setNfcStatus('error');
                setTimeout(() => setNfcStatus('listening'), 5000);
            };

        } catch (error: any) {
            console.error("NFC Error:", error);
            if (error.name === 'NotAllowedError') {
                setNfcStatus('idle'); // Needs user gesture
            } else {
                setNfcStatus('error');
            }
        }
    };

    const processNfcTap = async (tagId: string) => {
        try {
            // Find worker by NFC ID
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('nfc_id', tagId)
                .single();

            const worker = data as any;

            if (error || !worker) {
                setNotification({
                    show: true,
                    message: `NFC Tag not recognized (ID: ${tagId || 'Unknown'}). Please register this card in the Admin Portal.`,
                    severity: 'warning'
                });
                setTimeout(() => setNotification(null), 5000);
                return;
            }

            const isCurrentlyIn = worker.status === 'present';
            const action = isCurrentlyIn ? 'clock_out' : 'clock_in';
            const newStatus = isCurrentlyIn ? 'offline' : 'present';

            // Confirm clock out if they have tasks (only if it's the current user, otherwise auto-clock-out)
            // For a "Terminal" feel, we auto-clock out.
            if (isCurrentlyIn) {
                await completeAllTasks(worker.id);
            }

            await updateUserStatus(worker.id, newStatus, 'available');
            await logActivity(worker.id, action, `Worker ${action} via NFC Tap`);

            // Audio feedback (optional, but requested "beep")
            try {
                const audioCtx = new (window as any).AudioContext();
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(isCurrentlyIn ? 440 : 880, audioCtx.currentTime);
                osc.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.1);
            } catch (e) { /* audio failed */ }

            setNotification({
                show: true,
                message: `${isCurrentlyIn ? 'Goodbye' : 'Welcome'}, ${worker.name}! You are now ${isCurrentlyIn ? 'Clocked Out' : 'Clocked In'}.`,
                severity: 'success'
            });
            setTimeout(() => setNotification(null), 5000);

            // If the tapped worker is the SAME as the logged in user, refresh local state
            if (user && worker.id === user.id) {
                fetchUserStatus();
            }

        } catch (err) {
            console.error("Error processing NFC tap:", err);
            setNotification({
                show: true,
                message: "System error processing NFC tap.",
                severity: 'error'
            });
        }
    };

    const isClockedIn = localUser?.status === 'present';

    return (
        <div className="worker-portal-layout app-container">
            <style dangerouslySetInnerHTML={{
                __html: `
                .worker-main-wrapper {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-width: 0;
                }


                .worker-content {
                    padding: var(--content-padding, 2.5rem 3.5rem);
                    width: 100%;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .status-card, .profile-section, .conduct-section {
                    background: var(--bg-card);
                    border-radius: 20px;
                    padding: 2rem;
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border);
                    margin-bottom: 1.5rem;
                }

                .status-value {
                    font-size: clamp(2rem, 8vw, 3rem);
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.02em;
                    flex-wrap: wrap;
                }

                .time-display {
                    font-size: clamp(1.25rem, 5vw, 2rem);
                    font-weight: 700;
                    color: var(--text-main);
                    font-variant-numeric: tabular-nums;
                }

                @media (max-width: 900px) {
                    .worker-sidebar { width: 80px; padding: 2rem 0.75rem; }
                    .sidebar-brand span, .nav-item span { display: none; }
                }

                @media (max-width: 768px) {
                    .worker-main-wrapper {
                        margin-left: 0 !important;
                        padding-top: 4rem; /* For mobile menu button */
                    }
                    
                    .status-card, .profile-section, .conduct-section {
                        padding: 1.5rem;
                        border-radius: 16px;
                    }

                    .on-duty-banner {
                        flex-direction: column;
                        padding: 1.5rem !important;
                        align-items: flex-start !important;
                        gap: 1.5rem !important;
                    }

                    .on-duty-banner .clock-btn {
                        width: 100%;
                    }
                    
                    .notification-popup {
                        min-width: calc(100% - 2rem);
                        right: 1rem;
                        top: 1rem;
                        padding: 1rem;
                    }
                }

                .notification-popup {
                    position: fixed;
                    top: 2rem;
                    right: 2rem;
                    background: white;
                    border-radius: 20px;
                    padding: 1.5rem;
                    box-shadow: var(--shadow-xl);
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    z-index: 10000;
                    border: 1px solid #e2e8f0;
                    min-width: 400px;
                    animation: slideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* Layout overrides to match admin */
                .worker-main-wrapper {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    margin-left: 260px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    min-width: 0;
                }
                
                @media (max-width: 1024px) {
                    .worker-main-wrapper {
                        margin-left: 80px;
                    }
                }

                .worker-main-wrapper.expanded {
                    margin-left: 80px;
                }

                .on-duty-banner {
                    width: 100%;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 20px;
                    padding: 2.5rem 3rem;
                    color: white;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 20px 40px -10px rgba(16, 185, 129, 0.3);
                    position: relative;
                    overflow: hidden;
                    gap: 2.5rem;
                }

                .on-duty-banner::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    right: -10%;
                    width: 400px;
                    height: 400px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    z-index: 1;
                }

                .off-duty-banner {
                    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
                    box-shadow: 0 20px 40px -10px rgba(30, 27, 75, 0.3);
                }

                .banner-content {
                    position: relative;
                    z-index: 2;
                }

                .banner-status {
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    font-weight: 800;
                    opacity: 0.9;
                    margin-bottom: 0.75rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .banner-title {
                    font-size: 2.8rem;
                    font-weight: 900;
                    margin: 0;
                    letter-spacing: -0.04em;
                    line-height: 1;
                }

                .banner-time {
                    font-size: 1.5rem;
                    font-weight: 600;
                    opacity: 0.8;
                    margin-top: 0.5rem;
                }

                .banner-actions {
                    position: relative;
                    z-index: 2;
                }

                .clock-btn-premium {
                    padding: 0.8rem 1.8rem;
                    border-radius: 18px;
                    font-size: 1rem;
                    font-weight: 800;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    background: white;
                }

                .btn-in { color: #10b981; }
                .btn-out { color: #ef4444; }

                .clock-btn-premium:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 15px 30px rgba(0,0,0,0.2);
                }

                .worker-dashboard-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
                    gap: 2.5rem;
                }

                @media (max-width: 1024px) {
                    .worker-dashboard-grid {
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                    .worker-content {
                        padding: 1.5rem 1rem !important;
                    }
                    .on-duty-banner {
                        padding: 2rem 1.5rem;
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1.5rem;
                    }
                    .banner-title {
                        font-size: 2rem;
                    }
                    .worker-topbar {
                        padding: 0 1.5rem !important;
                    }
                }

                .info-card {
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
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
                    color: var(--primary);
                }
                .card-header i {
                    font-size: 1.1rem;
                    color: var(--primary);
                    opacity: 0.8;
                }
                .card-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 1.5rem;
                    padding: 1.5rem;
                }
                .info-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .info-field.full-width {
                    grid-column: 1 / -1;
                }
                .info-field label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    text-transform: capitalize;
                }
                .info-input {
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    border: 2px solid var(--border);
                    font-size: 0.95rem;
                    color: var(--text-main);
                    background: var(--bg-main);
                    width: 100%;
                    outline: none;
                    transition: all 0.2s;
                }
                .info-input:focus { border-color: var(--primary); background: var(--bg-card); }
                .info-input:disabled { background: var(--border); cursor: not-allowed; border-color: var(--border); opacity: 0.7; }
                .info-input.error { border-color: var(--danger); background: var(--danger-bg); }
                .error-text { color: var(--danger); font-size: 0.75rem; font-weight: 600; margin-top: 4px; }
                
                .section-title-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 1.5rem;
                }
                .section-title-row i { font-size: 1.5rem; color: var(--primary); opacity: 0.4; }
                .section-title-row h2 { margin: 0; font-size: 1.75rem; font-weight: 900; color: var(--text-main); letter-spacing: -0.02em; }

                .info-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .info-table th {
                    text-align: left;
                    padding: 1rem 1.5rem;
                    background: var(--bg-main);
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid var(--border);
                }
                .info-table td {
                    padding: 1rem 1.5rem;
                    font-size: 0.9rem;
                    border-bottom: 1px solid var(--border);
                    color: var(--text-main);
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
                    border-bottom-color: var(--primary);
                    background: var(--primary-bg);
                }
                .small-action-btn {
                    background: var(--bg-card);
                    border: 1px solid var(--primary);
                    color: var(--primary);
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .small-action-btn:hover { background: var(--primary); color: white; }

                .custom-eeo-dropdown { position: relative; width: 100%; }
                .eeo-select-trigger {
                    display: flex;
                    align-items: center;
                    padding: 0 1rem;
                    height: 48px;
                    background: var(--bg-main);
                    border: 2px solid var(--border);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.95rem;
                    color: var(--text-main);
                    justify-content: space-between;
                }
                .eeo-select-trigger.active { border-color: var(--primary); background: var(--bg-card); }
                .eeo-dropdown-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    width: 100%;
                    background: var(--bg-card);
                    border-radius: 12px;
                    box-shadow: var(--shadow-xl);
                    border: 1px solid var(--border);
                    z-index: 1000;
                    overflow: hidden;
                }
                .eeo-search-box {
                    padding: 12px;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .eeo-search-box input { border: none; outline: none; width: 100%; font-size: 0.9rem; background: transparent; color: var(--text-main); }
                .eeo-options-list { max-height: 250px; overflow-y: auto; padding: 8px 0; }
                .eeo-option { padding: 10px 16px; font-size: 0.9rem; cursor: pointer; color: var(--text-main); }
                .eeo-option:hover { background: var(--bg-main); }
                .eeo-option.selected { background: var(--primary-bg); color: var(--primary); font-weight: 700; }

                /* Sidebar & Nav Restoration */
                .sidebar {
                    background: var(--primary);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    padding: 1.5rem 1rem;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .sidebar .brand {
                    color: white;
                    margin-bottom: 2.5rem;
                }
                .portal-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.85rem 1.25rem;
                    border-radius: 14px;
                    color: rgba(255, 255, 255, 0.8);
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 600;
                    margin-bottom: 0.25rem;
                }
                .portal-nav-item i {
                    font-size: 1.2rem;
                    width: 24px;
                    text-align: center;
                    color: rgba(255, 255, 255, 0.8);
                }
                .portal-nav-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }
                .portal-nav-item:hover i {
                    color: white;
                }
                .portal-nav-item.active {
                    background: var(--accent);
                    color: var(--primary);
                    box-shadow: 0 10px 20px -5px rgba(245, 158, 11, 0.2);
                }
                .portal-nav-item.active i {
                    color: var(--primary);
                }
                .sidebar-toggle {
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: white;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .sidebar-toggle:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            ` }} />

            {notification?.show && (
                <div className="notification-popup" style={{
                    borderLeft: `6px solid ${notification.severity === 'success' ? '#10b981' :
                        notification.severity === 'major' || notification.severity === 'error' ? '#ef4444' : '#f59e0b'
                        }`
                }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        background: notification.severity === 'success' ? '#dcfce7' :
                            notification.severity === 'major' || notification.severity === 'error' ? '#fee2e2' : '#fef3c7',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <i className={`fa-solid ${notification.severity === 'success' ? 'fa-circle-check' :
                            notification.severity === 'major' || notification.severity === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'
                            }`} style={{
                                color: notification.severity === 'success' ? '#10b981' :
                                    notification.severity === 'major' || notification.severity === 'error' ? '#ef4444' : '#d97706',
                                fontSize: '1.5rem'
                            }}></i>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                            {notification.severity === 'success' ? t('common.success') : t('common.attentionRequired')}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{notification.message}</div>
                    </div>
                    <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            )}

            {isMobileOpen && (
                <div
                    className="mobile-overlay"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
                <div className="brand">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem' }}>
                        <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}>
                            <span style={{ color: 'white', fontWeight: 900 }}>B</span>
                        </div>
                        {!isCollapsed && <span style={{ letterSpacing: '-0.03em', fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>Babylon</span>}
                    </div>
                    <button className="sidebar-toggle" onClick={() => {
                        if (window.innerWidth <= 768) {
                            setIsMobileOpen(false);
                        } else {
                            setIsCollapsed(!isCollapsed);
                        }
                    }}>
                        <i className={`fa-solid ${isCollapsed ? 'fa-bars-staggered' : 'fa-chevron-left'}`}></i>
                    </button>
                </div>

                <ul className="nav-menu">
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-gauge-high"></i> <span>{t('workerPortal.tabs.dashboard')}</span>
                        </div>
                    </li>
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'personal_info' ? 'active' : ''}`} onClick={() => { setActiveTab('personal_info'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-user-gear"></i> <span>{t('workerPortal.tabs.personalInfo')}</span>
                        </div>
                    </li>
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'conduct' ? 'active' : ''}`} onClick={() => { setActiveTab('conduct'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-shield-halved"></i> <span>{t('workerPortal.tabs.conduct')}</span>
                        </div>
                    </li>
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'training' ? 'active' : ''}`} onClick={() => { setActiveTab('training'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-graduation-cap"></i> <span>{t('workerPortal.tabs.training')}</span>
                        </div>
                    </li>
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'timeoff' ? 'active' : ''}`} onClick={() => { setActiveTab('timeoff'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-calendar-day"></i> <span>{t('workerPortal.tabs.timeOff')}</span>
                        </div>
                    </li>
                    <li>
                        <div className={`portal-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setIsMobileOpen(false); }}>
                            <i className="fa-solid fa-sliders"></i> <span>{t('workerPortal.tabs.settings')}</span>
                        </div>
                    </li>
                </ul>

                <div className="bottom-menu">
                    <ul className="nav-menu">
                        <li>
                            <div className="nav-item" onClick={logout} style={{ color: '#ef4444' }}>
                                <i className="fa-solid fa-right-from-bracket"></i> {!isCollapsed && <span>{t('sidebar.logout')}</span>}
                            </div>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className={`worker-main-wrapper ${isCollapsed ? 'expanded' : ''}`}>
                <header className="worker-topbar" style={{
                    height: '80px',
                    background: 'var(--bg-card)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 3.5rem',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="mobile-menu-btn hide-desktop" onClick={() => setIsMobileOpen(true)} style={{ position: 'static' }}>
                            <i className="fa-solid fa-bars"></i>
                        </button>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('workerPortal.title')}</div>
                            <h2 style={{ margin: 0, fontWeight: 900, color: 'var(--text-main)', fontSize: '1.75rem' }}>
                            {activeTab === 'dashboard' ? t('workerPortal.overview') :
                                activeTab === 'personal_info' ? t('workerPortal.tabs.personalInfo') :
                                    activeTab === 'conduct' ? t('workerPortal.conduct.title') :
                                        activeTab === 'settings' ? t('workerPortal.settings.title') :
                                            activeTab === 'training' ? t('workerPortal.tabs.training') : t('workerPortal.tabs.timeOff')}
                        </h2>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        {/* Quick Access Settings */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.4rem', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    onClick={() => setLanguage('en')}
                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', border: 'none', background: i18n.language === 'en' ? 'var(--primary)' : 'transparent', color: i18n.language === 'en' ? 'white' : 'var(--text-muted)', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLanguage('es')}
                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', border: 'none', background: i18n.language === 'es' ? 'var(--primary)' : 'transparent', color: i18n.language === 'es' ? 'white' : 'var(--text-muted)', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                    ES
                                </button>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
                            <button
                                onClick={toggleTheme}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.5rem' }}
                                title={t('workerPortal.settings.theme')}
                            >
                                {currentTheme === 'light' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun"></i>}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{user?.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>ID: {user?.worker_id}</div>
                            </div>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                background: 'var(--primary)',
                                color: 'white',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1.2rem'
                            }}>{user.name?.[0]}</div>
                        </div>
                        <button onClick={logout} title={t('sidebar.logout')} style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', background: 'var(--bg-main)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                            <i className="fa-solid fa-right-from-bracket"></i>
                        </button>
                    </div>
                </header>

                <div className="worker-content" style={{ padding: '2.5rem 3.5rem' }}>
                    {activeTab === 'dashboard' && nfcStatus !== 'idle' && (
                        <div
                            className={`nfc-status-bar ${nfcStatus === 'error' ? 'nfc-status-error' : nfcStatus === 'reading' ? 'nfc-status-reading' : ''}`}
                            style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: (nfcStatus === 'error') ? 'pointer' : 'default' }} onClick={() => (nfcStatus === 'error') && startNfcListening()}>
                                {nfcStatus === 'listening' && <div className="nfc-heartbeat" style={{ marginRight: '10px' }}></div>}
                                {nfcStatus === 'listening' ? t('workerPortal.nfcActive') :
                                    nfcStatus === 'reading' ? t('workerPortal.nfcReading') :
                                        nfcStatus === 'error' ? t('workerPortal.nfcError') : t('workerPortal.nfcOffline')}
                            </div>

                            <div style={{ width: '100%', display: 'flex', gap: '1rem' }} onClick={e => e.stopPropagation()}>
                                <input
                                    type="text"
                                    placeholder={t('workerPortal.simulateNfc')}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.currentTarget.value) {
                                            processNfcTap(e.currentTarget.value);
                                            e.currentTarget.value = '';
                                        }
                                    }}
                                />
                                <button
                                    onClick={(e) => {
                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        if (input.value) {
                                            processNfcTap(input.value);
                                            input.value = '';
                                        }
                                    }}
                                    className="btn btn-primary"
                                    style={{ padding: '0.75rem 2rem' }}
                                >
                                    {t('workerPortal.scan')}
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'dashboard' && nfcStatus === 'idle' && (
                        <div className="nfc-status-bar" onClick={startNfcListening} style={{ cursor: 'pointer', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--accent)', color: 'var(--accent)', borderRadius: '12px' }}>
                            <i className="fa-solid fa-hand-pointer" style={{ marginRight: '10px' }}></i>
                            {t('workerPortal.nfcPending')}
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div className="worker-dashboard-grid" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                <div className={`on-duty-banner ${!isClockedIn ? 'off-duty-banner' : ''}`}>
                                    <div className="banner-content">
                                        <div className="banner-status">
                                            <div style={{ width: '12px', height: '12px', background: isClockedIn ? 'var(--success)' : 'var(--text-muted)', borderRadius: '50%', boxShadow: isClockedIn ? '0 0 15px var(--success)' : 'none' }}></div>
                                            {isClockedIn ? t('workerPortal.onDuty') : t('workerPortal.offDuty')}
                                        </div>
                                        <h1 className="banner-title">{isClockedIn ? t('workerPortal.workerLoggedIn') : t('workerPortal.shiftNotStarted')}</h1>
                                        <div className="banner-time">
                                            <i className="fa-regular fa-clock" style={{ marginRight: '10px' }}></i>
                                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                        </div>
                                    </div>
                                    <div className="banner-actions">
                                        {!isClockedIn ? (
                                            <button onClick={handleClockIn} className="clock-btn clock-in">
                                                <i className="fa-solid fa-play"></i> {t('workerPortal.clockIn')}
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                {localUser?.availability === 'break' ? (
                                                    <button onClick={handleEndBreak} className="clock-btn break-btn" style={{ background: '#10b981' }}>
                                                        <i className="fa-solid fa-mug-hot"></i> {t('workerPortal.endBreak')}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleTakeBreak()} className="clock-btn break-btn">
                                                        <i className="fa-solid fa-mug-hot"></i> {t('workerPortal.takeBreak')}
                                                    </button>
                                                )}
                                                <button onClick={handleClockOut} className="clock-btn clock-out">
                                                    <i className="fa-solid fa-stop"></i> {t('workerPortal.clockOut')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="status-card" style={{ display: 'flex', flexDirection: 'column', width: '100%', margin: 0, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="status-label" style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem', display: 'block' }}>{t('workerPortal.activeTasks')}</div>
                                    {activeTasks.length > 0 ? (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                            {activeTasks.map(task => (
                                                <li key={task.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '20px', background: 'var(--bg-main)', transition: 'transform 0.2s' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>{task.description}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 600 }}>Ref: {task.mo_reference}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-muted)', fontStyle: 'italic', background: 'var(--bg-main)', borderRadius: '20px', border: '1.5px dashed var(--border)' }}>{t('workerPortal.noActiveTasks')}</div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                <div className="status-card" style={{ margin: 0, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="status-label" style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem', display: 'block' }}>{t('workerPortal.todaySummary')}</div>
                                    <div className="responsive-grid-2" style={{ display: 'grid', gap: '1rem' }}>
                                        <div style={{ padding: '1.5rem', background: 'var(--primary-bg)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>{t('workerPortal.totalHours')}</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>8.5</div>
                                        </div>
                                        <div style={{ padding: '1.5rem', background: 'var(--success-bg)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>{t('workerPortal.efficiency')}</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>94%</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="status-card" style={{ margin: 0, flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="status-label" style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem', display: 'block' }}>{t('workerPortal.notifications')}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ padding: '1.25rem', background: 'var(--warning-bg)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ width: '40px', height: '40px', background: 'var(--accent)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                <i className="fa-solid fa-bullhorn"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>{t('workerPortal.newPolicy')}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('workerPortal.updateSop')}</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: 'var(--primary-bg)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ width: '40px', height: '40px', background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                <i className="fa-solid fa-calendar-check"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>{t('workerPortal.monthlyReview')}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('workerPortal.scheduledFriday')}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'personal_info' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div className="section-title-row" style={{ marginBottom: 0 }}>
                                    <i className="fa-solid fa-user-gear"></i>
                                    <h2 style={{ fontSize: '2rem' }}>{t('workerPortal.tabs.personalInfo')}</h2>
                                </div>
                                <button className="edit-btn" onClick={() => {
                                    if (editMode) {
                                        // Reset fields on cancel
                                        setFormData(user as any);
                                        setValidationErrors({});
                                    }
                                    setEditMode(!editMode);
                                }} style={{ padding: '0.9rem 1.75rem', borderRadius: '14px', border: 'none', background: editMode ? 'var(--danger-bg)' : 'var(--bg-main)', color: editMode ? 'var(--danger)' : 'var(--primary)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {editMode ? t('common.cancel') : t('common.edit')}
                                </button>
                            </div>

                            {/* Basic Information */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-id-card"></i>
                                    <h3>{t('employeeDetail.personal.basicInfo')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.employeeNum')}</label>
                                        <input type="text" className={`info-input ${validationErrors.worker_id ? 'error' : ''}`} value={formData.worker_id || ''} disabled />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.status')}</label>
                                        <select className="info-input" value={formData.active === false ? "false" : "true"} disabled>
                                            <option value="true">{t('common.active')}</option>
                                            <option value="false">{t('common.archived')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.firstName')}</label>
                                        <input type="text" className={`info-input ${validationErrors.first_name ? 'error' : ''}`} value={formData.first_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))} disabled={!editMode} />
                                        {validationErrors.first_name && <span className="error-text">{validationErrors.first_name}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.middleName')}</label>
                                        <input type="text" className="info-input" value={formData.middle_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, middle_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.lastName')}</label>
                                        <input type="text" className="info-input" value={formData.last_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.preferredName')}</label>
                                        <input type="text" className="info-input" value={formData.preferred_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, preferred_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.birthDate')}</label>
                                        <input type="date" className="info-input" value={formData.birth_date || ''} onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.gender')}</label>
                                        <select className="info-input" value={formData.gender || ""} onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))} disabled={!editMode}>
                                            <option value="">{t('common.select')}</option>
                                            <option value="Male">{t('common.male')}</option>
                                            <option value="Female">{t('common.female')}</option>
                                            <option value="Other">{t('common.other')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.maritalStatus')}</label>
                                        <select className="info-input" value={formData.marital_status || ""} onChange={(e) => setFormData(prev => ({ ...prev, marital_status: e.target.value }))} disabled={!editMode}>
                                            <option value="">{t('common.select')}</option>
                                            <option value="Single">{t('common.single')}</option>
                                            <option value="Married">{t('common.married')}</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.shirtSize')}</label>
                                        <select className="info-input" value={formData.shirt_size || ""} onChange={(e) => setFormData(prev => ({ ...prev, shirt_size: e.target.value }))} disabled={!editMode}>
                                            <option value="">{t('common.select')}</option>
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
                                        <input type="text" className="info-input" value={formData.address_street1 || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_street1: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('employeeDetail.personal.street2')}</label>
                                        <input type="text" className="info-input" value={formData.address_street2 || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_street2: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.city')}</label>
                                        <input type="text" className="info-input" value={formData.address_city || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_city: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.state')}</label>
                                        <input type="text" className="info-input" value={formData.address_state || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_state: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.zip')}</label>
                                        <input type="text" className="info-input" value={formData.address_zip || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_zip: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('employeeDetail.personal.country')}</label>
                                        <input type="text" className="info-input" value={formData.address_country || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_country: e.target.value }))} disabled={!editMode} />
                                    </div>
                                </div>
                            </div>

                            {/* Contact */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-address-book"></i>
                                    <h3>{t('hire.sections.contact')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field">
                                        <label>{t('hire.fields.workPhone')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-phone" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.work_phone ? 'error' : ''}`} style={{ flex: 1 }} value={formData.work_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('hire.fields.ext')}</label>
                                        <input type="text" className="info-input" value={formData.work_phone_ext || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_phone_ext: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>{t('hire.fields.mobilePhone')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-mobile-screen" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.mobile_phone ? 'error' : ''}`} style={{ flex: 1 }} value={formData.mobile_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, mobile_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field">
                                        <label>{t('hire.fields.homePhone')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-phone" style={{ color: "var(--text-muted)" }}></i><input type="text" className={`info-input ${validationErrors.home_phone ? 'error' : ''}`} style={{ flex: 1 }} value={formData.home_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, home_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('hire.fields.workEmail')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-envelope" style={{ color: "var(--text-muted)" }}></i><input type="email" className="info-input" style={{ flex: 1 }} value={formData.work_email || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_email: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('hire.fields.homeEmail')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-envelope" style={{ color: "var(--text-muted)" }}></i><input type="email" className="info-input" style={{ flex: 1 }} value={formData.home_email || ''} onChange={(e) => setFormData(prev => ({ ...prev, home_email: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-share-nodes"></i>
                                    <h3>{t('common.socialLinks')}</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>{t('common.linkedin')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-linkedin" style={{ color: "var(--text-muted)" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={formData.linkedin_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('common.twitter')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-twitter" style={{ color: "var(--text-muted)" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={formData.twitter_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, twitter_url: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>{t('common.facebook')}</label>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}><i className="fa-solid fa-facebook" style={{ color: "var(--text-muted)" }}></i><input type="text" className="info-input" style={{ flex: 1 }} value={formData.facebook_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, facebook_url: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Education */}
                            <div className="info-card">
                                <div className="card-header">
                                    <i className="fa-solid fa-graduation-cap"></i>
                                    <h3>{t('employeeDetail.education.title')}</h3>
                                </div>
                                <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                                    <button className="text-link" style={{ color: 'var(--primary)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }} disabled={!editMode}><i className="fa-solid fa-plus-circle"></i> {t('employeeDetail.education.add')}</button>
                                </div>
                            </div>


                            {editMode && (
                                <div style={{ position: 'sticky', bottom: '2rem', display: 'flex', justifyContent: 'center', zIndex: 100 }}>
                                    <button className="clock-btn" style={{ background: 'var(--success)', color: 'white', width: 'auto', padding: '1rem 3rem', boxShadow: 'var(--shadow-lg)' }} onClick={handleSaveProfile} disabled={loading}>
                                        {loading ? t('common.saving') : t('common.saveChanges')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'conduct' && (
                        <div className="profile-section" style={{ width: '100%' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-shield-halved"></i>
                                <h2 style={{ fontSize: '2rem', color: 'var(--text-main)' }}>{t('workerPortal.conduct.title')}</h2>
                            </div>

                            {disciplinaryIncidents.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
                                    {disciplinaryIncidents.map(incident => (
                                        <div key={incident.id} style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            padding: '1.5rem',
                                            borderRadius: '20px',
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border)',
                                            boxShadow: 'var(--shadow-sm)',
                                            height: 'fit-content',
                                            transition: 'transform 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                                <div style={{
                                                    height: '8px',
                                                    width: '40px',
                                                    borderRadius: '4px',
                                                    background: incident.severity === 'gross_misconduct' ? 'var(--danger)' : incident.severity === 'major' ? 'var(--warning)' : 'var(--accent)'
                                                }}></div>
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    color: incident.severity === 'gross_misconduct' ? 'var(--danger)' : 'var(--accent)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    {incident.severity.replace('_', ' ')}
                                                </div>
                                            </div>

                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                {incident.category.toUpperCase().replace('_', ' ')}
                                            </h4>

                                            <p style={{ margin: '0 0 16px 0', color: 'var(--text-main)', lineHeight: '1.6', fontSize: '0.95rem', opacity: 0.8 }}>
                                                {incident.description}
                                            </p>

                                            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                            <i className="fa-regular fa-calendar" style={{ marginRight: '6px' }}></i>
                                                            {new Date(incident.incident_date).toLocaleDateString()}
                                                        </div>
                                                        {incident.signed_at && (
                                                            <div title={t('workerPortal.conduct.signedAt', { date: new Date(incident.signed_at).toLocaleDateString() })} style={{ fontSize: '0.75rem', color: 'white', background: 'var(--success)', padding: '4px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                                                <i className="fa-solid fa-check-double"></i>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {!incident.signed_at ? (
                                                    <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                                        <div style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '1rem' }}>{t('workerPortal.conduct.signIncident')}</div>
                                                        <input
                                                            type="text"
                                                            placeholder={t('workerPortal.conduct.signature')}
                                                            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '0.75rem', fontSize: '0.9rem', width: '100%', borderRadius: '12px', marginBottom: '1rem', color: 'var(--text-main)' }}
                                                            value={signingData[incident.id]?.signature || ''}
                                                            onChange={e => updateSigningLocal(incident.id, 'signature', e.target.value)}
                                                        />
                                                        <button
                                                            className="btn btn-primary"
                                                            style={{ width: '100%', height: '44px' }}
                                                            onClick={() => handleSignIncident(incident.id)}
                                                            disabled={loading}
                                                        >
                                                            {t('workerPortal.conduct.signIncident')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--success)', fontStyle: 'italic', fontWeight: 700 }}>
                                                        <i className="fa-solid fa-circle-check" style={{ marginRight: '6px' }}></i>
                                                        {t('workerPortal.conduct.signedAt', { date: new Date(incident.signed_at).toLocaleDateString() })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--bg-card)', borderRadius: '24px', border: '1.5px dashed var(--border)', marginTop: '2rem' }}>
                                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🏆</div>
                                    <h4 style={{ margin: 0, fontWeight: 900, color: 'var(--text-main)', fontSize: '1.5rem' }}>{t('workerPortal.conduct.noIncidents')}</h4>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-sliders"></i>
                                <h2 style={{ fontSize: '2rem', color: 'var(--text-main)' }}>{t('workerPortal.settings.title')}</h2>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                                <div className="info-card" style={{ marginBottom: 0, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="card-header">
                                        <i className="fa-solid fa-palette"></i>
                                        <h3 style={{ color: 'var(--text-main)' }}>{t('workerPortal.settings.appearance')}</h3>
                                    </div>
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{t('workerPortal.settings.theme')}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('themes.light')} / {t('themes.dark')}</div>
                                            </div>
                                            <button
                                                onClick={toggleTheme}
                                                style={{
                                                    padding: '0.6rem 1.25rem',
                                                    borderRadius: '12px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-main)',
                                                    color: 'var(--text-main)',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {currentTheme === 'light' ? <i className="fa-solid fa-sun"></i> : <i className="fa-solid fa-moon"></i>}
                                                {currentTheme === 'light' ? t('themes.light') : t('themes.dark')}
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                            <div>
                                                <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{t('workerPortal.settings.language')}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>English / Español</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-main)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                <button
                                                    onClick={() => setLanguage('en')}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        background: i18n.language === 'en' ? 'var(--primary)' : 'transparent',
                                                        color: i18n.language === 'en' ? 'white' : 'var(--text-main)',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    EN
                                                </button>
                                                <button
                                                    onClick={() => setLanguage('es')}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        background: i18n.language === 'es' ? 'var(--primary)' : 'transparent',
                                                        color: i18n.language === 'es' ? 'white' : 'var(--text-main)',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    ES
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'training' && (
                        <div className="profile-section" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>{t('workerPortal.training.systemName')}</h3>
                                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>{t('workerPortal.training.systemSubtitle')}</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-card)', padding: '0.5rem 1.25rem', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                                    <i className="fa-solid fa-language" style={{ color: 'var(--primary)', fontSize: '1.2rem' }}></i>
                                    <select
                                        value={trainingLanguage}
                                        onChange={(e) => setTrainingLanguage(e.target.value as any)}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', outline: 'none' }}
                                    >
                                        <option value="en">English</option>
                                        <option value="es">Español</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '3rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '48px', height: '48px', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                            <i className="fa-solid fa-layer-group"></i>
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{t('workerPortal.training.level1Title')}</h4>
                                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{t('workerPortal.training.level1Subtitle')}</p>
                                        </div>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', color: 'var(--success)', padding: '0.75rem 1.25rem', borderRadius: '16px', fontWeight: 800, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                                        <i className="fa-solid fa-chart-pie"></i> {t('workerPortal.training.progress')}: {trainingMaterials.filter(m => m.level === 1).length > 0 ? Math.round((completedTrainings.filter(t => trainingMaterials.find(m => m.level === 1 && m.category === t)).length / trainingMaterials.filter(m => m.level === 1).reduce((acc, curr) => acc.add(curr.category), new Set()).size) * 100) : 0}%
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {trainingLanguage === 'es' ? (
                                        /* Spanish: one card per individual PPT file */
                                        trainingMaterials.filter(m => m.level === 1).map((mat, idx) => {
                                            const isCompleted = completedTrainings.includes(mat.display_name);
                                            return (
                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', padding: '1.75rem', borderRadius: '24px', border: '1px solid var(--border)', transition: 'all 0.3s', boxShadow: 'var(--shadow-sm)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                                        <div style={{
                                                            width: '48px', height: '48px',
                                                            background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-main)',
                                                            color: isCompleted ? 'var(--success)' : 'var(--text-muted)',
                                                            borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0, border: isCompleted ? 'none' : '1px solid var(--border)', fontSize: '1.2rem'
                                                        }}>
                                                            {isCompleted ? <i className="fa-solid fa-circle-check"></i> : <i className="fa-solid fa-file-powerpoint"></i>}
                                                        </div>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: 1.4 }}>{mat.display_name}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: 'auto', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('workerPortal.training.materials')}</div>
                                                            <span style={{
                                                                fontSize: '0.7rem', fontWeight: 900,
                                                                color: isCompleted ? 'var(--success)' : 'var(--primary)',
                                                                background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                                                                padding: '0.4rem 1rem', borderRadius: '99px', textTransform: 'uppercase'
                                                            }}>
                                                                {isCompleted ? t('workerPortal.training.completed') : t('workerPortal.training.inProgress')}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPdf(trainingService.getPublicUrl(mat.file_path));
                                                                setCurrentTrainingName(mat.display_name);
                                                            }}
                                                            style={{
                                                                width: '100%', padding: '0.8rem 1rem', borderRadius: '12px',
                                                                border: '1.5px solid var(--border)', background: 'var(--bg-main)',
                                                                color: 'var(--primary)', fontWeight: 800, fontSize: '0.85rem',
                                                                cursor: 'pointer', transition: 'all 0.2s',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem'
                                                            }}
                                                        >
                                                            <i className="fa-solid fa-file-powerpoint"></i>
                                                            {t('workerPortal.training.viewSlides')}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        /* English: group by category, show Part 1 / Part 2 buttons */
                                        Array.from(new Set(trainingMaterials.filter(m => m.level === 1).map(m => m.category))).map((categoryName, idx) => {
                                            const materials = trainingMaterials.filter(m => m.level === 1 && m.category === categoryName);
                                            const isCompleted = completedTrainings.includes(categoryName);
                                            return (
                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', padding: '1.75rem', borderRadius: '24px', border: '1px solid var(--border)', transition: 'all 0.3s', boxShadow: 'var(--shadow-sm)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                                        <div style={{
                                                            width: '48px', height: '48px',
                                                            background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-main)',
                                                            color: isCompleted ? 'var(--success)' : 'var(--text-muted)',
                                                            borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0, border: isCompleted ? 'none' : '1px solid var(--border)', fontSize: '1.2rem'
                                                        }}>
                                                            {isCompleted ? <i className="fa-solid fa-circle-check"></i> : <i className="fa-solid fa-display"></i>}
                                                        </div>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: 1.4 }}>{categoryName}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: 'auto', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('workerPortal.training.materials')}</div>
                                                            <span style={{
                                                                fontSize: '0.7rem', fontWeight: 900,
                                                                color: isCompleted ? 'var(--success)' : 'var(--primary)',
                                                                background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                                                                padding: '0.4rem 1rem', borderRadius: '99px', textTransform: 'uppercase'
                                                            }}>
                                                                {isCompleted ? t('workerPortal.training.completed') : t('workerPortal.training.inProgress')}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                            {materials.map((mat, mIdx) => (
                                                                <button
                                                                    key={mIdx}
                                                                    onClick={() => {
                                                                        setSelectedPdf(trainingService.getPublicUrl(mat.file_path));
                                                                        setCurrentTrainingName(mat.category);
                                                                    }}
                                                                    style={{
                                                                        flex: 1,
                                                                        minWidth: materials.length > 1 ? '140px' : '100%',
                                                                        padding: '0.8rem 1rem', borderRadius: '12px',
                                                                        border: '1.5px solid var(--border)', background: 'var(--bg-main)',
                                                                        color: 'var(--primary)', fontWeight: 800, fontSize: '0.85rem',
                                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem'
                                                                    }}
                                                                >
                                                                    <i className={mat.file_path.endsWith('.pptx') ? 'fa-solid fa-file-powerpoint' : 'fa-solid fa-file-pdf'}></i>
                                                                    {materials.length > 1 ? `${t('workerPortal.training.part')} ${mIdx + 1}` : t('workerPortal.training.viewSlides')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {trainingLanguage !== 'es' && (
                                <div style={{ paddingTop: '2rem', borderTop: '2px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '48px', height: '48px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                <i className="fa-solid fa-rectangle-list"></i>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{t('workerPortal.training.level2Title')}</h4>
                                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{t('workerPortal.training.level2Subtitle')}</p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--bg-main)', padding: '4px', borderRadius: '14px', border: '1px solid var(--border)' }}>
                                                {Array.from(new Set(trainingMaterials.filter(m => m.level === 2).map(m => m.department))).map(dept => dept && (
                                                    <button
                                                        key={dept}
                                                        onClick={() => {
                                                            setTrainingRole(dept as any);
                                                            const rolesForDept = trainingMaterials.filter(m => m.level === 2 && m.department === dept);
                                                            if (rolesForDept.length > 0) {
                                                                setSelectedSOPSection(rolesForDept[0].category);
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '0.6rem 1.25rem',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            background: trainingRole === dept ? 'var(--primary)' : 'transparent',
                                                            color: trainingRole === dept ? 'white' : 'var(--text-muted)',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {dept}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start' }}>
                                        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.75rem', borderRadius: '20px', border: '1px solid var(--border)', flexShrink: 0 }}>
                                            {Array.from(new Set(trainingMaterials.filter(m => m.level === 2 && m.department === trainingRole).map(m => m.category))).map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => setSelectedSOPSection(cat)}
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '1rem 1.25rem',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: selectedSOPSection === cat ? 'var(--bg-card)' : 'transparent',
                                                        color: selectedSOPSection === cat ? 'var(--primary)' : 'var(--text-muted)',
                                                        fontWeight: 800,
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: selectedSOPSection === cat ? '0 4px 6px -1px rgba(0, 0, 0, 0.05)' : 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between'
                                                    }}
                                                >
                                                    {cat}
                                                    {selectedSOPSection === cat && <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.75rem' }}></i>}
                                                </button>
                                            ))}
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            {selectedSOPSection ? (
                                                <div style={{ background: 'var(--bg-card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{trainingRole}</div>
                                                            <h5 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{selectedSOPSection}</h5>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-main)', color: 'var(--primary)', padding: '0.5rem 1.25rem', borderRadius: '12px', fontWeight: 800, fontSize: '0.9rem', border: '1px solid var(--border)' }}>
                                                            {trainingMaterials.filter(m => m.level === 2 && m.department === trainingRole && m.category === selectedSOPSection).length} {t('workerPortal.training.documents')}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                                                        {trainingMaterials
                                                            .filter(m => m.level === 2 && m.department === trainingRole && m.category === selectedSOPSection)
                                                            .map((doc, dIdx) => (
                                                                <button
                                                                    key={dIdx}
                                                                    onClick={() => {
                                                                        setSelectedPdf(trainingService.getPublicUrl(doc.file_path));
                                                                        setCurrentTrainingName(doc.display_name); // For SOPs, we track by doc name maybe? OR category?
                                                                    }}
                                                                    style={{
                                                                        textAlign: 'left',
                                                                        padding: '1.25rem',
                                                                        background: 'var(--bg-main)',
                                                                        border: '1.5px solid var(--border)',
                                                                        borderRadius: '16px',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '1.25rem'
                                                                    }}
                                                                >
                                                                    <div style={{ width: '40px', height: '40px', background: 'white', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '1.2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', flexShrink: 0 }}>
                                                                        <i className="fa-solid fa-file-pdf"></i>
                                                                    </div>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.4 }}>{doc.display_name}</div>
                                                                </button>
                                                            ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--bg-main)', borderRadius: '24px', border: '1.5px dashed var(--border)', color: 'var(--text-muted)' }}>
                                                    <i className="fa-solid fa-arrow-left" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }}></i>
                                                    <p style={{ fontWeight: 700 }}>Select a section from the left to view training materials</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'timeoff' && (
                        <div className="timeoff-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-calendar-day"></i>
                                <h2 style={{ fontSize: '2rem', color: 'var(--text-main)' }}>{t('workerPortal.timeOff.title')}</h2>
                            </div>

                            {/* Balance Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '1rem' }}>
                                <div className="info-card" style={{ marginBottom: 0, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="card-header" style={{ background: 'rgba(3, 105, 161, 0.08)' }}>
                                        <i className="fa-solid fa-umbrella-beach" style={{ color: '#0369a1' }}></i>
                                        <h3 style={{ color: '#0369a1' }}>{t('workerPortal.timeOff.pto')}</h3>
                                    </div>
                                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>{user?.pto_balance || '0.00'}</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0369a1', marginTop: '0.5rem', textTransform: 'uppercase' }}>{t('workerPortal.timeOff.hoursAvailable')}</div>
                                    </div>
                                </div>
                                {!(user?.pay_schedule?.toLowerCase().includes('monthly') && !(user?.pay_schedule?.toLowerCase().includes('semi'))) && (
                                    <div className="info-card" style={{ marginBottom: 0, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                        <div className="card-header" style={{ background: 'rgba(21, 128, 61, 0.08)' }}>
                                            <i className="fa-solid fa-briefcase-medical" style={{ color: '#15803d' }}></i>
                                            <h3 style={{ color: '#15803d' }}>{t('workerPortal.timeOff.sick')}</h3>
                                        </div>
                                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>{user?.sick_balance || '0.00'}</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d', marginTop: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                {t('workerPortal.timeOff.hoursAvailable')}
                                                {(parseFloat(user?.sick_balance || '0')) >= 40 && (
                                                    <span style={{ fontSize: '0.6rem', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca' }}>{t('common.capReached')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                { (user?.pay_schedule?.toLowerCase().includes('monthly') && !(user?.pay_schedule?.toLowerCase().includes('semi'))) && (
                                    <div className="info-card" style={{ marginBottom: 0, opacity: 0.8, background: 'var(--bg-card)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                         <div style={{ padding: '2rem' }}>
                                             <i className="fa-solid fa-hospital" style={{ color: 'var(--text-muted)', fontSize: '1.5rem', marginBottom: '0.5rem' }}></i>
                                             <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>{t('workerPortal.timeOff.sickSubstituted')}</div>
                                             <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.monthlyPolicy')}</div>
                                         </div>
                                    </div>
                                )}
                            </div>

                            {/* My Requests Status */}
                            <div className="info-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                <div className="card-header">
                                    <i className="fa-solid fa-list-check"></i>
                                    <h3 style={{ color: 'var(--text-main)' }}>{t('workerPortal.timeOff.historyTitle')}</h3>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    {myLeaveRequests.length === 0 ? (
                                        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            {t('workerPortal.timeOff.noRequests')}
                                        </div>
                                    ) : (
                                        <table className="info-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.type')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.dates')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.hours')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.status')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.adminNote')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.submitted')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const filteredRequests = myLeaveRequests.filter((req: any) => !((user?.pay_schedule?.toLowerCase().includes('monthly') && !(user?.pay_schedule?.toLowerCase().includes('semi'))) && req.type === 'sick'));
                                                    const perPage = 4;
                                                    const startIndex = (requestHistoryPage - 1) * perPage;
                                                    const paginated = filteredRequests.slice(startIndex, startIndex + perPage);

                                                    return paginated.map((req: any) => {
                                                        const statusColor = req.status === 'approved' ? '#15803d' : req.status === 'rejected' ? '#dc2626' : '#d97706';
                                                        const statusBg = req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7';
                                                        const statusIcon = req.status === 'approved' ? 'fa-circle-check' : req.status === 'rejected' ? 'fa-circle-xmark' : 'fa-clock';
                                                        return (
                                                            <tr key={req.id}>
                                                                <td>
                                                                    <span style={{
                                                                        background: req.type === 'pto' ? '#dbeafe' : '#d1fae5',
                                                                        color: req.type === 'pto' ? '#1d4ed8' : '#065f46',
                                                                        fontWeight: 700,
                                                                        padding: '0.2rem 0.6rem',
                                                                        borderRadius: '6px',
                                                                        fontSize: '0.75rem',
                                                                        textTransform: 'uppercase',
                                                                    }}>
                                                                        {req.type === 'pto' ? t('workerPortal.timeOff.pto') : t('workerPortal.timeOff.sick')}
                                                                    </span>
                                                                </td>
                                                                <td style={{ color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                                    {req.start_date} → {req.end_date}
                                                                </td>
                                                                <td style={{ color: 'var(--text-main)', fontWeight: 700, textAlign: 'center' }}>
                                                                    {req.hours_requested}h
                                                                </td>
                                                                <td>
                                                                    <span style={{
                                                                        background: statusBg,
                                                                        color: statusColor,
                                                                        fontWeight: 800,
                                                                        padding: '0.25rem 0.75rem',
                                                                        borderRadius: '8px',
                                                                        fontSize: '0.78rem',
                                                                        textTransform: 'uppercase',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.35rem',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>
                                                                        <i className={`fa-solid ${statusIcon}`} style={{ fontSize: '0.7rem' }}></i>
                                                                        {t(`leave.filters.${req.status}`)}
                                                                    </span>
                                                                </td>
                                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: '180px' }}>
                                                                    {req.admin_notes || '—'}
                                                                </td>
                                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                                                    {new Date(req.created_at).toLocaleDateString()}
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                {(() => {
                                    const filteredRequests = myLeaveRequests.filter((req: any) => !((user?.pay_schedule?.toLowerCase().includes('monthly') && !(user?.pay_schedule?.toLowerCase().includes('semi'))) && req.type === 'sick'));
                                    const perPage = 4;
                                    const totalPages = Math.ceil(filteredRequests.length / perPage);
                                    if (totalPages <= 1) return null;
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                                            <button 
                                                onClick={() => setRequestHistoryPage(p => Math.max(1, p - 1))}
                                                disabled={requestHistoryPage === 1}
                                                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: requestHistoryPage === 1 ? 'not-allowed' : 'pointer', opacity: requestHistoryPage === 1 ? 0.5 : 1 }}
                                            >
                                                <i className="fa-solid fa-chevron-left"></i>
                                            </button>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{requestHistoryPage} / {totalPages}</span>
                                            <button 
                                                onClick={() => setRequestHistoryPage(p => Math.min(totalPages, p + 1))}
                                                disabled={requestHistoryPage === totalPages}
                                                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: requestHistoryPage === totalPages ? 'not-allowed' : 'pointer', opacity: requestHistoryPage === totalPages ? 0.5 : 1 }}
                                            >
                                                <i className="fa-solid fa-chevron-right"></i>
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="time-off-responsive-grid" style={{ display: 'grid', gap: '2rem' }}>
                                {/* Request Form */}
                                <div className="info-card" style={{ height: 'fit-content', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="card-header">
                                        <i className="fa-solid fa-paper-plane"></i>
                                        <h3 style={{ color: 'var(--text-main)' }}>{t('workerPortal.timeOff.requestTitle')}</h3>
                                    </div>
                                    <form onSubmit={handleLeaveSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div className="info-field">
                                            <label style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.type')}</label>
                                            <select
                                                className="info-input"
                                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                                value={leaveFormData.type}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, type: e.target.value as 'pto' | 'sick' }))}
                                            >
                                                <option value="pto">{t('workerPortal.timeOff.pto')}</option>
                                                {!(user?.pay_schedule?.toLowerCase().includes('monthly') && !(user?.pay_schedule?.toLowerCase().includes('semi'))) && (
                                                    <option value="sick">{t('workerPortal.timeOff.sick')}</option>
                                                )}
                                            </select>
                                        </div>
                                        <div className="responsive-grid-2" style={{ display: 'grid', gap: '1rem' }}>
                                            <div className="info-field">
                                                <label style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.startDate')}</label>
                                                <input
                                                    type="date"
                                                    className="info-input"
                                                    style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                                    value={leaveFormData.start_date}
                                                    onChange={e => setLeaveFormData(prev => ({ ...prev, start_date: e.target.value }))}
                                                />
                                            </div>
                                            <div className="info-field">
                                                <label style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.endDate')}</label>
                                                <input
                                                    type="date"
                                                    className="info-input"
                                                    style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                                    value={leaveFormData.end_date}
                                                    onChange={e => setLeaveFormData(prev => ({ ...prev, end_date: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="info-field">
                                            <label style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.hoursRequested')}</label>
                                            <input
                                                type="number"
                                                className="info-input"
                                                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                                placeholder="e.g. 8"
                                                value={leaveFormData.hours_requested || ''}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, hours_requested: parseFloat(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="info-field">
                                            <label style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.reason')}</label>
                                            <textarea
                                                className="info-input"
                                                style={{ minHeight: '100px', resize: 'vertical', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                                                placeholder={t('workerPortal.timeOff.reasonPlaceholder')}
                                                value={leaveFormData.reason}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, reason: e.target.value }))}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className="clock-btn"
                                            disabled={isSubmittingLeave}
                                            style={{ background: 'var(--primary)', color: 'white', marginTop: '0.5rem' }}
                                        >
                                            {isSubmittingLeave ? t('workerPortal.timeOff.submitting') : t('workerPortal.timeOff.submit')}
                                        </button>
                                    </form>
                                </div>

                                {/* History Ledger */}
                                <div className="info-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <i className="fa-solid fa-clock-rotate-left"></i>
                                            <h3 style={{ color: 'var(--text-main)' }}>{t('workerPortal.timeOff.historyLedgerTitle', 'Detailed History')}</h3>
                                        </div>
                                        {((user?.pay_schedule || '').toLowerCase().includes('semi')) && (
                                            <select 
                                                value={historyTypeFilter}
                                                onChange={(e) => {
                                                    setHistoryTypeFilter(e.target.value as 'all' | 'pto' | 'sick');
                                                    setLedgerPage(1); // Reset to first page on filter change
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-main)',
                                                    color: 'var(--text-main)',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="all">{t('leave.filters.all')}</option>
                                                <option value="pto">{t('workerPortal.timeOff.pto')}</option>
                                                <option value="sick">{t('workerPortal.timeOff.sick')}</option>
                                            </select>
                                        )}
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="info-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.date')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.description')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.used')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.earned')}</th>
                                                    <th style={{ color: 'var(--text-muted)' }}>{t('workerPortal.timeOff.table.balance')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const isMonthly = user?.pay_schedule?.toLowerCase().includes('monthly') && !user?.pay_schedule?.toLowerCase().includes('semi');
                                                    let filteredHistory = leaveHistory.filter(item => !(isMonthly && item.type === 'sick'));
                                                    
                                                    if (historyTypeFilter !== 'all') {
                                                        filteredHistory = filteredHistory.filter(item => item.type === historyTypeFilter);
                                                    }

                                                    const perPage = 10;
                                                    const startIndex = (ledgerPage - 1) * perPage;
                                                    const paginated = filteredHistory.slice(startIndex, startIndex + perPage);

                                                    return filteredHistory.length > 0 ? paginated.map((item) => (
                                                        <tr key={item.id}>
                                                            <td style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>
                                                                {item.entry_date.includes('-') ? (() => { const [y, m, d] = item.entry_date.split('-'); return `${m}/${d}/${y}`; })() : item.entry_date}
                                                            </td>
                                                            <td style={{ color: 'var(--text-main)', fontWeight: 700 }}>{item.description}</td>
                                                            <td style={{ color: 'var(--danger)', fontWeight: 800 }}>{item.used_hours && item.used_hours > 0 ? `-${item.used_hours.toFixed(2)}` : ''}</td>
                                                            <td style={{ color: 'var(--success)', fontWeight: 800 }}>{item.earned_hours && item.earned_hours > 0 ? `+${item.earned_hours.toFixed(2)}` : ''}</td>
                                                            <td style={{ color: 'var(--text-main)', fontWeight: 900 }}>
                                                                {item.balance != null ? Number(item.balance).toFixed(2) : '0.00'}
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                    <tr>
                                                        <td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                            {t('workerPortal.timeOff.noHistory')}
                                                        </td>
                                                    </tr>
                                                    );
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                    {(() => {
                                        const isMonthly = user?.pay_schedule?.toLowerCase().includes('monthly') && !user?.pay_schedule?.toLowerCase().includes('semi');
                                        let filteredHistory = leaveHistory.filter(item => !(isMonthly && item.type === 'sick'));
                                        
                                        if (historyTypeFilter !== 'all') {
                                            filteredHistory = filteredHistory.filter(item => item.type === historyTypeFilter);
                                        }

                                        const perPage = 10;
                                        const totalPages = Math.ceil(filteredHistory.length / perPage);
                                        if (totalPages <= 1) return null;
                                        return (
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                                                <button 
                                                    onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                                                    disabled={ledgerPage === 1}
                                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: ledgerPage === 1 ? 'not-allowed' : 'pointer', opacity: ledgerPage === 1 ? 0.5 : 1 }}
                                                >
                                                    <i className="fa-solid fa-chevron-left"></i>
                                                </button>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{ledgerPage} / {totalPages}</span>
                                                <button 
                                                    onClick={() => setLedgerPage(p => Math.min(totalPages, p + 1))}
                                                    disabled={ledgerPage === totalPages}
                                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: ledgerPage === totalPages ? 'not-allowed' : 'pointer', opacity: ledgerPage === totalPages ? 0.5 : 1 }}
                                                >
                                                    <i className="fa-solid fa-chevron-right"></i>
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {selectedPdf && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '1200px', borderRadius: '32px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', height: '90vh', border: '1px solid var(--border)' }}>
                        <div style={{ background: 'var(--primary)', padding: '1.25rem 2rem', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{t('workerPortal.training.viewer.title')}</h3>
                                <p style={{ margin: '0.25rem 0 0', opacity: 0.7, fontSize: '0.85rem' }}>{t('workerPortal.training.viewer.subtitle')}</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (isTimerActive) {
                                        alert(t('workerPortal.training.viewer.finishReadingFirst', { time: readingTimer }));
                                        return;
                                    }
                                    setSelectedPdf(null);
                                    setCurrentTrainingName(null);
                                }}
                                style={{
                                    background: isTimerActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: isTimerActive ? 'not-allowed' : 'pointer',
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.2rem',
                                    opacity: isTimerActive ? 0.3 : 1
                                }}
                                disabled={isTimerActive}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div style={{ flex: 1, background: 'var(--bg-main)', position: 'relative', overflowY: 'auto', overflowX: 'hidden', maxHeight: '75vh' }}>
                            <div style={{ width: 'calc(100% + 40px)', height: `${unlockedHeight}px`, overflowX: 'hidden', position: 'relative' }}>
                                {selectedPdf && (
                                    <div style={{ position: 'absolute', inset: 0, width: 'calc(100% - 40px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', zIndex: 1 }}>
                                        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--primary)', opacity: 0.5 }}></i>
                                    </div>
                                )}
                                <iframe
                                    src={`${selectedPdf}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                    onLoad={(e) => {
                                        const loader = (e.target as HTMLElement).previousElementSibling as HTMLElement;
                                        if (loader) loader.style.display = 'none';
                                    }}
                                    scrolling="no"
                                    style={{
                                        width: '100%',
                                        height: `${unlockedHeight}px`,
                                        border: 'none',
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                        overflow: 'hidden'
                                    }}
                                    title="Training Slide Viewer"
                                />
                            </div>
                        </div>
                        <div style={{ padding: '1.25rem 2rem', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {!isTimerActive && (
                                <div style={{ display: 'flex', justifyContent: 'flex-start', background: 'var(--bg-main)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', borderLeft: '4px solid var(--accent)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 600 }}>
                                        <input
                                            type="checkbox"
                                            checked={isEndOfPdf}
                                            onChange={(e) => setIsEndOfPdf(e.target.checked)}
                                            style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--success)' }}
                                        />
                                        {t('workerPortal.training.viewer.confirmEnd')}
                                    </label>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                {isTimerActive ? (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <i className="fa-solid fa-clock-rotate-left fa-spin" style={{ color: 'var(--success)' }}></i>
                                        {t('workerPortal.training.viewer.reading', { time: readingTimer })}
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleUnlockNext}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '12px',
                                            border: '1.5px solid var(--success)',
                                            background: 'transparent',
                                            color: 'var(--success)',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <i className="fa-solid fa-arrow-down"></i>
                                        {t('workerPortal.training.viewer.unlockNext')}
                                    </button>
                                )}
                                <button
                                    onClick={async () => {
                                        if (isTimerActive || !isEndOfPdf) return;
                                        if (currentTrainingName && user) {
                                            const newCompleted = completedTrainings.includes(currentTrainingName)
                                                ? completedTrainings
                                                : [...completedTrainings, currentTrainingName];

                                            setCompletedTrainings(newCompleted);

                                            // Persist to Supabase
                                            const { error: saveErr } = await (supabase as any)
                                                .from('users')
                                                .update({ completed_trainings: newCompleted })
                                                .eq('id', user.id);

                                            if (saveErr) {
                                                console.error('Failed to save training completion:', saveErr);
                                                // Revert optimistic update on failure
                                                setCompletedTrainings(completedTrainings);
                                                alert('Could not save training progress. Please try again.');
                                                return;
                                            }

                                            // Update localStorage to keep session in sync
                                            const updatedUser = { ...user, completed_trainings: newCompleted };
                                            localStorage.setItem('bt_user', JSON.stringify(updatedUser));
                                        }
                                        setSelectedPdf(null);
                                        setCurrentTrainingName(null);
                                        setIsEndOfPdf(false);
                                    }}
                                    disabled={isTimerActive || !isEndOfPdf}
                                    style={{
                                        padding: '0.75rem 2rem',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: (isTimerActive || !isEndOfPdf) ? 'var(--border)' : 'var(--success)',
                                        color: (isTimerActive || !isEndOfPdf) ? 'var(--text-muted)' : 'white',
                                        fontWeight: 800,
                                        cursor: (isTimerActive || !isEndOfPdf) ? 'not-allowed' : 'pointer',
                                        boxShadow: (isTimerActive || !isEndOfPdf) ? 'none' : 'var(--shadow-sm)',
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    {isTimerActive ? t('workerPortal.training.viewer.reading', { time: readingTimer }) : t('workerPortal.training.viewer.finished')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Break Notification Overlay */}
            {showBreakOverlay && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'var(--bg-card)', maxWidth: '500px', width: '100%', borderRadius: '24px', padding: '3rem', textAlign: 'center', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
                        <div style={{ width: '80px', height: '80px', background: 'var(--accent-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                            <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '2.5rem', color: 'var(--accent)' }}></i>
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '1rem' }}>{t('workerPortal.break.title')}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2.5rem' }}>
                            {t('workerPortal.break.message')}
                        </p>
                        <button
                            onClick={handleEndBreak}
                            style={{
                                width: '100%',
                                padding: '1.25rem',
                                borderRadius: '16px',
                                background: 'var(--success)',
                                color: 'white',
                                border: 'none',
                                fontSize: '1.2rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: 'var(--shadow-md)'
                            }}
                        >
                            {t('workerPortal.break.return')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkerPortalPage;
