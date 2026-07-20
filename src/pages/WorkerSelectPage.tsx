import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { PinPad } from '../components/PinPad';
import type { User } from '../types';

export const WorkerSelectPage: React.FC = () => {
    const [workers, setWorkers] = useState<User[]>([]);
    const [filteredWorkers, setFilteredWorkers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
    const [pinError, setPinError] = useState<string | null>(null);
    const { loginWithPin, user: currentUser } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchWorkers = async () => {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'employee')
                .eq('active', true)
                .order('name');

            if (!error && data) {
                setWorkers(data as User[]);
                setFilteredWorkers(data as User[]);
            }
            setLoading(false);
        };
        fetchWorkers();
    }, []);

    useEffect(() => {
        const results = workers.filter(w =>
            w.name.toLowerCase().includes(search.toLowerCase()) ||
            w.worker_id.toLowerCase().includes(search.toLowerCase())
        );
        setFilteredWorkers(results);
    }, [search, workers]);

    if (currentUser) {
        if (currentUser.role === 'manager' || currentUser.role === 'admin') return <Navigate to="/" replace />;
        return <Navigate to="/worker-portal" replace />;
    }

    const handlePinComplete = async (pin: string) => {
        if (!selectedWorker) return;

        setPinError(null);
        const result = await loginWithPin(selectedWorker.id, pin);

        if (result.success) {
            navigate('/worker-portal');
        } else {
            setPinError(result.error || 'Invalid PIN');
        }
    };

    if (loading) {
        return (
            <div style={{ 
                height: '100vh', 
                width: '100vw',
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                background: 'radial-gradient(circle at 50% 50%, #f8fafc 0%, #e2e8f0 100%)',
                fontFamily: "'Inter', sans-serif"
            }}>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 0.6; }
                        50% { opacity: 1; }
                    }
                    .custom-spinner {
                        width: 50px;
                        height: 50px;
                        border: 4px solid rgba(37, 99, 235, 0.1);
                        border-top-color: #2563eb;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 1.5rem;
                        box-shadow: 0 4px 10px rgba(37, 99, 235, 0.1);
                    }
                    .loading-text {
                        font-size: 1.15rem;
                        fontWeight: 800;
                        color: #1e293b;
                        letter-spacing: 0.05em;
                        text-transform: uppercase;
                        animation: pulse 1.5s ease-in-out infinite;
                        font-family: 'Inter', sans-serif;
                    }
                `}</style>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="custom-spinner"></div>
                    <div className="loading-text">
                        Loading Profiles...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            background: '#f8fafc',
            padding: '4rem 2rem',
            fontFamily: "'Inter', sans-serif",
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxSizing: 'border-box',
            overflowX: 'hidden'
        }}>
            {/* Admin Login Button - Top Left */}
            <div style={{ position: 'absolute', top: '2rem', left: '2rem' }}>
                <button
                    onClick={() => navigate('/login')}
                    style={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '12px',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: '#64748b',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    Admin Login
                </button>
            </div>

            {/* PIN OVERLAY */}
            {selectedWorker && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    background: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <PinPad
                        onComplete={handlePinComplete}
                        onCancel={() => { setSelectedWorker(null); setPinError(null); }}
                        error={pinError}
                    />
                </div>
            )}

            <div style={{ width: '100%', maxWidth: '1280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem', width: '100%' }}>
                    <img src="/babylon.svg" alt="Logo" style={{ width: '160px', marginBottom: '2rem' }} />
                    <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.05em', marginBottom: '1rem' }}>Select Your Profile</h1>
                    <p style={{ color: '#64748b', fontSize: '1.25rem', fontWeight: 500 }}>Choose your name to clock in and manage your shift.</p>
                </div>

                <div style={{ marginBottom: '4rem', position: 'relative', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '1.5rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '1.2rem' }}></i>
                    <input
                        type="text"
                        placeholder="Search by name or employee ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '1.5rem 1.5rem 1.5rem 4rem',
                            borderRadius: '24px',
                            border: '1px solid #e2e8f0',
                            fontSize: '1.25rem',
                            background: 'white',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                            outline: 'none',
                            transition: 'all 0.2s',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <div className="profile-grid">
                    {filteredWorkers.map((worker, index) => {
                        const words = worker.name.split(' ');
                        const initials = words.length > 1
                            ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                            : worker.name.slice(0, 2).toUpperCase();

                        const colors = ['#eff6ff', '#f5f3ff', '#fdf2f7', '#ecfdf5', '#fff7ed'];
                        const textColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
                        const colorIndex = worker.name.charCodeAt(0) % colors.length;

                        return (
                            <div
                                key={worker.id}
                                onClick={() => setSelectedWorker(worker)}
                                className="profile-card"
                                style={{
                                    animationDelay: `${index * 0.05}s`
                                }}
                            >
                                <div style={{
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '20px',
                                    background: colors[colorIndex],
                                    color: textColors[colorIndex],
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem',
                                    fontWeight: 900,
                                    flexShrink: 0,
                                    border: `1px solid ${textColors[colorIndex]}20`
                                }}>
                                    {initials}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '1.2rem',
                                        fontWeight: 800,
                                        color: '#1e293b',
                                        marginBottom: '4px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }} title={worker.name}>
                                        {worker.name}
                                    </div>
                                    <div style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: '#94a3b8',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        {worker.department || 'Warehouse'}
                                    </div>
                                </div>
                                <div style={{ color: '#cbd5e1' }}>
                                    <i className="fa-solid fa-chevron-right"></i>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {filteredWorkers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b' }}>
                        <i className="fa-solid fa-user-slash" style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}></i>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>No workers found</p>
                    </div>
                )}
            </div>

            <style>{`
                .profile-grid {
                    display: grid;
                    grid-template-columns: repeat(1, 1fr);
                    gap: 1.5rem;
                    width: 100%;
                    margin-top: 3rem;
                }
                @media (min-width: 768px) {
                    .profile-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (min-width: 1100px) {
                    .profile-grid {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }
                .profile-card {
                    background: white;
                    border-radius: 28px;
                    padding: 1.75rem;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    alignItems: center;
                    gap: 1.25rem;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    animation: fadeInUp 0.5s ease-out both;
                }
                .profile-card:hover {
                    transform: translateY(-8px) scale(1.02);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    border-color: #3b82f6;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                input:focus {
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1) !important;
                }
            `}</style>
        </div>
    );
};
