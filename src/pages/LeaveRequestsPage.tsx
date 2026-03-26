import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LeaveRequest } from '../types';

export const LeaveRequestsPage: React.FC = () => {
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
        const adminNotes = window.prompt(`Add a note for this ${status} (optional):`);
        if (adminNotes === null) return; // Cancelled

        setIsProcessing(request.id);
        
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

            // 2. If approved, deduct balance and add to history
            if (status === 'approved') {
                const balanceField = request.type === 'pto' ? 'pto_balance' : 'sick_balance';
                
                // Get current balance
                const { data: userData, error: userFetchError } = await supabase
                    .from('users')
                    .select(balanceField)
                    .eq('id', request.user_id)
                    .single();

                if (userFetchError) throw userFetchError;

                const currentBalance = parseFloat(userData[balanceField] || '0');
                const newBalance = (currentBalance - request.hours_requested).toFixed(2);

                // Update balance
                const { error: balanceError } = await (supabase.from('users') as any)
                    .update({ [balanceField]: newBalance })
                    .eq('id', request.user_id);

                if (balanceError) throw balanceError;

                // 3. Add to leave_history
                const { error: historyError } = await (supabase.from('leave_history') as any).insert([{
                    user_id: request.user_id,
                    type: request.type,
                    amount: -request.hours_requested,
                    description: `Approved ${request.type.toUpperCase()} for ${request.start_date} - ${request.end_date}`,
                    entry_date: request.start_date, // Setting entry date to the start of the leave
                    created_at: new Date().toISOString()
                }]);

                if (historyError) throw historyError;
            }

            alert(`Request ${status} successfully.`);
            fetchRequests();
        } catch (err: any) {
            alert('Error processing request: ' + err.message);
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="leave-requests-page" style={{ padding: '2rem' }}>
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#0f172a' }}>Leave Management</h1>
                    <p style={{ color: '#64748b', marginTop: '0.4rem', fontWeight: 600 }}>Review and process employee PTO and Sick time requests</p>
                </div>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.4rem', borderRadius: '12px', gap: '0.4rem' }}>
                    {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '0.6rem 1.25rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: filter === f ? 'white' : 'transparent',
                                color: filter === f ? '#1e1b4b' : '#64748b',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: filter === f ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                textTransform: 'capitalize'
                            }}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </header>

            {isLoading ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>Loading requests...</div>
            ) : requests.length > 0 ? (
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Employee</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Dates</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Hours</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ textAlign: 'right', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{req.user?.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{req.user?.worker_id}</div>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <span style={{ 
                                            padding: '4px 10px', 
                                            borderRadius: '99px', 
                                            fontSize: '0.7rem', 
                                            fontWeight: 800,
                                            background: req.type === 'pto' ? '#e0f2fe' : '#f0fdf4',
                                            color: req.type === 'pto' ? '#0369a1' : '#15803d'
                                        }}>
                                            {req.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                            {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                                        </div>
                                        {req.reason && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', fontStyle: 'italic' }}>"{req.reason}"</div>}
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: '#1e1b4b' }}>{req.hours_requested} hrs</td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
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
                                    <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                                        {req.status === 'pending' ? (
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={() => handleAction(req, 'approved')}
                                                    disabled={isProcessing === req.id}
                                                    style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: '#10b981', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    Approve
                                                </button>
                                                <button 
                                                    onClick={() => handleAction(req, 'rejected')}
                                                    disabled={isProcessing === req.id}
                                                    style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                Processed on {req.processed_at ? new Date(req.processed_at).toLocaleDateString() : 'N/A'}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '6rem 2rem', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>📁</div>
                    <h3 style={{ margin: 0, fontWeight: 900, color: '#262661' }}>No Requests Found</h3>
                    <p style={{ color: '#64748B', marginTop: '0.5rem' }}>There are no {filter !== 'all' ? filter : ''} leave requests matching your current view.</p>
                </div>
            )}
        </div>
    );
};
