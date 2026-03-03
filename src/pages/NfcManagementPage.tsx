import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const NfcManagementPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [scannedTagId, setScannedTagId] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [statusMatch, setStatusMatch] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

    useEffect(() => {
        fetchWorkers();
    }, []);

    const fetchWorkers = async () => {
        setIsLoading(true);
        const { data } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'employee')
            .eq('active', true)
            .order('name', { ascending: true });
        if (data) setWorkers(data);
        setIsLoading(false);
    };

    const handleScan = async () => {
        if (!('NDEFReader' in window)) {
            setStatusMatch({ type: 'error', message: 'NFC is not supported on this device/browser.' });
            return;
        }

        try {
            setIsScanning(true);
            setStatusMatch({ type: 'info', message: 'Approach the NFC tag to the device...' });
            const reader = new (window as any).NDEFReader();
            await reader.scan();

            reader.onreading = ({ serialNumber }: any) => {
                setScannedTagId(serialNumber);
                setIsScanning(false);
                setStatusMatch({ type: 'success', message: `Tag Captured: ${serialNumber}` });
            };

            reader.onreadingerror = () => {
                setIsScanning(false);
                setStatusMatch({
                    type: 'error',
                    message: 'Tag detected but blocked. Use "NFC Tools" to write a Text record to this card first.'
                });
            };

        } catch (error) {
            console.error(error);
            setIsScanning(false);
            setStatusMatch({ type: 'error', message: 'NFC Scan failed: ' + error });
        }
    };

    const handleAssign = async () => {
        if (!selectedWorkerId || !scannedTagId) {
            setStatusMatch({ type: 'error', message: 'Please select a worker and scan a tag first.' });
            return;
        }

        const { error } = await (supabase
            .from('users') as any)
            .update({ nfc_id: scannedTagId })
            .eq('id', selectedWorkerId);

        if (error) {
            setStatusMatch({ type: 'error', message: 'Failed to assign tag: ' + error.message });
        } else {
            setStatusMatch({ type: 'success', message: 'Tag assigned successfully!' });
            setScannedTagId('');
            setSelectedWorkerId('');
            fetchWorkers();
        }
    };

    const handleRemoveTag = async (workerId: string) => {
        if (!window.confirm('Are you sure you want to remove this NFC tag?')) return;

        const { error } = await (supabase
            .from('users') as any)
            .update({ nfc_id: null })
            .eq('id', workerId);

        if (error) {
            setStatusMatch({ type: 'error', message: 'Failed to remove tag: ' + error.message });
        } else {
            setStatusMatch({ type: 'success', message: 'Tag removed successfully!' });
            fetchWorkers();
        }
    };

    const clearStatus = () => setStatusMatch(null);

    return (
        <div className="nfc-management-page">
            <style dangerouslySetInnerHTML={{
                __html: `
                .nfc-management-page {
                    padding: 3rem;
                    width: 100%;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .nfc-card {
                    background: white;
                    border-radius: 24px;
                    padding: 3rem;
                    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
                    border: 1px solid #f1f5f9;
                }
                .nfc-header {
                    margin-bottom: 3rem;
                }
                .nfc-header h1 {
                    font-size: 2rem;
                    font-weight: 900;
                    color: #1e1b4b;
                    margin: 0;
                    letter-spacing: -0.03em;
                }
                .nfc-header p {
                    color: #94a3b8;
                    margin-top: 0.5rem;
                    font-weight: 600;
                }
                .form-section {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                }
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .input-group label {
                    font-weight: 800;
                    color: #1e1b4b;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .input-group select, .input-group input {
                    padding: 1rem 1.25rem;
                    border-radius: 12px;
                    border: 1.5px solid #e2e8f0;
                    font-size: 1rem;
                    outline: none;
                    background: #f8fafc;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .input-group select:focus, .input-group input:focus {
                    border-color: #f59e0b;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
                }
                .scan-box {
                    background: #ffffff;
                    border: 2px dashed #e2e8f0;
                    border-radius: 16px;
                    padding: 3rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1.25rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .scan-box:hover {
                    border-color: #f59e0b;
                    transform: translateY(-4px);
                    box-shadow: 0 15px 30px -10px rgba(0,0,0,0.05);
                }
                .scan-box i {
                    font-size: 3rem;
                    color: #f59e0b;
                }
                .btn-assign {
                    background: #1e1b4b;
                    color: white;
                    border: none;
                    padding: 1.25rem;
                    border-radius: 14px;
                    font-weight: 800;
                    cursor: pointer;
                    font-size: 1.1rem;
                    margin-top: 1rem;
                    grid-column: 1 / -1;
                    transition: all 0.2s;
                    box-shadow: 0 10px 15px -3px rgba(30, 27, 75, 0.2);
                }
                .btn-assign:hover:not(:disabled) {
                    transform: translateY(-2px);
                    filter: brightness(1.2);
                }
                .btn-assign:disabled {
                    background: #cbd5e1;
                    cursor: not-allowed;
                    box-shadow: none;
                }
                .status-alert {
                    padding: 1.25rem 1.5rem;
                    border-radius: 14px;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 700;
                }
                .status-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .status-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
                .status-info { background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }

                .workers-list {
                    margin-top: 4rem;
                }
                .workers-list h2 {
                    font-size: 1.5rem;
                    font-weight: 900;
                    color: #1e1b4b;
                    margin-bottom: 1.5rem;
                    letter-spacing: -0.02em;
                }
                .workers-list-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 1.5rem;
                }
                .worker-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    background: white;
                    border: 1px solid #f1f5f9;
                    border-radius: 16px;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                }
                .worker-nfc-id {
                    font-family: 'Outfit', sans-serif;
                    background: #f8fafc;
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                    color: #f59e0b;
                    font-weight: 800;
                    font-size: 0.9rem;
                    border: 1px solid #e2e8f0;
                }
                .btn-remove-tag {
                    color: #94a3b8;
                    background: transparent;
                    border: 1.5px solid #e2e8f0;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-remove-tag:hover {
                    color: #ef4444;
                    background: #fee2e2;
                    border-color: #fecaca;
                    transform: scale(1.1);
                }
            ` }} />

            <div className="nfc-card">
                <div className="nfc-header">
                    <h1>NFC Setup</h1>
                    <p>Assign a physical NFC tag to a worker for instant clock-in/out.</p>
                </div>

                {statusMatch && (
                    <div className={`status-alert status-${statusMatch.type}`}>
                        <span>{statusMatch.message}</span>
                        <button onClick={clearStatus} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                <div className="form-section">
                    <div className="input-group">
                        <label>1. Select Worker</label>
                        <select
                            value={selectedWorkerId}
                            onChange={(e) => setSelectedWorkerId(e.target.value)}
                        >
                            <option value="">Choose a worker...</option>
                            {workers.map(w => (
                                <option key={w.id} value={w.id}>{w.name} ({w.worker_id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>2. Scan NFC Tag</label>
                        <div className="scan-box" onClick={handleScan}>
                            <i className={`fa-solid ${isScanning ? 'fa-spinner fa-spin' : 'fa-rss'}`}></i>
                            <span>{scannedTagId ? `TAG ID: ${scannedTagId}` : isScanning ? 'Listening...' : 'Click or Tap here to Scan Tag'}</span>
                        </div>
                        <input
                            type="text"
                            placeholder="Or type Tag ID manually"
                            value={scannedTagId}
                            onChange={(e) => setScannedTagId(e.target.value)}
                        />
                    </div>

                    <button
                        className="btn-assign"
                        onClick={handleAssign}
                        disabled={!selectedWorkerId || !scannedTagId}
                    >
                        Assign Tag to Worker
                    </button>
                </div>
            </div>

            <div className="workers-list">
                <h2>Currently Assigned Tags</h2>
                {isLoading ? <p>Loading workers...</p> : (
                    <div className="workers-list-grid">
                        {workers.filter(w => w.nfc_id).map(w => (
                            <div key={w.id} className="worker-item">
                                <div>
                                    <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.1rem' }}>{w.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>MEMBER ID: {w.worker_id}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div className="worker-nfc-id">{w.nfc_id}</div>
                                    <button
                                        className="btn-remove-tag"
                                        onClick={() => handleRemoveTag(w.id)}
                                        title="Unassign Tag"
                                    >
                                        <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {workers.filter(w => w.nfc_id).length === 0 && !isLoading && (
                    <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                        <p style={{ color: '#94A3B8', fontStyle: 'italic', margin: 0 }}>No workers have tags assigned yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
