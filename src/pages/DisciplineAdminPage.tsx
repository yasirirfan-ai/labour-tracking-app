import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DisciplinaryService } from '../lib/disciplinaryService';
import type { SeverityType, ActionStepType } from '../lib/disciplinaryService';
import { useAuth } from '../context/AuthContext';

export const DisciplineAdminPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [incidents, setIncidents] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedIncident, setSelectedIncident] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean, message: string } | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        worker_id: '',
        incident_date: new Date().toISOString().split('T')[0],
        category: 'attendance',
        severity: 'minor' as SeverityType,
        documentation: '',
        description: '',
    });
    const [attachment, setAttachment] = useState<File | null>(null);

    const [suggestedStep, setSuggestedStep] = useState<ActionStepType>('verbal_warning');

    useEffect(() => {
        fetchIncidents();
        fetchWorkers();

        // Real-time subscription for when workers sign incidents
        const subscription = supabase
            .channel('admin-incident-updates')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'disciplinary_incidents'
            }, async (payload) => {
                const oldStatus = payload.old.status;
                const newStatus = payload.new.status;

                // If it was just signed
                if (oldStatus !== 'acknowledged' && newStatus === 'acknowledged') {
                    // Fetch worker name for a better notification
                    const { data: workerData } = await supabase
                        .from('users')
                        .select('name')
                        .eq('id', payload.new.worker_id)
                        .single();

                    setNotification({
                        show: true,
                        message: `Worker ${(workerData as any)?.name || 'ID: ' + payload.new.worker_id} has signed their incident report.`
                    });

                    fetchIncidents(); // Refresh list
                    setTimeout(() => setNotification(null), 8000);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    useEffect(() => {
        // Test notification on load to verify UI component
        const testTimer = setTimeout(() => {
            setNotification({
                show: true,
                message: "System Monitor: Real-time incident tracking is active."
            });
            setTimeout(() => setNotification(null), 5000);
        }, 1000);
        return () => clearTimeout(testTimer);
    }, []);

    useEffect(() => {
        if (formData.worker_id && formData.severity) {
            updateSuggestedStep();
        }
    }, [formData.worker_id, formData.severity]);

    const fetchIncidents = async () => {
        try {
            const { data, error } = await supabase
                .from('disciplinary_incidents')
                .select(`
                    *,
                    worker:users!worker_id(name, worker_id),
                    reporter:users!reported_by(name)
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error fetching incidents:', error);
                return;
            }
            if (data) setIncidents(data);
        } catch (err) {
            console.error('Failed to fetch incidents:', err);
        }
    };

    const fetchWorkers = async () => {
        try {
            const { data, error } = await supabase.from('users').select('id, name, worker_id');
            if (error) {
                console.error('Supabase error fetching workers:', error);
                return;
            }
            if (data) setWorkers(data);
        } catch (err) {
            console.error('Failed to fetch workers:', err);
        }
    };

    const updateSuggestedStep = async () => {
        try {
            const step = await DisciplinaryService.suggestNextStep(formData.worker_id, formData.severity);
            setSuggestedStep(step);
        } catch (err) {
            console.error('Failed to suggest next step:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let attachment_url = '';

            // Handle file upload if present (assuming 'attachments' bucket exists)
            if (attachment) {
                const fileExt = attachment.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await (supabase as any).storage
                    .from('attachments')
                    .upload(`${formData.worker_id}/${fileName}`, attachment);

                if (uploadError) {
                    console.error('Upload Error:', uploadError);
                    alert(`Upload Failed: ${uploadError.message}`);
                    return;
                }

                if (uploadData) {
                    const { data: { publicUrl } } = (supabase as any).storage
                        .from('attachments')
                        .getPublicUrl(`${formData.worker_id}/${fileName}`);
                    attachment_url = publicUrl;
                }
            }

            // 1. Create Incident
            const { data: incident, error: incError } = await (supabase as any)
                .from('disciplinary_incidents')
                .insert({
                    ...formData,
                    attachment_url,
                    reported_by: currentUser?.id,
                    status: 'action_taken'
                })
                .select()
                .single();

            if (incError) {
                console.error('Incident Creation Error:', incError);
                throw new Error(`Incident Error: ${incError.message}`);
            }

            // 2. Create Disciplinary Action (Automated Step)
            const { error: actError } = await (supabase as any)
                .from('disciplinary_actions')
                .insert({
                    worker_id: formData.worker_id,
                    incident_id: incident.id,
                    action_step: suggestedStep,
                    issued_date: new Date().toISOString(),
                    status: 'active'
                });

            if (actError) {
                console.error('Action Creation Error:', actError);
                throw new Error(`Action Error: ${actError.message}`);
            }

            alert('Incident reported successfully');
            setShowModal(false);
            setAttachment(null);
            fetchIncidents();
        } catch (err: any) {
            console.error(err);
            alert(`Failed: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                .discipline-grid {
                    display: grid;
                    gap: 1.5rem;
                    padding: 0 3.5rem;
                    margin-bottom: 4rem;
                }
                .inc-card {
                    background: white;
                    border-radius: 20px;
                    padding: 2rem;
                    border: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                }
                .inc-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.05);
                    border-color: var(--primary);
                }
                .severity-badge {
                    padding: 0.4rem 0.8rem;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .sev-minor { background: #fee2e2; color: #991b1b; }
                .sev-major { background: #fef3c7; color: #92400e; }
                .sev-gross_misconduct { background: #1e1b4b; color: white; }
                
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(15, 23, 42, 0.6);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 3000;
                    backdrop-filter: blur(8px);
                }
                .modal-content {
                    background: white;
                    padding: 3rem;
                    border-radius: 28px;
                    width: 100%;
                    max-width: 650px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }
                .suggestion-box {
                    background: #f8fafc;
                    padding: 1.5rem;
                    border-radius: 16px;
                    margin: 1.5rem 0;
                    border-left: 5px solid #f59e0b;
                }
                .evidence-box {
                    background: #f1f5f9;
                    border-radius: 16px;
                    padding: 1rem;
                    margin-top: 1.5rem;
                    text-align: center;
                }
                .evidence-preview {
                    max-width: 100%;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                }
                .status-badge-premium {
                    padding: 0.5rem 1rem;
                    border-radius: 999px;
                    font-weight: 800;
                    font-size: 0.75rem;
                    letter-spacing: 0.05em;
                }
                .status-pending { background: #f1f5f9; color: #64748b; }
                .status-signed { background: #dcfce7; color: #166534; }

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
            `}} />

            {notification?.show && (
                <div className="notification-popup">
                    <div style={{ width: '50px', height: '50px', background: '#dcfce7', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-file-signature" style={{ color: '#166534', fontSize: '1.5rem' }}></i>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b', marginBottom: '0.25rem' }}>VERIFICATION COMPLETED</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: '1.4' }}>{notification.message}</div>
                    </div>
                    <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.5rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">Discipline & Conduct</h1>
                    <p className="page-subtitle">SOP 3.7 Incident Tracking & Compliance Management</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <i className="fa-solid fa-plus"></i> Report Incident
                </button>
            </div>

            <div className="discipline-grid">
                {incidents.length > 0 ? (
                    incidents.map(inc => (
                        <div key={inc.id} className="inc-card" onClick={() => { setSelectedIncident(inc); setShowDetailModal(true); }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                                    <span className={`severity-badge sev-${inc.severity}`}>
                                        {(inc.severity || 'Minor').replace('_', ' ')}
                                    </span>
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700 }}>
                                        {inc.incident_date ? new Date(inc.incident_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                                    </span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e1b4b', fontWeight: 900, marginBottom: '0.4rem' }}>
                                    {inc.worker?.name || 'Unknown Worker'}
                                    <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.9rem', marginLeft: '0.75rem' }}>
                                        ID: {inc.worker?.worker_id || 'No ID'}
                                    </span>
                                </h3>
                                <p style={{ margin: '0', color: '#64748b', fontSize: '0.95rem', fontWeight: 500, lineHeight: '1.4' }}>
                                    {inc.description?.length > 120 ? inc.description.substring(0, 120) + '...' : inc.description}
                                </p>
                                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="worker-avatar" style={{ width: '24px', height: '24px', fontSize: '0.65rem' }}>{inc.reporter?.name?.[0] || 'S'}</div>
                                        <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>{inc.reporter?.name || 'System'}</span>
                                    </div>
                                    <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                        {inc.category}
                                    </span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div className={`status-badge-premium ${inc.status === 'acknowledged' ? 'status-signed' : 'status-pending'}`}>
                                    {inc.status === 'acknowledged' ? <><i className="fa-solid fa-signature"></i> SIGNED</> : <><i className="fa-regular fa-clock"></i> PENDING</>}
                                </div>
                                <div style={{ marginTop: '1rem', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 800 }}>
                                    VIEW DETAILS <i className="fa-solid fa-chevron-right" style={{ marginLeft: '4px' }}></i>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '16px', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                        <i className="fa-solid fa-shield-heart" style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5, display: 'block' }}></i>
                        No incidents recorded yet. Ensuring a high standard of conduct.
                    </div>
                )}
            </div>

            {showDetailModal && selectedIncident && (
                <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                            <div>
                                <span className={`severity-badge sev-${selectedIncident.severity}`} style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                                    {selectedIncident.severity.toUpperCase().replace('_', ' ')}
                                </span>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e1b4b', margin: 0 }}>Incident Report Detail</h2>
                            </div>
                            <button onClick={() => setShowDetailModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', color: '#64748b' }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Employee Involved</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e1b4b', marginBottom: '0.25rem' }}>{selectedIncident.worker?.name}</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>W-ID: {selectedIncident.worker?.worker_id}</div>
                            </div>
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Incident Type</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e1b4b', marginBottom: '0.25rem' }}>{selectedIncident.category.toUpperCase().replace('_', ' ')}</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>{new Date(selectedIncident.incident_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                            </div>
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Severity & Reference</div>
                                <span className={`severity-badge sev-${selectedIncident.severity}`} style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '6px', marginBottom: '0.5rem', display: 'inline-block' }}>
                                    {selectedIncident.severity.toUpperCase().replace('_', ' ')}
                                </span>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e1b4b' }}>REF: {selectedIncident.documentation || 'N/A'}</div>
                            </div>
                        </div>

                        <div className="status-label" style={{ marginBottom: '1rem' }}>Formal Description</div>
                        <p style={{ fontSize: '1.1rem', color: '#334155', lineHeight: '1.7', background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                            {selectedIncident.description}
                        </p>

                        {selectedIncident.attachment_url && (
                            <div style={{ marginTop: '2.5rem' }}>
                                <div className="status-label" style={{ marginBottom: '1rem' }}>Recorded Evidence</div>
                                <div className="evidence-box">
                                    {selectedIncident.attachment_url.match(/\.(mp4|webm|ogg)$/) ? (
                                        <video src={selectedIncident.attachment_url} controls className="evidence-preview" />
                                    ) : (
                                        <img src={selectedIncident.attachment_url} alt="Evidence" className="evidence-preview" />
                                    )}
                                    <div style={{ marginTop: '1rem' }}>
                                        <a href={selectedIncident.attachment_url} target="_blank" rel="noreferrer" style={{ color: '#f59e0b', fontWeight: 800, textDecoration: 'none', fontSize: '0.9rem' }}>
                                            <i className="fa-solid fa-download"></i> DOWNLOAD ORIGINAL EVIDENCE
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '3rem', paddingTop: '2.5rem', borderTop: '2px dashed #e2e8f0' }}>
                            <div className="status-label" style={{ marginBottom: '1.5rem' }}>Acknowledgement Tracking</div>
                            {selectedIncident.status === 'acknowledged' ? (
                                <div style={{ background: '#dcfce7', padding: '2rem', borderRadius: '24px', border: '1px solid #bbf7d0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#166534', fontWeight: 900 }}>
                                            <i className="fa-solid fa-certificate" style={{ fontSize: '1.5rem' }}></i>
                                            VERIFIED EMPLOYEE SIGNATURE
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 800 }}>{new Date(selectedIncident.signed_at).toLocaleString()}</div>
                                    </div>
                                    <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.6)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Worker's Official Explanation</div>
                                        <p style={{ margin: 0, fontStyle: 'italic', color: '#166534' }}>"{selectedIncident.worker_explanation || 'No verbal explanation provided.'}"</p>
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontFamily: "'Dancing Script', cursive", fontWeight: 'bold', color: '#166534', textAlign: 'center', padding: '1rem', border: '1px solid #bbf7d0', borderRadius: '12px', background: 'white' }}>
                                        {selectedIncident.worker_signature}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background: '#f1f5f9', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                                    <h4 style={{ margin: 0, fontWeight: 900, color: '#475569' }}>Signature Pending</h4>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>The worker has been notified but has not yet reviewed or signed this report.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e1b4b', margin: 0 }}>Record Misconduct</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#64748b' }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Select Employee</label>
                                <select
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)', background: '#F8FAFC' }}
                                    required
                                    value={formData.worker_id}
                                    onChange={e => setFormData({ ...formData, worker_id: e.target.value })}
                                >
                                    <option value="">Choose worker...</option>
                                    {workers.filter(w => w.name).map(w => (
                                        <option key={w.id} value={w.id}>{w.name} (ID: {w.worker_id || 'N/A'})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Incident Date</label>
                                    <input
                                        type="date"
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)' }}
                                        value={formData.incident_date}
                                        onChange={e => setFormData({ ...formData, incident_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Incident Category</label>
                                    <select
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)', background: '#F8FAFC' }}
                                        required
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        <option value="attendance">Attendance</option>
                                        <option value="performance">Performance</option>
                                        <option value="conduct">Conduct / Behavior</option>
                                        <option value="safety">Safety Violation</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Severity Level</label>
                                    <select
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)', background: '#F8FAFC' }}
                                        required
                                        value={formData.severity}
                                        onChange={e => setFormData({ ...formData, severity: e.target.value as SeverityType })}
                                    >
                                        <option value="minor">Minor Infraction</option>
                                        <option value="major">Major Infraction</option>
                                        <option value="gross_misconduct">Gross Misconduct</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Documentation Ref</label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)' }}
                                        value={formData.documentation}
                                        onChange={e => setFormData({ ...formData, documentation: e.target.value })}
                                        placeholder="Case # or SOP Ref"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Description</label>
                                <textarea
                                    style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1.5px solid var(--border)', resize: 'none', fontFamily: 'inherit' }}
                                    rows={3}
                                    required
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Describe the incident objectively..."
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Attachment (Image or Video)</label>
                                <input
                                    type="file"
                                    accept="image/*,video/*"
                                    onChange={e => setAttachment(e.target.files?.[0] || null)}
                                    style={{ width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                                    {loading ? 'Processing...' : 'Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};
