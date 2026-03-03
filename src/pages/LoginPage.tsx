import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginRole, setLoginRole] = useState<'admin' | 'worker'>('worker');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, user } = useAuth();

    if (user) {
        if (user.role === 'manager') return <Navigate to="/" replace />;
        return <Navigate to="/worker-portal" replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // We need to check role before setting the user in context if possible, 
        // but current AuthContext.login just sets it. 
        // We'll handle it here by logging out if the role is wrong.
        const success = await login(username, password);

        if (!success) {
            setError('Invalid username or password');
            return;
        }

        // Check if role matches selected portal
        const savedUser = JSON.parse(localStorage.getItem('bt_user') || '{}');
        const userRole = savedUser.role;

        if (loginRole === 'admin' && userRole !== 'manager') {
            setError('Access Denied: Restricted Portal - This account is not authorized for Admin Access');
            localStorage.removeItem('bt_user');
            setTimeout(() => window.location.reload(), 1500);
        } else if (loginRole === 'worker' && userRole !== 'employee') {
            setError('Access Denied: Restricted Portal - This account is not authorized for Worker Access');
            localStorage.removeItem('bt_user');
            setTimeout(() => window.location.reload(), 1500);
        }
    };

    return (
        <div className="login-body-wrapper">
            <style dangerouslySetInnerHTML={{
                __html: `
                :root {
                    --babylon-navy: #1E293B;
                    --babylon-gold: #EDAD2F;
                    --primary: #2563EB;
                }

                .login-body-wrapper {
                    background-color: #f8fafc;
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Inter', sans-serif;
                    color: var(--babylon-navy);
                    overflow: hidden;
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 10000;
                }

                .login-card {
                    width: 100%;
                    max-width: 440px;
                    padding: 3rem 2.5rem;
                    background: white;
                    border-radius: 24px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    text-align: center;
                    border: 1px solid #e2e8f0;
                }

                .logo-container {
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: center;
                }

                .logo-container img {
                    width: 140px;
                    height: auto;
                }

                .login-heading {
                    font-size: 1.5rem;
                    font-weight: 800;
                    margin-bottom: 0.5rem;
                    color: #0f172a;
                }

                .login-subheading {
                    font-size: 0.9rem;
                    color: #64748b;
                    margin-bottom: 2.5rem;
                }

                .role-toggle {
                    display: flex;
                    background: #f1f5f9;
                    padding: 0.25rem;
                    border-radius: 12px;
                    margin-bottom: 2.5rem;
                }

                .role-btn {
                    flex: 1;
                    padding: 0.75rem;
                    border: none;
                    background: transparent;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                    border-radius: 10px;
                    transition: all 0.2s;
                }

                .role-btn.active {
                    background: white;
                    color: #0f172a;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .login-form {
                    text-align: left;
                }

                .input-group {
                    margin-bottom: 1.5rem;
                    position: relative;
                }

                .input-group label {
                    display: block;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #334155;
                    margin-bottom: 0.5rem;
                }

                .input-group input {
                    width: 100%;
                    background: white;
                    border: 1px solid #cbd5e1;
                    border-radius: 12px;
                    padding: 0.75rem 1rem;
                    color: #0f172a;
                    font-size: 1rem;
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }

                .input-group input:focus {
                    border-color: var(--primary);
                    ring: 2px solid var(--primary);
                }

                .password-toggle {
                    position: absolute;
                    right: 1rem;
                    top: 2.4rem;
                    cursor: pointer;
                    color: #64748b;
                }

                .forgot-password {
                    display: block;
                    text-align: right;
                    font-size: 0.875rem;
                    color: var(--primary);
                    text-decoration: none;
                    margin-top: -1rem;
                    margin-bottom: 2rem;
                }

                .submit-btn {
                    width: 100%;
                    background: #0f172a;
                    border: none;
                    border-radius: 12px;
                    padding: 0.875rem;
                    color: white;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .submit-btn:hover {
                    background: #1e293b;
                }

                .error-message {
                    background: #fef2f2;
                    color: #991b1b;
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    font-size: 0.875rem;
                    border: 1px solid #fee2e2;
                    margin-bottom: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
            ` }} />
            <div className="login-card">
                <div className="logo-container">
                    <img src="/babylon.svg" alt="Babylon Logo" />
                </div>

                <h1 className="login-heading">Welcome Back</h1>
                <p className="login-subheading">Please enter your credentials to continue</p>

                <div className="role-toggle">
                    <button
                        className={`role-btn ${loginRole === 'worker' ? 'active' : ''}`}
                        onClick={() => setLoginRole('worker')}
                    >
                        Worker
                    </button>
                    <button
                        className={`role-btn ${loginRole === 'admin' ? 'active' : ''}`}
                        onClick={() => setLoginRole('admin')}
                    >
                        Admin
                    </button>
                </div>

                {error && (
                    <div className="error-message">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label>Username</label>
                        <input
                            type="text"
                            name="username"
                            required
                            placeholder="Enter username"
                            autoComplete="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            required
                            placeholder="••••••••"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <span className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                            <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </span>
                    </div>

                    <a href="#" className="forgot-password">Forgot password?</a>

                    <button type="submit" className="submit-btn">
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
};
