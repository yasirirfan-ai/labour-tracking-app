import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';

type PortalView = 'portals' | 'admin' | 'manager';

const PORTAL_COPY: Record<'admin' | 'manager', { title: string; subheading: string }> = {
    admin: { title: 'Admin Sign In', subheading: 'Enter your admin credentials to continue' },
    manager: { title: 'Manager Sign In', subheading: 'Enter your manager credentials to continue' },
};

export const LoginPage: React.FC = () => {
    const [view, setView] = useState<PortalView>('portals');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, loginWithGoogle, user, authError, clearAuthError } = useAuth();
    const navigate = useNavigate();

    if (user) {
        if (user.role === 'manager' || user.role === 'admin') return <Navigate to="/" replace />;
        return <Navigate to="/worker-portal" replace />;
    }

    const openPortal = (portal: PortalView) => {
        setError('');
        if (clearAuthError) clearAuthError();
        setUsername('');
        setPassword('');
        setView(portal);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (clearAuthError) clearAuthError();

        const result = await login(username, password, view as 'admin' | 'manager');

        if (!result.success) {
            setError(result.error || 'Invalid username or password');
            return;
        }

        navigate('/');
    };

    return (
        <div className="portal-body-wrapper">
            <style dangerouslySetInnerHTML={{
                __html: `
                :root {
                    --primary: #2563EB;
                }

                .portal-body-wrapper {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    overflow: auto;
                    background: #05070c;
                    font-family: 'Inter', sans-serif;
                    color: #f8fafc;
                }

                .portal-video-bg {
                    position: fixed;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    z-index: 0;
                }

                .portal-video-bg video {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center 30%;
                }

                .portal-video-scrim {
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(ellipse at 50% 30%, rgba(5, 7, 12, 0.45) 0%, rgba(5, 7, 12, 0.75) 60%, rgba(5, 7, 12, 0.94) 100%);
                }

                .portal-video-mask {
                    position: absolute;
                    right: 0;
                    bottom: 0;
                    width: 24%;
                    height: 20%;
                    background: radial-gradient(circle at 100% 100%, rgba(5, 7, 12, 0.98) 0%, rgba(5, 7, 12, 0.7) 45%, rgba(5, 7, 12, 0) 78%);
                }

                .portal-scroll {
                    position: relative;
                    z-index: 1;
                    min-height: 100vh;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 3rem 1.5rem 2.5rem;
                }

                .portal-logo-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.85rem;
                    background: rgba(255, 255, 255, 0.08);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border: 1px solid rgba(255, 255, 255, 0.16);
                    padding: 0.5rem 1.25rem 0.5rem 0.5rem;
                    border-radius: 999px;
                    margin-bottom: 2.25rem;
                    box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.6);
                }

                .portal-logo-chip img {
                    height: 46px;
                    width: auto;
                    display: block;
                    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.45));
                }

                .portal-logo-wordmark {
                    font-size: 1.1rem;
                    font-weight: 800;
                    letter-spacing: -0.01em;
                    color: #ffffff;
                }

                .portal-hero {
                    max-width: 680px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    margin-bottom: 3rem;
                }

                .portal-eyebrow {
                    font-size: 0.75rem;
                    font-weight: 700;
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    color: #7dd3fc;
                    margin-bottom: 1rem;
                }

                .portal-hero-heading {
                    font-size: clamp(2rem, 4.2vw, 3.1rem);
                    font-weight: 800;
                    line-height: 1.15;
                    letter-spacing: -0.02em;
                    color: #ffffff;
                    margin: 0 0 1.1rem 0;
                }

                .portal-hero-sub {
                    font-size: 1rem;
                    color: #cbd5e1;
                    line-height: 1.7;
                    max-width: 50ch;
                    margin: 0;
                }

                .portal-grid {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 1.5rem;
                    max-width: 1000px;
                    width: 100%;
                }

                .portal-card {
                    flex: 1 1 260px;
                    max-width: 300px;
                    background: rgba(255, 255, 255, 0.06);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 20px;
                    padding: 1.85rem 1.6rem;
                    display: flex;
                    flex-direction: column;
                    text-align: left;
                    cursor: pointer;
                    transition: transform 0.25s, background 0.25s, border-color 0.25s;
                }

                .portal-card:hover {
                    transform: translateY(-6px);
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                .portal-icon {
                    width: 46px;
                    height: 46px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.15rem;
                    color: var(--accent);
                    margin-bottom: 1.4rem;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.16);
                }

                .portal-card h3 {
                    font-size: 1.05rem;
                    font-weight: 800;
                    color: #f8fafc;
                    margin: 0 0 0.45rem 0;
                }

                .portal-card p {
                    color: #b6c0cf;
                    font-size: 0.83rem;
                    line-height: 1.55;
                    margin: 0 0 1.5rem 0;
                    flex-grow: 1;
                }

                .portal-enter-btn {
                    background: var(--accent);
                    border: none;
                    border-radius: 999px;
                    font-weight: 700;
                    font-size: 0.85rem;
                    color: #05070c;
                    cursor: pointer;
                    padding: 0.7rem 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    transition: filter 0.2s, transform 0.2s;
                }

                .portal-enter-btn:hover {
                    filter: brightness(1.12);
                }

                .portal-footer-note {
                    color: rgba(226, 232, 240, 0.55);
                    font-size: 0.78rem;
                    margin-top: 2.75rem;
                }

                .back-link {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #94a3b8;
                    font-size: 0.85rem;
                    font-weight: 600;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    width: 100%;
                }

                .back-link:hover {
                    color: #f8fafc;
                }

                .login-card {
                    width: 100%;
                    max-width: 420px;
                    padding: 2.25rem 1.75rem;
                    background: rgba(13, 17, 23, 0.78);
                    backdrop-filter: blur(22px);
                    -webkit-backdrop-filter: blur(22px);
                    box-sizing: border-box;
                    border-radius: 20px;
                    box-shadow: 0 25px 50px -20px rgba(0, 0, 0, 0.7);
                    text-align: center;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                }

                .login-card-header {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1.1rem;
                    margin-bottom: 1.75rem;
                }

                .login-card-header .portal-logo-chip {
                    margin: 0;
                    padding: 0.35rem 0.9rem 0.35rem 0.35rem;
                    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.6);
                }

                .login-card-header .portal-logo-chip img {
                    height: 32px;
                }

                .login-card-header .portal-logo-wordmark {
                    font-size: 0.95rem;
                }

                .login-heading {
                    font-size: 1.4rem;
                    font-weight: 800;
                    margin-bottom: 0.5rem;
                    color: #f8fafc;
                }

                .login-subheading {
                    font-size: 0.9rem;
                    color: #94a3b8;
                    margin-bottom: 2rem;
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
                    color: #cbd5e1;
                    margin-bottom: 0.5rem;
                }

                .input-group input {
                    width: 100%;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 12px;
                    padding: 0.75rem 1rem;
                    color: #f8fafc;
                    font-size: 1rem;
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }

                .input-group input::placeholder {
                    color: #64748b;
                }

                .input-group input:focus {
                    border-color: var(--primary);
                }

                .password-toggle {
                    position: absolute;
                    right: 1rem;
                    top: 2.4rem;
                    cursor: pointer;
                    color: #94a3b8;
                }

                .forgot-password {
                    display: block;
                    text-align: right;
                    font-size: 0.875rem;
                    color: #60a5fa;
                    text-decoration: none;
                    margin-top: -1rem;
                    margin-bottom: 2rem;
                }

                .submit-btn {
                    width: 100%;
                    background: #f8fafc;
                    border: none;
                    border-radius: 12px;
                    padding: 0.875rem;
                    color: #05070c;
                    font-size: 1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .submit-btn:hover {
                    background: #e2e8f0;
                }

                .error-message {
                    background: rgba(239, 68, 68, 0.14);
                    color: #fca5a5;
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    font-size: 0.875rem;
                    border: 1px solid rgba(239, 68, 68, 0.35);
                    margin-bottom: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .divider {
                    display: flex;
                    align-items: center;
                    text-align: center;
                    margin: 1.5rem 0;
                    color: #64748b;
                    font-size: 0.875rem;
                }

                .divider::before,
                .divider::after {
                    content: '';
                    flex: 1;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                }

                .divider span {
                    padding: 0 0.75rem;
                    font-weight: 500;
                }

                .google-btn {
                    width: 100%;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 12px;
                    padding: 0.875rem;
                    color: #f8fafc;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    transition: all 0.2s;
                }

                .google-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(255, 255, 255, 0.24);
                }

                /* Ensure font awesome loads if not already */
                @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css");
            ` }} />

            <div className="portal-video-bg">
                <video src="/videos/warehouse-hero.mp4" autoPlay muted loop playsInline />
                <div className="portal-video-scrim" />
                <div className="portal-video-mask" />
            </div>

            <div className="portal-scroll">
                {view === 'portals' ? (
                    <>
                        <div className="portal-hero">
                            <div className="portal-logo-chip">
                                <img src="/babylon.svg" alt="Babylon Logo" />
                                <span className="portal-logo-wordmark">Babylon</span>
                            </div>
                            <div className="portal-eyebrow">Babylon Workforce Platform</div>
                            <h1 className="portal-hero-heading">One platform. Every shift, tracked right.</h1>
                            <p className="portal-hero-sub">
                                Admins run payroll, managers oversee the floor, and workers clock in —
                                all from a single portal built for real, busy teams.
                            </p>
                        </div>

                        <div className="portal-grid">
                            <div
                                className="portal-card"
                                style={{ ['--accent' as any]: '#4ade80' }}
                                onClick={() => openPortal('admin')}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPortal('admin'); }}
                            >
                                <div className="portal-icon">
                                    <i className="fa-solid fa-shield-halved"></i>
                                </div>
                                <h3>Admin Portal</h3>
                                <p>Full control over payroll, staff records, and live activity across every site.</p>
                                <button className="portal-enter-btn" type="button" tabIndex={-1}>
                                    Enter Dashboard
                                    <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>

                            <div
                                className="portal-card"
                                style={{ ['--accent' as any]: '#60a5fa' }}
                                onClick={() => openPortal('manager')}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPortal('manager'); }}
                            >
                                <div className="portal-icon">
                                    <i className="fa-solid fa-briefcase"></i>
                                </div>
                                <h3>Manager Portal</h3>
                                <p>Oversee daily operations, monitor efficiency, and pull reports in real time.</p>
                                <button className="portal-enter-btn" type="button" tabIndex={-1}>
                                    Enter Dashboard
                                    <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>

                            <div
                                className="portal-card"
                                style={{ ['--accent' as any]: '#4ade80' }}
                                onClick={() => navigate('/worker-select')}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/worker-select'); }}
                            >
                                <div className="portal-icon">
                                    <i className="fa-solid fa-users"></i>
                                </div>
                                <h3>Worker Portal</h3>
                                <p>Clock in, check your hours, and request time off in a couple of taps.</p>
                                <button className="portal-enter-btn" type="button" tabIndex={-1}>
                                    Employee Login
                                    <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>

                        <p className="portal-footer-note">© {new Date().getFullYear()} Babylon · All rights reserved</p>
                    </>
                ) : (
                    <div className="login-card">
                        <div className="login-card-header">
                            <button className="back-link" onClick={() => openPortal('portals')} type="button">
                                <i className="fa-solid fa-arrow-left"></i>
                                Back to portal selection
                            </button>

                            <div className="portal-logo-chip">
                                <img src="/babylon.svg" alt="Babylon Logo" />
                                <span className="portal-logo-wordmark">Babylon</span>
                            </div>
                        </div>

                        <h1 className="login-heading">{PORTAL_COPY[view].title}</h1>
                        <p className="login-subheading">{PORTAL_COPY[view].subheading}</p>

                        {(error || authError) && (
                            <div className="error-message">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                {error || authError}
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

                            <button type="submit" className="submit-btn" onClick={() => { if (clearAuthError) clearAuthError(); }}>
                                Sign In
                            </button>

                            <div className="divider">
                                <span>OR</span>
                            </div>

                            <button
                                type="button"
                                className="google-btn"
                                onClick={() => loginWithGoogle(view as 'admin' | 'manager')}
                            >
                                <i className="fa-brands fa-google"></i>
                                Sign in with Google
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};
