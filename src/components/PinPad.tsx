import React, { useState, useEffect } from 'react';

interface PinPadProps {
    onComplete: (pin: string) => void;
    onCancel: () => void;
    error?: string | null;
}

export const PinPad: React.FC<PinPadProps> = ({ onComplete, onCancel, error }) => {
    const [pin, setPin] = useState('');

    const handleNumberClick = (num: string) => {
        if (pin.length < 4) {
            const newPin = pin + num;
            setPin(newPin);
            if (newPin.length === 4) {
                onComplete(newPin);
            }
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
    };

    // Add keyboard support
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Handle numbers 0-9
            if (e.key >= '0' && e.key <= '9') {
                handleNumberClick(e.key);
            }
            // Handle Backspace
            else if (e.key === 'Backspace') {
                handleBackspace();
            }
            // Handle Escape to cancel
            else if (e.key === 'Escape') {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin]); // Re-run effect when pin changes to capture the latest state in closures if needed, 
    // although we use the function form of setPin, handleNumberClick still checks pin.length.

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem',
            padding: '2rem',
            background: 'white',
            borderRadius: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
            maxWidth: '360px',
            width: '100%',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>Enter Your 4-digit PIN</h2>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: i < pin.length ? '#2563EB' : '#e2e8f0',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: i < pin.length ? 'scale(1.1)' : 'scale(1)',
                                boxShadow: i < pin.length ? '0 0 8px rgba(37, 99, 235, 0.4)' : 'none'
                            }}
                        />
                    ))}
                </div>
            </div>

            {error && (
                <div style={{
                    color: '#ef4444',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    background: '#fef2f2',
                    padding: '0.5rem 1rem',
                    borderRadius: '12px',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    {error}
                </div>
            )}

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                width: '100%'
            }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                        key={num}
                        onClick={() => handleNumberClick(num)}
                        style={{
                            padding: '1.25rem',
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            borderRadius: '16px',
                            border: '1px solid #f1f5f9',
                            background: '#f8fafc',
                            color: '#0f172a',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseOut={(e) => e.currentTarget.style.background = '#f8fafc'}
                    >
                        {num}
                    </button>
                ))}
                <button
                    onClick={handleBackspace}
                    style={{
                        padding: '1.25rem',
                        fontSize: '1.25rem',
                        borderRadius: '16px',
                        border: '1px solid #f1f5f9',
                        background: '#f8fafc',
                        color: '#64748b',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa-solid fa-backspace"></i>
                </button>
                <button
                    onClick={() => handleNumberClick('0')}
                    style={{
                        padding: '1.25rem',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        borderRadius: '16px',
                        border: '1px solid #f1f5f9',
                        background: '#f8fafc',
                        color: '#0f172a',
                        cursor: 'pointer'
                    }}
                >
                    0
                </button>
                <button
                    onClick={() => setPin('')}
                    style={{
                        padding: '1.25rem',
                        fontSize: '1rem',
                        fontWeight: 700,
                        borderRadius: '16px',
                        border: '1px solid #f1f5f9',
                        background: '#f8fafc',
                        color: '#ef4444',
                        cursor: 'pointer'
                    }}
                >
                    Clear
                </button>
            </div>

            <button
                onClick={onCancel}
                style={{
                    marginTop: '1rem',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}
            >
                <i className="fa-solid fa-arrow-left"></i>
                Choose a different profile
            </button>
        </div>
    );
};
