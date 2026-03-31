import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export const NfcManagementPage: React.FC = () => {
    const { t } = useTranslation();
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
            setStatusMatch({ type: 'error', message: t('nfc.notSupported') });
            return;
        }

        try {
            setIsScanning(true);
            setStatusMatch({ type: 'info', message: t('nfc.approachTag') });
            const reader = new (window as any).NDEFReader();
            await reader.scan();

            reader.onreading = ({ serialNumber }: any) => {
                setScannedTagId(serialNumber);
                setIsScanning(false);
                setStatusMatch({ type: 'success', message: t('nfc.tagCaptured', { id: serialNumber }) });
            };

            reader.onreadingerror = () => {
                setIsScanning(false);
                setStatusMatch({
                    type: 'error',
                    message: t('nfc.tagBlocked')
                });
            };

        } catch (error: any) {
            console.error(error);
            setIsScanning(false);
            setStatusMatch({ type: 'error', message: t('nfc.scanFailed', { error: error.message || error }) });
        }
    };

    const handleAssign = async () => {
        if (!selectedWorkerId || !scannedTagId) {
            setStatusMatch({ type: 'error', message: t('nfc.selectFirst') });
            return;
        }

        const { error } = await (supabase
            .from('users') as any)
            .update({ nfc_id: scannedTagId })
            .eq('id', selectedWorkerId);

        if (error) {
            setStatusMatch({ type: 'error', message: t('nfc.failedToAssign', { error: error.message }) });
        } else {
            setStatusMatch({ type: 'success', message: t('nfc.assignSuccess') });
            setScannedTagId('');
            setSelectedWorkerId('');
            fetchWorkers();
        }
    };

    const handleRemoveTag = async (workerId: string) => {
        if (!window.confirm(t('nfc.removeConfirm'))) return;

        const { error } = await (supabase
            .from('users') as any)
            .update({ nfc_id: null })
            .eq('id', workerId);

        if (error) {
            setStatusMatch({ type: 'error', message: t('nfc.failedToRemove', { error: error.message }) });
        } else {
            setStatusMatch({ type: 'success', message: t('nfc.removeSuccess') });
            fetchWorkers();
        }
    };

    const clearStatus = () => setStatusMatch(null);

    return (
        <div className="nfc-management-page">
            <style dangerouslySetInnerHTML={{
                __html: `
                .nfc-management-page {
                    padding: 2rem;
                    width: 100%;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .nfc-card {
                    background: var(--bg-card);
                    border-radius: 24px;
                    padding: 2.5rem;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    border: 1px solid var(--border);
                }
                .nfc-header {
                    margin-bottom: 2.5rem;
                }
                .nfc-header h1 {
                    font-size: 2rem;
                    font-weight: 900;
                    color: var(--text-main);
                    margin: 0;
                    letter-spacing: -0.03em;
                }
                .nfc-header p {
                    color: var(--text-muted);
                    margin-top: 0.5rem;
                    font-weight: 600;
                }
                .form-section {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                }
                @media (max-width: 768px) {
                    .form-section { grid-template-columns: 1fr; }
                }
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .input-group label {
                    font-weight: 800;
                    color: var(--text-main);
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .input-group select, .input-group input {
                    padding: 1rem 1.25rem;
                    border-radius: 12px;
                    border: 1.5px solid var(--border);
                    font-size: 1rem;
                    outline: none;
                    background: var(--bg-main);
                    color: var(--text-main);
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .input-group select:focus, .input-group input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                }
                .scan-box {
                    background: var(--bg-main);
                    border: 2px dashed var(--border);
                    border-radius: 16px;
                    padding: 2.5rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    color: var(--text-main);
                }
                .scan-box:hover {
                    border-color: var(--primary);
                    transform: translateY(-2px);
                }
                .scan-box i {
                    font-size: 2.5rem;
                    color: var(--primary);
                }
                .btn-assign {
                    background: var(--primary);
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
                }
                .btn-assign:hover:not(:disabled) {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                }
                .btn-assign:disabled {
                    background: var(--border);
                    cursor: not-allowed;
                    color: var(--text-muted);
                }
                .status-alert {
                    padding: 1rem 1.5rem;
                    border-radius: 12px;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 700;
                }
                .status-success { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
                .status-error { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
                .status-info { background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); }

                .workers-list {
                    margin-top: 4rem;
                }
                .workers-list h2 {
                    font-size: 1.5rem;
                    font-weight: 900;
                    color: var(--text-main);
                    margin-bottom: 1.5rem;
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
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                }
                .worker-nfc-id {
                    background: var(--bg-main);
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                    color: var(--primary);
                    font-weight: 800;
                    font-size: 0.9rem;
                    border: 1px solid var(--border);
                }
                .btn-remove-tag {
                    color: var(--text-muted);
                    background: transparent;
                    border: 1.5px solid var(--border);
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
                    background: rgba(239, 68, 68, 0.1);
                    border-color: rgba(239, 68, 68, 0.2);
                }
            ` }} />

            <div className="nfc-card">
                <div className="nfc-header">
                    <h1>{t('nfc.title')}</h1>
                    <p>{t('nfc.subtitle')}</p>
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
                        <label>{t('nfc.selectWorker')}</label>
                        <select
                            value={selectedWorkerId}
                            onChange={(e) => setSelectedWorkerId(e.target.value)}
                        >
                            <option value="">{t('nfc.chooseWorker')}</option>
                            {workers.map(w => (
                                <option key={w.id} value={w.id}>{w.name} ({w.worker_id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>{t('nfc.scanTag')}</label>
                        <div className="scan-box" onClick={handleScan}>
                            <i className={`fa-solid ${isScanning ? 'fa-spinner fa-spin' : 'fa-rss'}`}></i>
                            <span>{scannedTagId ? `TAG ID: ${scannedTagId}` : isScanning ? t('nfc.listening') : t('nfc.clickToScan')}</span>
                        </div>
                        <input
                            type="text"
                            placeholder={t('nfc.manualPlaceholder')}
                            value={scannedTagId}
                            onChange={(e) => setScannedTagId(e.target.value)}
                        />
                    </div>

                    <button
                        className="btn-assign"
                        onClick={handleAssign}
                        disabled={!selectedWorkerId || !scannedTagId}
                    >
                        {t('nfc.assignBtn')}
                    </button>
                </div>
            </div>

            <div className="workers-list">
                <h2>{t('nfc.assignedTitle')}</h2>
                {isLoading ? <p>{t('nfc.loadingWorkers')}</p> : (
                    <div className="workers-list-grid">
                        {workers.filter(w => w.nfc_id).map(w => (
                            <div key={w.id} className="worker-item">
                                <div>
                                    <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.1rem' }}>{w.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t('leave.memberId')}: {w.worker_id}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div className="worker-nfc-id">{w.nfc_id}</div>
                                    <button
                                        className="btn-remove-tag"
                                        onClick={() => handleRemoveTag(w.id)}
                                        title={t('nfc.unassign')}
                                    >
                                        <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {workers.filter(w => w.nfc_id).length === 0 && !isLoading && (
                    <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>{t('nfc.noTags')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
