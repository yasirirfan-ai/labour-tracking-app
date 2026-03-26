import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { completeAllTasks, pauseAllActiveTasks } from '../lib/taskService';
import { Navigate } from 'react-router-dom';
import { LEVEL_2_SOPS } from '../data/sopData';
import { LEVEL_1_TRAININGS } from '../data/trainingData';
import type { User } from '../types';

export const WorkerPortalPage: React.FC = () => {
    const { user, loading: authLoading, logout } = useAuth();
    const [localUser, setLocalUser] = useState(user);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeTasks, setActiveTasks] = useState<any[]>([]);
    const [disciplinaryIncidents, setDisciplinaryIncidents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'personal_info' | 'conduct' | 'settings' | 'training' | 'timeoff'>('dashboard');
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
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
    const [trainingRole, setTrainingRole] = useState<'Production' | 'QC' | 'Compounder I' | 'Quality Assurance' | 'Shipping & Recieving' | 'Purchase'>(user?.role === 'manager' ? 'Quality Assurance' : 'Production');
    const [selectedSOPSection, setSelectedSOPSection] = useState<string>(() => {
        const initialRole = user?.role === 'manager' ? 'Quality Assurance' : 'Production';
        return LEVEL_2_SOPS[initialRole] ? LEVEL_2_SOPS[initialRole][0].name : '';
    });
    const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
    const [currentTrainingName, setCurrentTrainingName] = useState<string | null>(null);
    const [completedTrainings, setCompletedTrainings] = useState<string[]>([]);
    const [showBreakOverlay, setShowBreakOverlay] = useState(false);

    const MAX_WORK_SECONDS = 5 * 60 * 60; // 5 hours in seconds

    useEffect(() => {
        if (user) {
            // Initial load from user object (synced via AuthContext/Supabase)
            const initialCompleted = (user as any).completed_trainings || ['GMP and Quality Awareness'];
            setCompletedTrainings(initialCompleted);
            fetchLeaveRequests();
        }
    }, [user?.id]);

    const fetchLeaveRequests = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (data) setLeaveRequests(data);
    };

    const handleLeaveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!leaveFormData.start_date || !leaveFormData.end_date || leaveFormData.hours_requested <= 0) {
            alert('Please fill in all required fields correctly.');
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
            alert('Request submitted successfully!');
            setLeaveFormData({ type: 'pto', start_date: '', end_date: '', hours_requested: 8, reason: '' });
            fetchLeaveRequests();
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


    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());

            // Check for 5-hour work limit
            if (localUser?.status === 'present' && localUser?.availability === 'available' && localUser?.last_status_change) {
                const workStarted = new Date(localUser.last_status_change).getTime();
                const now = new Date().getTime();
                const elapsedSeconds = Math.floor((now - workStarted) / 1000);

                if (elapsedSeconds >= MAX_WORK_SECONDS) {
                    handleTakeBreak(true); // Trigger automatic break
                }
            }
        }, 1000);
        return () => clearInterval(timer);
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

            return () => {
                supabase.removeChannel(userChannel);
                supabase.removeChannel(taskChannel);
                supabase.removeChannel(disciplineChannel);
            };
        }
    }, [user?.id]);


    const fetchUserStatus = async () => {
        if (!user) return;
        const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
        if (data) setLocalUser(data);
    };

    const fetchActiveTasks = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('tasks')
            .select('*')
            .eq('assigned_to_id', user.id)
            .neq('status', 'completed');
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

    if (authLoading) return <div className="loading-screen">Authenticating...</div>;
    if (!user) return <Navigate to="/login" replace />;

    if (pendingPolicies.length > 0) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ background: 'white', width: '100%', maxWidth: '900px', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', height: '95vh', maxHeight: '1000px' }}>
                    <div style={{ background: '#1e1b4b', padding: '1.5rem 2rem', color: 'white' }}>
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
                                background: policySignature ? '#1e1b4b' : '#94a3b8',
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
                    background: white;
                    border-radius: 20px;
                    padding: 2rem;
                    box-shadow: var(--shadow-sm);
                    border: 1px solid #f1f5f9;
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
                    color: #1e1b4b;
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
                    color: #1e1b4b;
                }
                .card-header i {
                    font-size: 1.1rem;
                    color: #1e1b4b;
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
                    color: #64748b;
                    text-transform: capitalize;
                }
                .info-input {
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    border: 2px solid #e2e8f0;
                    font-size: 0.95rem;
                    color: #1e293b;
                    background: #f8fafc;
                    width: 100%;
                    outline: none;
                    transition: all 0.2s;
                }
                .info-input:focus { border-color: #1e1b4b; background: white; }
                .info-input:disabled { background: #f1f5f9; cursor: not-allowed; border-color: #e2e8f0; }
                .info-input.error { border-color: #ef4444; background: #fffcfc; }
                .error-text { color: #ef4444; font-size: 0.75rem; font-weight: 600; margin-top: 4px; }
                
                .section-title-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 1.5rem;
                }
                .section-title-row i { font-size: 1.5rem; color: #1e1b4b; opacity: 0.4; }
                .section-title-row h2 { margin: 0; font-size: 1.75rem; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; }

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
                    border-bottom-color: #f59e0b;
                    background: rgba(245, 158, 11, 0.03);
                }
                .small-action-btn {
                    background: white;
                    border: 1px solid #1e1b4b;
                    color: #1e1b4b;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .small-action-btn:hover { background: #1e1b4b; color: white; }

                .custom-eeo-dropdown { position: relative; width: 100%; }
                .eeo-select-trigger {
                    display: flex;
                    align-items: center;
                    padding: 0 1rem;
                    height: 48px;
                    background: #f8fafc;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.95rem;
                    color: #1e293b;
                    justify-content: space-between;
                }
                .eeo-select-trigger.active { border-color: #1e1b4b; background: white; }
                .eeo-dropdown-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    width: 100%;
                    background: white;
                    border-radius: 12px;
                    box-shadow: var(--shadow-xl);
                    border: 1px solid #e2e8f0;
                    z-index: 1000;
                    overflow: hidden;
                }
                .eeo-search-box {
                    padding: 12px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .eeo-search-box input { border: none; outline: none; width: 100%; font-size: 0.9rem; }
                .eeo-options-list { max-height: 250px; overflow-y: auto; padding: 8px 0; }
                .eeo-option { padding: 10px 16px; font-size: 0.9rem; cursor: pointer; }
                .eeo-option:hover { background: #f8fafc; }
                .eeo-option.selected { background: #e0e7ff; color: #1e1b4b; font-weight: 700; }
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
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                            {notification.severity === 'success' ? 'Success' : 'Attention Required'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: '1.4' }}>{notification.message}</div>
                    </div>
                    <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.5rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            )}

            <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="brand">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem' }}>
                        <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}>
                            <span style={{ color: 'white', fontWeight: 900 }}>B</span>
                        </div>
                        {!isCollapsed && <span style={{ letterSpacing: '-0.03em', fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>Babylon</span>}
                    </div>
                    <button className="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)}>
                        <i className={`fa-solid ${isCollapsed ? 'fa-bars-staggered' : 'fa-chevron-left'}`}></i>
                    </button>
                </div>

                <ul className="nav-menu">
                    <li>
                        <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                            <i className="fa-solid fa-house"></i> {!isCollapsed && <span>Dashboard</span>}
                        </div>
                    </li>
                    <li>
                        <div className={`nav-item ${activeTab === 'personal_info' ? 'active' : ''}`} onClick={() => setActiveTab('personal_info')}>
                            <i className="fa-solid fa-user"></i> {!isCollapsed && <span>Personal Info</span>}
                        </div>
                    </li>
                    <li>
                        <div className={`nav-item ${activeTab === 'conduct' ? 'active' : ''}`} onClick={() => setActiveTab('conduct')}>
                            <i className="fa-solid fa-shield-halved"></i> {!isCollapsed && <span>Conduct Record</span>}
                        </div>
                    </li>
                    <li>
                        <div className={`nav-item ${activeTab === 'training' ? 'active' : ''}`} onClick={() => setActiveTab('training')}>
                            <i className="fa-solid fa-graduation-cap"></i> {!isCollapsed && <span>Training</span>}
                        </div>
                    </li>
                    <li>
                        <div className={`nav-item ${activeTab === 'timeoff' ? 'active' : ''}`} onClick={() => setActiveTab('timeoff')}>
                            <i className="fa-solid fa-calendar-alt"></i> {!isCollapsed && <span>Time Off</span>}
                        </div>
                    </li>
                    <li>
                        <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                            <i className="fa-solid fa-gear"></i> {!isCollapsed && <span>Settings</span>}
                        </div>
                    </li>
                </ul>

                <div className="bottom-menu">
                    <ul className="nav-menu">
                        <li>
                            <div className="nav-item" onClick={logout} style={{ color: '#ef4444' }}>
                                <i className="fa-solid fa-right-from-bracket"></i> {!isCollapsed && <span>Logout</span>}
                            </div>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className={`worker-main-wrapper ${isCollapsed ? 'expanded' : ''}`}>
                <header className="worker-topbar" style={{
                    height: '80px',
                    background: 'white',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 3.5rem',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100
                }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Member Portal</div>
                        <h2 style={{ margin: 0, fontWeight: 900, color: '#1e1b4b', fontSize: '1.75rem' }}>
                            {activeTab === 'dashboard' ? 'Overview' : activeTab === 'personal_info' ? 'Update Details' : activeTab === 'conduct' ? 'Compliance' : activeTab === 'settings' ? 'Preferences' : activeTab === 'training' ? 'Training Progress' : 'Guides'}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{user?.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>ID: {user?.worker_id}</div>
                            </div>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                background: '#1e1b4b',
                                color: '#f59e0b',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1.2rem'
                            }}>{user.name?.[0]}</div>
                        </div>
                        <button onClick={logout} title="Logout" style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', background: '#F1F5F9', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
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
                                {nfcStatus === 'listening' ? "NFC Active: Tap card to clock in/out" :
                                    nfcStatus === 'reading' ? "Reading Tag..." :
                                        nfcStatus === 'error' ? "NFC Error: Web NFC Not Supported. Use Simulator Below." : "NFC Offline"}
                            </div>

                            <div style={{ width: '100%', display: 'flex', gap: '1rem' }} onClick={e => e.stopPropagation()}>
                                <input
                                    type="text"
                                    placeholder="Simulate NFC Scan (Enter Tag ID)"
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #ccc' }}
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
                                    style={{ padding: '0.75rem 1.5rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    Scan
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'dashboard' && nfcStatus === 'idle' && (
                        <div className="nfc-status-bar" onClick={startNfcListening} style={{ cursor: 'pointer', background: '#FEF3C7', borderColor: '#FDE68A', color: '#92400E' }}>
                            <i className="fa-solid fa-hand-pointer" style={{ marginRight: '10px' }}></i>
                            NFC Pending: Tap here to enable scanner
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div className="worker-dashboard-grid" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                <div className={`on-duty-banner ${!isClockedIn ? 'off-duty-banner' : ''}`}>
                                    <div className="banner-content">
                                        <div className="banner-status">
                                            <div style={{ width: '12px', height: '12px', background: isClockedIn ? '#34d399' : '#94a3b8', borderRadius: '50%', boxShadow: isClockedIn ? '0 0 15px #34d399' : 'none' }}></div>
                                            {isClockedIn ? 'Operational Status: On Duty' : 'Current Status: Off Duty'}
                                        </div>
                                        <h1 className="banner-title">{isClockedIn ? 'Worker Logged In' : 'Shift Not Started'}</h1>
                                        <div className="banner-time">
                                            <i className="fa-regular fa-clock" style={{ marginRight: '10px' }}></i>
                                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                        </div>
                                    </div>
                                    <div className="banner-actions">
                                        {!isClockedIn ? (
                                            <button className="clock-btn-premium btn-in" onClick={handleClockIn} disabled={loading}>
                                                <i className="fa-solid fa-play"></i> {loading ? 'Clocking in...' : 'Clock In Now'}
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                {localUser?.availability === 'available' ? (
                                                    <button className="clock-btn-premium" style={{ color: '#f59e0b' }} onClick={() => handleTakeBreak(false)} disabled={loading}>
                                                        <i className="fa-solid fa-mug-hot"></i> {loading ? 'Starting...' : 'Take Break'}
                                                    </button>
                                                ) : (
                                                    <button className="clock-btn-premium" style={{ color: '#10b981' }} onClick={handleEndBreak} disabled={loading}>
                                                        <i className="fa-solid fa-play"></i> {loading ? 'Ending...' : 'End Break'}
                                                    </button>
                                                )}
                                                <button className="clock-btn-premium btn-out" onClick={handleClockOut} disabled={loading}>
                                                    <i className="fa-solid fa-stop"></i> {loading ? 'Clocking out...' : 'Clock Out Now'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="status-card" style={{ display: 'flex', flexDirection: 'column', width: '100%', margin: 0 }}>
                                    <div className="status-label">Active Assignments</div>
                                    {activeTasks.length > 0 ? (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                            {activeTasks.map(task => (
                                                <li key={task.id} style={{ padding: '1.5rem', border: '1px solid #E2E8F0', borderRadius: '20px', background: '#F8FAFC', transition: 'transform 0.2s' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e1b4b' }}>{task.description}</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.5rem', fontWeight: 600 }}>Ref: {task.mo_reference}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: '#94A3B8', fontStyle: 'italic', background: '#f8fafc', borderRadius: '20px', border: '1.5px dashed #e2e8f0' }}>Waiting for assignments...</div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                <div className="status-card" style={{ margin: 0 }}>
                                    <div className="status-label">Today's Summary</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div style={{ padding: '1.5rem', background: '#F0F9FF', borderRadius: '20px', border: '1px solid #BAE6FD' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#0369A1', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Hours</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0C4A6E' }}>8.5</div>
                                        </div>
                                        <div style={{ padding: '1.5rem', background: '#F0FDF4', borderRadius: '20px', border: '1px solid #BBF7D0' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Efficiency</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#064E3B' }}>94%</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="status-card" style={{ margin: 0, flex: 1 }}>
                                    <div className="status-label">Notifications & Alerts</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ padding: '1.25rem', background: '#FFF7ED', borderRadius: '16px', border: '1px solid #FFEDD5', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ width: '40px', height: '40px', background: '#FFEDD5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-bullhorn" style={{ color: '#C2410C' }}></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#7C2D12' }}>New Policy Added</div>
                                                <div style={{ fontSize: '0.75rem', color: '#9A3412', fontWeight: 600 }}>Update SOP 3.7</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: '#EEF2FF', borderRadius: '16px', border: '1px solid #E0E7FF', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ width: '40px', height: '40px', background: '#E0E7FF', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-calendar-check" style={{ color: '#4338CA' }}></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312E81' }}>Monthly Review</div>
                                                <div style={{ fontSize: '0.75rem', color: '#3730A3', fontWeight: 600 }}>Scheduled for Friday</div>
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
                                    <h2 style={{ fontSize: '2rem' }}>Personal Details</h2>
                                </div>
                                <button className="edit-btn" onClick={() => {
                                    if (editMode) {
                                        // Reset fields on cancel
                                        setFormData(user as any);
                                        setValidationErrors({});
                                    }
                                    setEditMode(!editMode);
                                }} style={{ padding: '0.9rem 1.75rem', borderRadius: '14px', border: 'none', background: editMode ? '#fee2e2' : '#f1f5f9', color: editMode ? '#ef4444' : '#1e1b4b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {editMode ? 'Cancel Edit' : 'Edit Profile'}
                                </button>
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
                                        <input type="text" className={`info-input ${validationErrors.worker_id ? 'error' : ''}`} value={formData.worker_id || ''} disabled />
                                    </div>
                                    <div className="info-field">
                                        <label>Status</label>
                                        <select className="info-input" value={formData.active === false ? "false" : "true"} disabled>
                                            <option value="true">Active</option>
                                            <option value="false">Archived</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>First Name</label>
                                        <input type="text" className={`info-input ${validationErrors.first_name ? 'error' : ''}`} value={formData.first_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))} disabled={!editMode} />
                                        {validationErrors.first_name && <span className="error-text">{validationErrors.first_name}</span>}
                                    </div>
                                    <div className="info-field">
                                        <label>Middle Name</label>
                                        <input type="text" className="info-input" value={formData.middle_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, middle_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Last Name</label>
                                        <input type="text" className="info-input" value={formData.last_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Preferred Name</label>
                                        <input type="text" className="info-input" value={formData.preferred_name || ''} onChange={(e) => setFormData(prev => ({ ...prev, preferred_name: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Birth Date</label>
                                        <input type="date" className="info-input" value={formData.birth_date || ''} onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Gender</label>
                                        <select className="info-input" value={formData.gender || ""} onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))} disabled={!editMode}>
                                            <option value="">-Select-</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>Marital Status</label>
                                        <select className="info-input" value={formData.marital_status || ""} onChange={(e) => setFormData(prev => ({ ...prev, marital_status: e.target.value }))} disabled={!editMode}>
                                            <option value="">-Select-</option>
                                            <option value="Single">Single</option>
                                            <option value="Married">Married</option>
                                        </select>
                                    </div>
                                    <div className="info-field">
                                        <label>Shirt Size</label>
                                        <select className="info-input" value={formData.shirt_size || ""} onChange={(e) => setFormData(prev => ({ ...prev, shirt_size: e.target.value }))} disabled={!editMode}>
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
                                    <h3>Address</h3>
                                </div>
                                <div className="card-grid">
                                    <div className="info-field full-width">
                                        <label>Street 1</label>
                                        <input type="text" className="info-input" value={formData.address_street1 || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_street1: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Street 2</label>
                                        <input type="text" className="info-input" value={formData.address_street2 || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_street2: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>City</label>
                                        <input type="text" className="info-input" value={formData.address_city || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_city: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>State</label>
                                        <input type="text" className="info-input" value={formData.address_state || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_state: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>ZIP</label>
                                        <input type="text" className="info-input" value={formData.address_zip || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_zip: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Country</label>
                                        <input type="text" className="info-input" value={formData.address_country || ''} onChange={(e) => setFormData(prev => ({ ...prev, address_country: e.target.value }))} disabled={!editMode} />
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
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-phone" style={{color: "#94a3b8"}}></i><input type="text" className={`info-input ${validationErrors.work_phone ? 'error' : ''}`} style={{flex: 1}} value={formData.work_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field">
                                        <label>Ext</label>
                                        <input type="text" className="info-input" value={formData.work_phone_ext || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_phone_ext: e.target.value }))} disabled={!editMode} />
                                    </div>
                                    <div className="info-field">
                                        <label>Mobile Phone</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-mobile-screen" style={{color: "#94a3b8"}}></i><input type="text" className={`info-input ${validationErrors.mobile_phone ? 'error' : ''}`} style={{flex: 1}} value={formData.mobile_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, mobile_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field">
                                        <label>Home Phone</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-phone" style={{color: "#94a3b8"}}></i><input type="text" className={`info-input ${validationErrors.home_phone ? 'error' : ''}`} style={{flex: 1}} value={formData.home_phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, home_phone: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Work Email</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-envelope" style={{color: "#94a3b8"}}></i><input type="email" className="info-input" style={{flex: 1}} value={formData.work_email || ''} onChange={(e) => setFormData(prev => ({ ...prev, work_email: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Home Email</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-envelope" style={{color: "#94a3b8"}}></i><input type="email" className="info-input" style={{flex: 1}} value={formData.home_email || ''} onChange={(e) => setFormData(prev => ({ ...prev, home_email: e.target.value }))} disabled={!editMode} /></div>
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
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-linkedin" style={{color: "#94a3b8"}}></i><input type="text" className="info-input" style={{flex: 1}} value={formData.linkedin_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Twitter Username</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-twitter" style={{color: "#94a3b8"}}></i><input type="text" className="info-input" style={{flex: 1}} value={formData.twitter_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, twitter_url: e.target.value }))} disabled={!editMode} /></div>
                                    </div>
                                    <div className="info-field full-width">
                                        <label>Facebook</label>
                                        <div style={{display: "flex", gap: "10px", alignItems: "center"}}><i className="fa-solid fa-facebook" style={{color: "#94a3b8"}}></i><input type="text" className="info-input" style={{flex: 1}} value={formData.facebook_url || ''} onChange={(e) => setFormData(prev => ({ ...prev, facebook_url: e.target.value }))} disabled={!editMode} /></div>
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
                                    <button className="text-link" style={{ color: '#1e1b4b', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }} disabled={!editMode}><i className="fa-solid fa-plus-circle"></i> Add Education</button>
                                </div>
                            </div>


                            {editMode && (
                                <div style={{ position: 'sticky', bottom: '2rem', display: 'flex', justifyContent: 'center', zIndex: 100 }}>
                                    <button className="clock-btn" style={{ background: '#10b981', color: 'white', width: 'auto', padding: '1rem 3rem', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }} onClick={handleSaveProfile} disabled={loading}>
                                        {loading ? 'Saving Changes...' : 'Save Updated Details'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'conduct' && (
                        <div className="conduct-section" style={{ width: '100%' }}>
                            <div style={{ marginBottom: '4rem' }}>
                                <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.03em' }}>Conduct Record</h3>
                                <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>Review your compliance status and official acknowledgments</p>
                            </div>
                            <div style={{ backgroundColor: '#f8fafc', padding: '2rem', borderRadius: '24px', marginBottom: '4rem', border: '1px solid #e2e8f0' }}>
                                <div className="status-label" style={{ marginBottom: '1.5rem' }}>Active Policies</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.1rem' }}>Employee Disciplinary Standards (SOP 3.7)</div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.4rem', fontWeight: 700 }}>v1.0 • Effective March 2024</div>
                                    </div>
                                    <div className="pilled-badge" style={{ backgroundColor: '#dcfce7', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                        <i className="fa-solid fa-circle-check"></i> SIGNED
                                    </div>
                                </div>
                            </div>
                            <div className="status-label" style={{ marginBottom: '2rem' }}>History of Incidents</div>
                            {disciplinaryIncidents.length > 0 ? (
                                <div style={{
                                    background: '#ebedf0',
                                    padding: '2rem',
                                    borderRadius: '20px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '1.25rem',
                                    minHeight: '400px'
                                }}>
                                    {disciplinaryIncidents.map(incident => (
                                        <div key={incident.id} style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            padding: '1rem 1.25rem',
                                            borderRadius: '8px',
                                            background: '#ffffff',
                                            boxShadow: '0 1px 0 rgba(9, 30, 66, .25)',
                                            border: 'none',
                                            height: 'fit-content',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                                                <div style={{
                                                    height: '8px',
                                                    width: '40px',
                                                    borderRadius: '4px',
                                                    background: incident.severity === 'gross_misconduct' ? '#ef4444' : incident.severity === 'major' ? '#f59e0b' : '#fbbf24'
                                                }}></div>
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    color: incident.severity === 'gross_misconduct' ? '#991b1b' : '#92400e',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.02em'
                                                }}>
                                                    {incident.severity.replace('_', ' ')}
                                                </div>
                                            </div>

                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600, color: '#172b4d' }}>
                                                {incident.category.toUpperCase().replace('_', ' ')}
                                            </h4>

                                            <div style={{ fontSize: '0.75rem', color: '#5e6c84', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="fa-solid fa-file-lines" style={{ fontSize: '0.7rem' }}></i>
                                                {incident.documentation || 'No Reference'}
                                            </div>

                                            <p style={{ margin: '0 0 16px 0', color: '#172b4d', lineHeight: '1.5', fontSize: '0.9rem' }}>
                                                {incident.description}
                                            </p>

                                            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #ebedf0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div title="Date Occurred" style={{ fontSize: '0.75rem', color: '#5e6c84', background: '#f4f5f7', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>
                                                            <i className="fa-regular fa-calendar" style={{ marginRight: '4px' }}></i>
                                                            {new Date(incident.incident_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                        </div>
                                                        {incident.signed_at && (
                                                            <div title="Signed & Verified" style={{ fontSize: '0.75rem', color: '#ffffff', background: '#61bd4f', padding: '2px 6px', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fa-solid fa-check-double"></i>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#dfe1e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#172b4d' }}>
                                                        {user.name?.[0]}
                                                    </div>
                                                </div>

                                                {!incident.signed_at ? (
                                                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff7ed', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                                                        <div style={{ fontWeight: 900, color: '#9a3412', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Awaiting Signature</div>
                                                        <input
                                                            type="text"
                                                            placeholder="Type Name to Sign"
                                                            style={{ background: 'white', border: '1px solid #fed7aa', padding: '0.5rem', fontSize: '0.85rem', width: '100%', borderRadius: '4px', marginBottom: '0.5rem' }}
                                                            value={signingData[incident.id]?.signature || ''}
                                                            onChange={e => updateSigningLocal(incident.id, 'signature', e.target.value)}
                                                        />
                                                        <button
                                                            className="clock-btn"
                                                            style={{ background: '#0079bf', color: 'white', padding: '0.5rem', fontSize: '0.85rem', height: 'auto', borderRadius: '4px' }}
                                                            onClick={() => handleSignIncident(incident.id)}
                                                            disabled={loading}
                                                        >
                                                            Sign Now
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#5e6c84', fontStyle: 'italic' }}>
                                                        "Resolved & Acknowledged"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '24px', border: '1px dashed #CBD5E1' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🏆</div>
                                    <h4 style={{ margin: 0, fontWeight: 900, color: '#262661' }}>Exemplary Employee</h4>
                                    <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Your record is perfectly clear. Keep it up!</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="profile-section" style={{ width: '100%' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#262661' }}>Application Settings</h3>
                            <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Manage your portal preferences and notification alerts</p>
                            <div style={{ marginTop: '2.5rem' }}>
                                <div style={{ padding: '1.5rem', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#262661' }}>Real-time Notifications</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Receive alerts on misconduct incidents immediately</div>
                                    </div>
                                    <div style={{ width: '40px', height: '24px', background: '#10B981', borderRadius: '99px' }}></div>
                                </div>
                            </div>
                        </div>
                    )}



                    {activeTab === 'training' && (
                        <div className="profile-section" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.03em' }}>Babylon Training System</h3>
                                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>Complete your mandatory structural training</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '3rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '40px', height: '40px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                            <i className="fa-solid fa-layer-group"></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e1b4b' }}>Level 1: Core Orientation</h4>
                                    </div>
                                    <div style={{ background: '#f0fdf4', color: '#15803d', padding: '0.5rem 1rem', borderRadius: '12px', fontWeight: 800, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                                        <i className="fa-solid fa-chart-pie"></i> Progress: {Math.round((completedTrainings.filter(t => LEVEL_1_TRAININGS.find(l1 => l1.name === t)).length / LEVEL_1_TRAININGS.length) * 100)}%
                                    </div>
                                </div>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontWeight: 600, fontSize: '0.95rem' }}>Required for ALL employees (Slides + Quiz + Sign Off)</p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {LEVEL_1_TRAININGS.map((training, idx) => (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
                                                <div style={{ width: '40px', height: '40px', background: idx === 0 ? '#dcfce7' : '#f8fafc', color: idx === 0 ? '#10b981' : '#94a3b8', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                                                    {idx === 0 ? <i className="fa-solid fa-check"></i> : <i className="fa-solid fa-display"></i>}
                                                </div>
                                                <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.05rem', lineHeight: 1.4 }}>{training.name}</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Formal Slides</div>
                                                    {completedTrainings.includes(training.name) ? (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', background: '#dcfce7', padding: '0.35rem 0.85rem', borderRadius: '99px' }}>COMPLETED</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '0.35rem 0.85rem', borderRadius: '99px' }}>IN PROGRESS</span>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {training.pdfs.map((pdf, pIdx) => (
                                                        <button
                                                            key={pIdx}
                                                            onClick={() => {
                                                                setSelectedPdf(pdf.path);
                                                                setCurrentTrainingName(training.name);
                                                            }}
                                                            style={{
                                                                flex: 1,
                                                                minWidth: training.pdfs.length > 1 ? '140px' : '100%',
                                                                padding: '0.65rem',
                                                                borderRadius: '10px',
                                                                border: '1.5px solid #e2e8f0',
                                                                background: 'white',
                                                                color: '#4f46e5',
                                                                fontWeight: 700,
                                                                fontSize: '0.8rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '0.5rem'
                                                            }}
                                                            onMouseOver={e => {
                                                                e.currentTarget.style.backgroundColor = '#eef2ff';
                                                                e.currentTarget.style.borderColor = '#4f46e5';
                                                            }}
                                                            onMouseOut={e => {
                                                                e.currentTarget.style.backgroundColor = 'white';
                                                                e.currentTarget.style.borderColor = '#e2e8f0';
                                                            }}
                                                        >
                                                            <i className="fa-solid fa-file-pdf"></i>
                                                            {training.pdfs.length > 1 ? `Part ${pIdx + 1}` : 'View Slides'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '40px', height: '40px', background: '#ffedd5', color: '#ea580c', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                            <i className="fa-solid fa-book-open-reader"></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e1b4b' }}>Level 2: Role-Based SOP Material</h4>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {LEVEL_2_SOPS[trainingRole] && LEVEL_2_SOPS[trainingRole].length > 0 && typeof trainingRole === 'string' && (() => {
                                            const roleSops = LEVEL_2_SOPS[trainingRole] || [];
                                            const totalRoleSops = roleSops.reduce((acc: any, section: any) => acc + section.pdfs.length, 0);
                                            const completedRoleSops = completedTrainings.filter(t => roleSops.some((section: any) => section.pdfs.some((pdf: any) => pdf.name === t))).length;
                                            const progress = totalRoleSops > 0 ? Math.round((completedRoleSops / totalRoleSops) * 100) : 0;
                                            return (
                                                <div style={{ background: progress === 100 ? '#f0fdf4' : '#fff7ed', color: progress === 100 ? '#15803d' : '#ea580c', padding: '0.5rem 1rem', borderRadius: '12px', fontWeight: 800, border: `1px solid ${progress === 100 ? '#bbf7d0' : '#ffedd5'}`, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                                                    <i className="fa-solid fa-chart-pie"></i> Progress: {progress}%
                                                </div>
                                            );
                                        })()}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>VIEWING ROLE:</span>
                                                <select
                                                    value={trainingRole}
                                                    onChange={e => {
                                                        const newRole = e.target.value as any;
                                                        setTrainingRole(newRole);
                                                        if (LEVEL_2_SOPS[newRole]) {
                                                            setSelectedSOPSection(LEVEL_2_SOPS[newRole][0].name);
                                                        } else {
                                                            setSelectedSOPSection('');
                                                        }
                                                    }}
                                                    style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', fontWeight: 700, color: '#1e1b4b', cursor: 'pointer', outline: 'none' }}
                                                >
                                                    <option value="Production">Production</option>
                                                    <option value="Compounder I">Compounder I</option>
                                                    <option value="QC">Quality Control (QC)</option>
                                                    <option value="Quality Assurance">Quality Assurance</option>
                                                    <option value="Shipping & Recieving">Shipping & Recieving</option>
                                                    <option value="Purchase">Purchase</option>
                                                </select>
                                            </div>
                                            {LEVEL_2_SOPS[trainingRole] && LEVEL_2_SOPS[trainingRole].length > 1 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>SECTION:</span>
                                                    <select
                                                        value={selectedSOPSection}
                                                        onChange={e => setSelectedSOPSection(e.target.value)}
                                                        style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', fontWeight: 700, color: '#1e1b4b', cursor: 'pointer', outline: 'none' }}
                                                    >
                                                        {LEVEL_2_SOPS[trainingRole].map((section: any, idx: number) => (
                                                            <option key={idx} value={section.name}>{section.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontWeight: 600, fontSize: '0.95rem' }}>Controlled SOP reading and acknowledgment (No Slides)</p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                    {(LEVEL_2_SOPS[trainingRole] || [])
                                        .filter((section: any) => section.name === selectedSOPSection)
                                        .map((section: any, sIdx: number) => (
                                            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                                    {section.pdfs.map((pdf: any, pIdx: number) => {
                                                        const isCompleted = completedTrainings.includes(pdf.name);
                                                        return (
                                                            <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }} onMouseOver={e => (e.currentTarget.style.borderColor = '#cbd5e1')} onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                                                    <i className="fa-regular fa-file-lines" style={{ color: '#ea580c', fontSize: '1.25rem', marginTop: '0.2rem' }}></i>
                                                                    <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.05rem', lineHeight: 1.4 }}>{pdf.name}</div>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Status:</span>
                                                                    <span style={{
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 800,
                                                                        color: isCompleted ? '#15803d' : '#ea580c',
                                                                        background: isCompleted ? '#dcfce7' : 'transparent',
                                                                        padding: isCompleted ? '0.2rem 0.6rem' : '0',
                                                                        borderRadius: '99px'
                                                                    }}>
                                                                        {isCompleted ? 'Completed' : 'Pending Read'}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedPdf(pdf.path);
                                                                        setCurrentTrainingName(pdf.name);
                                                                    }}
                                                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1.5px solid #cbd5e1', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                                                    onMouseOver={e => { e.currentTarget.style.backgroundColor = '#ea580c'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#ea580c'; }}
                                                                    onMouseOut={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                                                >
                                                                    {isCompleted ? 'Read Again' : 'Read'}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    {(!LEVEL_2_SOPS[trainingRole] || LEVEL_2_SOPS[trainingRole].length === 0) && (
                                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                                            <i className="fa-solid fa-folder-open" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '1rem', display: 'block' }}></i>
                                            <p style={{ color: '#64748b', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>No specific SOP materials found for this role.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'timeoff' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
                            <div className="section-title-row">
                                <i className="fa-solid fa-calendar-day"></i>
                                <h2 style={{ fontSize: '2rem' }}>Time Off & Leave</h2>
                            </div>

                            {/* Balance Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '1rem' }}>
                                <div className="info-card" style={{ marginBottom: 0 }}>
                                    <div className="card-header" style={{ background: '#f0f9ff' }}>
                                        <i className="fa-solid fa-umbrella-beach" style={{ color: '#0369a1' }}></i>
                                        <h3 style={{ color: '#0369a1' }}>PTO Balance</h3>
                                    </div>
                                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#0c4a6e', lineHeight: 1 }}>{user?.pto_balance || '0.00'}</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0369a1', marginTop: '0.5rem', textTransform: 'uppercase' }}>Hours Available</div>
                                    </div>
                                </div>
                                <div className="info-card" style={{ marginBottom: 0 }}>
                                    <div className="card-header" style={{ background: '#f0fdf4' }}>
                                        <i className="fa-solid fa-briefcase-medical" style={{ color: '#15803d' }}></i>
                                        <h3 style={{ color: '#15803d' }}>Sick Leave</h3>
                                    </div>
                                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#064e3b', lineHeight: 1 }}>{user?.sick_balance || '0.00'}</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d', marginTop: '0.5rem', textTransform: 'uppercase' }}>Hours Available</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)', gap: '2rem' }}>
                                {/* Request Form */}
                                <div className="info-card" style={{ height: 'fit-content' }}>
                                    <div className="card-header">
                                        <i className="fa-solid fa-paper-plane"></i>
                                        <h3>Request Time Off</h3>
                                    </div>
                                    <form onSubmit={handleLeaveSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div className="info-field">
                                            <label>Leave Type</label>
                                            <select 
                                                className="info-input"
                                                value={leaveFormData.type}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, type: e.target.value as 'pto' | 'sick' }))}
                                            >
                                                <option value="pto">Paid Time Off (PTO)</option>
                                                <option value="sick">Sick Leave</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div className="info-field">
                                                <label>Start Date</label>
                                                <input 
                                                    type="date" 
                                                    className="info-input"
                                                    value={leaveFormData.start_date}
                                                    onChange={e => setLeaveFormData(prev => ({ ...prev, start_date: e.target.value }))}
                                                />
                                            </div>
                                            <div className="info-field">
                                                <label>End Date</label>
                                                <input 
                                                    type="date" 
                                                    className="info-input"
                                                    value={leaveFormData.end_date}
                                                    onChange={e => setLeaveFormData(prev => ({ ...prev, end_date: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="info-field">
                                            <label>Total Hours Requested</label>
                                            <input 
                                                type="number" 
                                                className="info-input"
                                                placeholder="e.g. 8"
                                                value={leaveFormData.hours_requested || ''}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, hours_requested: parseFloat(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="info-field">
                                            <label>Reason / Notes</label>
                                            <textarea 
                                                className="info-input"
                                                style={{ minHeight: '100px', resize: 'vertical' }}
                                                placeholder="Briefly explain your request..."
                                                value={leaveFormData.reason}
                                                onChange={e => setLeaveFormData(prev => ({ ...prev, reason: e.target.value }))}
                                            />
                                        </div>
                                        <button 
                                            type="submit" 
                                            className="clock-btn" 
                                            disabled={isSubmittingLeave}
                                            style={{ background: '#1e1b4b', color: 'white', marginTop: '0.5rem' }}
                                        >
                                            {isSubmittingLeave ? 'Submitting...' : 'Submit Request'}
                                        </button>
                                    </form>
                                </div>

                                {/* History */}
                                <div className="info-card">
                                    <div className="card-header">
                                        <i className="fa-solid fa-history"></i>
                                        <h3>Request History</h3>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="info-table">
                                            <thead>
                                                <tr>
                                                    <th>Type</th>
                                                    <th>Dates</th>
                                                    <th>Hours</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaveRequests.length > 0 ? leaveRequests.map(req => (
                                                    <tr key={req.id}>
                                                        <td style={{ fontWeight: 800, color: '#1e1b4b' }}>
                                                            {req.type === 'pto' ? 'PTO' : 'Sick'}
                                                        </td>
                                                        <td>
                                                            <div style={{ fontSize: '0.85rem' }}>{new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}</div>
                                                        </td>
                                                        <td style={{ fontWeight: 700 }}>{req.hours_requested} hrs</td>
                                                        <td>
                                                            <span style={{ 
                                                                padding: '4px 8px', 
                                                                borderRadius: '6px', 
                                                                fontSize: '0.75rem', 
                                                                fontWeight: 800,
                                                                textTransform: 'uppercase',
                                                                background: req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                                                color: req.status === 'approved' ? '#15803d' : req.status === 'rejected' ? '#991b1b' : '#92400e'
                                                            }}>
                                                                {req.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr>
                                                        <td colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                            No leave requests found.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* PDF Viewer Modal */}
            {selectedPdf && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'white', width: '100%', maxWidth: '1200px', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', height: '90vh' }}>
                        <div style={{ background: '#1e1b4b', padding: '1.25rem 2rem', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Training Material Viewer</h3>
                                <p style={{ margin: '0.25rem 0 0', opacity: 0.7, fontSize: '0.85rem' }}>Review the following slides carefully before proceeding.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedPdf(null);
                                    setCurrentTrainingName(null);
                                }}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div style={{ flex: 1, background: '#f1f5f9', position: 'relative' }}>
                            <iframe
                                src={`${selectedPdf}#toolbar=0&navpanes=0&view=FitH`}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                title="Training Slide Viewer"
                            />
                        </div>
                        <div style={{ padding: '1.25rem 2rem', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                onClick={async () => {
                                    if (currentTrainingName && user) {
                                        const newCompleted = completedTrainings.includes(currentTrainingName)
                                            ? completedTrainings
                                            : [...completedTrainings, currentTrainingName];

                                        setCompletedTrainings(newCompleted);

                                        // Persist to Supabase
                                        await ((supabase as any)
                                            .from('users')
                                            .update({ completed_trainings: newCompleted })
                                            .eq('id', user.id));
                                    }
                                    setSelectedPdf(null);
                                    setCurrentTrainingName(null);
                                }}
                                style={{ padding: '0.75rem 2rem', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)' }}
                            >
                                I have finished reading
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Break Notification Overlay */}
            {showBreakOverlay && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '24px', padding: '3rem', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <div style={{ width: '80px', height: '80px', background: '#FEF3C7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                            <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '2.5rem', color: '#D97706' }}></i>
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#1E1B4B', marginBottom: '1rem' }}>Time for a Break!</h2>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2.5rem' }}>
                            You have been working for 5 hours straight. For your health and safety, all active tasks have been paused. Please take a moment to rest.
                        </p>
                        <button
                            onClick={handleEndBreak}
                            style={{
                                width: '100%',
                                padding: '1.25rem',
                                borderRadius: '16px',
                                background: '#10B981',
                                color: 'white',
                                border: 'none',
                                fontSize: '1.2rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            Return to Work
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
