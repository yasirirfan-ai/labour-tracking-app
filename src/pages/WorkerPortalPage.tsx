import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { completeAllTasks } from '../lib/taskService';
import { Navigate } from 'react-router-dom';
import { LEVEL_2_SOPS } from '../data/sopData';

export const WorkerPortalPage: React.FC = () => {
    const { user, loading: authLoading, logout } = useAuth();
    const [localUser, setLocalUser] = useState(user);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeTasks, setActiveTasks] = useState<any[]>([]);
    const [disciplinaryIncidents, setDisciplinaryIncidents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'personal_info' | 'conduct' | 'settings' | 'training'>('dashboard');
    const [signingData, setSigningData] = useState<{ [key: string]: { explanation: string, signature: string } }>({});
    const [nfcStatus, setNfcStatus] = useState<'idle' | 'listening' | 'reading' | 'error'>('idle');
    const [pendingPolicies, setPendingPolicies] = useState<any[]>([]);
    const [policySignature, setPolicySignature] = useState('');
    const [isSigningPolicy, setIsSigningPolicy] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [trainingRole, setTrainingRole] = useState<'Production' | 'QC' | 'Warehouse' | 'Management' | 'Compounder I'>(user?.role === 'manager' ? 'Management' : 'Production');
    const [selectedSOPSection, setSelectedSOPSection] = useState<string>(() => {
        const initialRole = user?.role === 'manager' ? 'Management' : 'Production';
        return LEVEL_2_SOPS[initialRole] ? LEVEL_2_SOPS[initialRole][0].name : '';
    });
    const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
    const [currentTrainingName, setCurrentTrainingName] = useState<string | null>(null);
    const [completedTrainings, setCompletedTrainings] = useState<string[]>(() => {
        const saved = localStorage.getItem(`completed_trainings_${user?.id}`);
        return saved ? JSON.parse(saved) : ['GMP and Quality Awareness']; // Start with one completed as per original UI theme
    });

    useEffect(() => {
        if (user) {
            localStorage.setItem(`completed_trainings_${user.id}`, JSON.stringify(completedTrainings));
        }
    }, [completedTrainings, user]);

    const LEVEL_1_TRAININGS = [
        {
            name: 'GMP and Quality Awareness',
            pdfs: [
                { name: 'Training Presentation (Updated)', path: '/training_materials/GMP_presentation_short_updated_02202025.pdf' },
                { name: 'Training Presentation (Original)', path: '/training_materials/GMP_presentation_updated_12162024.pdf' }
            ]
        },
        {
            name: 'Gowning, Hand Washing and Conduct',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Gowning, Hand washing and Conduct 3.5.2 - Training Material rev.112524.pdf' }]
        },
        {
            name: 'Premises Cleaning and Sanitation',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Premises Cleaning and Sanitation - Training Material rev.030425.pdf' }]
        },
        {
            name: 'Pest Control',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Pest Control 4.13 - Training Material rev101124.pdf' }]
        },
        {
            name: 'Biohazard Response',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Biohazard Response - Training Material rev.101124.pdf' }]
        },
        {
            name: 'Personnel and Training',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Personnel and Training 3.4-2 - Training Material rev.101024.pdf' }]
        },
        {
            name: 'Visitor Policy',
            pdfs: [{ name: 'Training Material', path: '/training_materials/Visitor Policy - Training Material rev.101124.pdf' }]
        }
    ];

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
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: (user as any)?.phone || '',
        email: (user as any)?.email || '',
        address: (user as any)?.address || '',
    });

    useEffect(() => {
        if (!authLoading && user) {
            setLocalUser(user);
            setFormData({
                name: user.name || '',
                phone: (user as any).phone || '',
                email: (user as any).email || '',
                address: (user as any).address || '',
            });
        }
    }, [user, authLoading]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleSaveProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { error } = await (supabase as any)
                .from('users')
                .update({
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email,
                    address: formData.address
                })
                .eq('id', user.id);

            if (error) throw error;

            const updatedUser = { ...user, ...formData };
            localStorage.setItem('bt_user', JSON.stringify(updatedUser));
            setLocalUser(updatedUser as any);
            setEditMode(false);
            alert('Profile updated successfully!');
        } catch (err) {
            console.error(err);
            alert('Failed to update personal details');
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
    }, [user]);

    useEffect(() => {
        // Test notification on load to verify UI component
        if (user) {
            const testTimer = setTimeout(() => {
                setNotification({
                    show: true,
                    message: "Bablyon Portal: Security and incident monitoring is active.",
                    severity: 'success'
                });
                setTimeout(() => setNotification(null), 5000);
            }, 1500);
            return () => clearTimeout(testTimer);
        }
    }, [user]);

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
        } catch (err) {
            console.error(err);
            alert('Failed to clock out');
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
        <div className="worker-portal-layout">
            <style dangerouslySetInnerHTML={{
                __html: `
                .worker-main-wrapper {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-width: 0;
                }


                .worker-content {
                    padding: 2.5rem 3.5rem;
                    width: 100%;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2.5rem;
                }

                .status-card, .profile-section, .conduct-section {
                    background: white;
                    border-radius: 24px;
                    padding: 2.5rem;
                    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
                    border: 1px solid #f1f5f9;
                    margin-bottom: 2rem;
                }

                .status-label {
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 1.25rem;
                }

                .status-value {
                    font-size: 3rem;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.02em;
                }

                .status-dot {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                }

                .status-present { color: #10b981; }
                .status-offline { color: #94a3b8; }
                .dot-present { background: #10b981; box-shadow: 0 0 20px rgba(16, 185, 129, 0.6); }
                .dot-offline { background: #94a3b8; }

                .time-display {
                    font-size: 2rem;
                    font-weight: 700;
                    color: #1e1b4b;
                    font-variant-numeric: tabular-nums;
                }

                .clock-btn {
                    padding: 1.25rem 2rem;
                    border-radius: 16px;
                    font-size: 1.1rem;
                    font-weight: 700;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                }

                .clock-in-btn {
                    background: #10b981;
                    color: white;
                    box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);
                }

                .clock-out-btn {
                    background: #ef4444;
                    color: white;
                    box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);
                }

                .clock-btn:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.1);
                }

                .worker-avatar {
                    width: 44px;
                    height: 44px;
                    background: #1e1b4b;
                    color: #f59e0b;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800;
                    font-size: 1.2rem;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .form-group label {
                    font-size: 0.85rem;
                    font-weight: 800;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.025em;
                }

                .form-group input, .form-group textarea {
                    padding: 1rem 1.25rem;
                    border-radius: 12px;
                    border: 1.5px solid #e2e8f0;
                    background: #f8fafc;
                    font-size: 1rem;
                    transition: all 0.2s;
                    font-weight: 500;
                }

                .form-group input:focus, .form-group textarea:focus {
                    border-color: #f59e0b;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
                }

                .nfc-status-bar {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 1rem 1.5rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    margin-bottom: 2.5rem;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
                }

                .nfc-status-error { color: #EF4444; border-color: #FEE2E2; background: #FFF7ED; }
                .nfc-status-reading { color: #2563EB; border-color: #DBEAFE; background: #EFF6FF; }

                @media (max-width: 900px) {
                    .worker-sidebar { width: 80px; padding: 2.5rem 0.75rem; }
                    .sidebar-brand span, .nav-item span { display: none; }
                }

                .notification-popup {
                    position: fixed;
                    top: 2rem;
                    right: 2rem;
                    background: white;
                    border-radius: 20px;
                    padding: 1.5rem;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
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
                .worker-main-wrapper.expanded {
                    margin-left: 80px;
                }

                .on-duty-banner {
                    width: 100%;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 24px;
                    padding: 3rem;
                    color: white;
                    margin-bottom: 2.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 20px 40px -10px rgba(16, 185, 129, 0.3);
                    position: relative;
                    overflow: hidden;
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
                    font-size: 3.5rem;
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
                    padding: 1.25rem 2.5rem;
                    border-radius: 18px;
                    font-size: 1.1rem;
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
                                <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{user.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>ID: {user.worker_id}</div>
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '2.5rem', width: '100%' }}>
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
                                            <button className="clock-btn-premium btn-out" onClick={handleClockOut} disabled={loading}>
                                                <i className="fa-solid fa-stop"></i> {loading ? 'Clocking out...' : 'Clock Out Now'}
                                            </button>
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
                        <div className="profile-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3.5rem', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#1e1b4b' }}>Personal Information</h3>
                                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontWeight: 600 }}>Manage your contact and identification details</p>
                                </div>
                                <button className="edit-btn" onClick={() => setEditMode(!editMode)} style={{ padding: '0.9rem 1.75rem', borderRadius: '14px', border: 'none', background: editMode ? '#fee2e2' : '#f1f5f9', color: editMode ? '#ef4444' : '#1e1b4b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {editMode ? 'Cancel Edit' : 'Edit Profile'}
                                </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
                                <div className="form-group"><label>Full Name</label><input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group"><label>Worker ID</label><input value={user.worker_id} disabled /></div>
                                <div className="form-group"><label>Phone Number</label><input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group"><label>Email Address</label><input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Home Address</label><textarea rows={3} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} disabled={!editMode} /></div>
                            </div>
                            {editMode && <button className="clock-btn" style={{ background: '#1e1b4b', marginTop: '2rem', color: 'white' }} onClick={handleSaveProfile} disabled={loading}>Save Updated Details</button>}
                        </div>
                    )}

                    {activeTab === 'conduct' && (
                        <div className="conduct-section">
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
                        <div className="profile-section">
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
                        <div className="profile-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.03em' }}>Babylon Training System</h3>
                                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>Complete your mandatory structural training</p>
                                </div>
                                <div style={{ background: '#f0fdf4', color: '#15803d', padding: '0.75rem 1.5rem', borderRadius: '16px', fontWeight: 800, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <i className="fa-solid fa-chart-pie"></i> Progress: {Math.round((completedTrainings.filter(t => LEVEL_1_TRAININGS.find(l1 => l1.name === t)).length / LEVEL_1_TRAININGS.length) * 100)}%
                                </div>
                            </div>

                            <div style={{ marginBottom: '3rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '40px', height: '40px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                        <i className="fa-solid fa-layer-group"></i>
                                    </div>
                                    <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e1b4b' }}>Level 1: Core Orientation</h4>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '40px', height: '40px', background: '#ffedd5', color: '#ea580c', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                            <i className="fa-solid fa-book-open-reader"></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e1b4b' }}>Level 2: Role-Based SOP Material</h4>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>VIEWING ROLE:</span>
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
                                            <option value="Warehouse">Warehouse</option>
                                            <option value="Management">Management</option>
                                        </select>
                                    </div>
                                    {LEVEL_2_SOPS[trainingRole] && LEVEL_2_SOPS[trainingRole].length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>SECTION:</span>
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
                                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontWeight: 600, fontSize: '0.95rem' }}>Controlled SOP reading and acknowledgment (No Slides)</p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                    {(LEVEL_2_SOPS[trainingRole] || [])
                                        .filter((section: any) => section.name === selectedSOPSection)
                                        .map((section: any, sIdx: number) => (
                                            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', gridColumn: '1 / -1' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                                    {section.pdfs.map((pdf: any, pIdx: number) => (
                                                        <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }} onMouseOver={e => (e.currentTarget.style.borderColor = '#cbd5e1')} onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                                                <i className="fa-regular fa-file-lines" style={{ color: '#ea580c', fontSize: '1.25rem', marginTop: '0.2rem' }}></i>
                                                                <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.05rem', lineHeight: 1.4 }}>{pdf.name}</div>
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: 600 }}>
                                                                Status: <span style={{ color: '#ea580c' }}>Pending Read</span>
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
                                                                Read
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    {(!LEVEL_2_SOPS[trainingRole] || LEVEL_2_SOPS[trainingRole].length === 0) && (
                                        ['QC', 'Warehouse', 'Management'].includes(trainingRole) ? (
                                            (trainingRole === 'QC' ? [
                                                'Sampling Procedure',
                                                'Incoming Inspection',
                                                'OOS',
                                                'Control of Measuring Instruments'
                                            ] : trainingRole === 'Warehouse' ? [
                                                'Receipt and Storage of Chemicals',
                                                'Shipping Procedure',
                                                'Recall Procedure'
                                            ] : [
                                                'Risk Assessment',
                                                'Root Cause Analysis',
                                                'CAPA',
                                                'Internal Audits',
                                                'Supplier Evaluation'
                                            ]).map((training, idx) => (
                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }} onMouseOver={e => (e.currentTarget.style.borderColor = '#cbd5e1')} onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                                        <i className="fa-regular fa-file-lines" style={{ color: '#ea580c', fontSize: '1.25rem', marginTop: '0.2rem' }}></i>
                                                        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.05rem', lineHeight: 1.4 }}>{training}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: 600 }}>
                                                        Status: <span style={{ color: '#ea580c' }}>Pending Read</span>
                                                    </div>
                                                    <button style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1.5px solid #cbd5e1', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} onMouseOver={e => { e.currentTarget.style.backgroundColor = '#ea580c'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#ea580c'; }} onMouseOut={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.borderColor = '#cbd5e1'; }}>
                                                        Read
                                                    </button>
                                                </div>
                                            ))
                                        ) : null
                                    )}
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
                                onClick={() => {
                                    if (currentTrainingName && !completedTrainings.includes(currentTrainingName)) {
                                        setCompletedTrainings(prev => [...prev, currentTrainingName]);
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
        </div>
    );
};
