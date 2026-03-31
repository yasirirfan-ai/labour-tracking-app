import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LeaveRequest } from '../types';
import { useTranslation } from 'react-i18next';

export const LeaveRequestsPage: React.FC = () => {
    const { t } = useTranslation();
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    useEffect(() => {
        fetchRequests();
    }, [filter]);

    const fetchRequests = async () => {
        setIsLoading(true);
        let query = supabase
            .from('leave_requests')
            .select('*, user:users(name, worker_id)')
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;
        if (data) setRequests(data as any);
        else if (error) console.error('Error fetching requests:', error);
        setIsLoading(false);
    };

    const handleAction = async (request: LeaveRequest, status: 'approved' | 'rejected') => {
        const adminNotes = window.prompt(t('leave.actions.notePrompt', { status: t(`leave.filters.${status}`) }));
        if (adminNotes === null) return;

        setIsProcessing(request.id);
        
        try {
            const { error: reqError } = await (supabase.from('leave_requests') as any)
                .update({ 
                    status, 
                    admin_notes: adminNotes,
                    processed_at: new Date().toISOString()
                })
                .eq('id', request.id);

            if (reqError) throw reqError;

            if (status === 'approved') {
                const balanceField = request.type === 'pto' ? 'pto_balance' : 'sick_balance';
                const { data: userData, error: userFetchError } = await supabase
                    .from('users')
                    .select(balanceField)
                    .eq('id', request.user_id)
                    .single();

                if (userFetchError) throw userFetchError;

                const currentBalance = parseFloat(userData[balanceField] || '0');
                const newBalance = (currentBalance - request.hours_requested).toFixed(2);

                const { error: balanceError } = await (supabase.from('users') as any)
                    .update({ [balanceField]: newBalance })
                    .eq('id', request.user_id);

                if (balanceError) throw balanceError;

                const { error: historyError } = await (supabase.from('leave_history') as any).insert([{
                    user_id: request.user_id,
                    type: request.type,
                    amount: -request.hours_requested,
                    description: `Approved ${request.type.toUpperCase()} for ${request.start_date} - ${request.end_date}`,
                    entry_date: request.start_date,
                    created_at: new Date().toISOString()
                }]);

                if (historyError) throw historyError;
            }

            alert(t('leave.actions.success', { status: t(`leave.filters.${status}`) }));
            fetchRequests();
        } catch (err: any) {
            alert(t('leave.actions.error', { message: err.message }));
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="leave-requests-page" style={{ padding: '2rem' }}>
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>{t('leave.title')}</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem', fontWeight: 600 }}>{t('leave.subtitle')}</p>
                </div>
                <div style={{ display: 'flex', background: 'var(--bg-main)', padding: '0.4rem', borderRadius: '12px', gap: '0.4rem', border: '1px solid var(--border)' }}>
                    {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '0.6rem 1.25rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: filter === f ? 'var(--bg-card)' : 'transparent',
                                color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: filter === f ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            {t(`leave.filters.${f}`)}
                        </button>
                    ))}
                </div>
            </header>

            {isLoading ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{t('leave.loading')}</div>
            ) : requests.length > 0 ? (
                <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <div className="table-responsive-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.employee')}</th>
                                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.type')}</th>
                                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.dates')}</th>
                                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.hours')}</th>
                                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.status')}</th>
                                    <th style={{ textAlign: 'right', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('leave.headers.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map(req => (
                                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{req.user?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.user?.worker_id}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <span style={{ 
                                                padding: '4px 10px', 
                                                borderRadius: '99px', 
                                                fontSize: '0.7rem', 
                                                fontWeight: 800,
                                                background: req.type === 'pto' ? 'rgba(3, 105, 161, 0.1)' : 'rgba(21, 128, 61, 0.1)',
                                                color: req.type === 'pto' ? '#0369a1' : '#15803d',
                                                border: req.type === 'pto' ? '1px solid rgba(3, 105, 161, 0.2)' : '1px solid rgba(21, 128, 61, 0.2)'
                                            }}>
                                                {req.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                                            </div>
                                            {req.reason && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>"{req.reason}"</div>}
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{req.hours_requested} {t('leave.headers.hours').toLowerCase()}</td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <span style={{ 
                                                padding: '4px 8px', 
                                                borderRadius: '6px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                background: req.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : '#f59e0b'
                                            }}>
                                                {t(`leave.filters.${req.status}`)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                                            {req.status === 'pending' ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button 
                                                        onClick={() => handleAction(req, 'approved')}
                                                        disabled={isProcessing === req.id}
                                                        className="btn btn-primary"
                                                        style={{ padding: '0.5rem 1rem', width: 'auto', background: '#10b981' }}
                                                    >
                                                        {t('leave.actions.approve')}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleAction(req, 'rejected')}
                                                        disabled={isProcessing === req.id}
                                                        className="btn btn-primary"
                                                        style={{ padding: '0.5rem 1rem', width: 'auto', background: '#ef4444' }}
                                                    >
                                                        {t('leave.actions.reject')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                    {t('leave.processedOn', { date: req.processed_at ? new Date(req.processed_at).toLocaleDateString() : 'N/A' })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '6rem 2rem', background: 'var(--bg-card)', borderRadius: '24px', border: '2px dashed var(--border)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>📁</div>
                    <h3 style={{ margin: 0, fontWeight: 900, color: 'var(--text-main)' }}>{t('leave.noRequests')}</h3>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{t('leave.noRequestsSub', { filter: filter !== 'all' ? t(`leave.filters.${filter}`) : '' })}</p>
                </div>
            )}
        </div>
    );
};
