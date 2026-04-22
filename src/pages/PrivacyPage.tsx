import React from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e1b4b', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #e2e8f0' }}>{title}</h2>
        {children}
    </section>
);

const bullets = (items: string[]) => (
    <ul style={{ paddingLeft: '1.5rem', margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
);

export const PrivacyPage: React.FC = () => (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '4rem 2rem', fontFamily: 'Inter, sans-serif', color: '#334155', lineHeight: 1.75, fontSize: '0.95rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'white', fontWeight: 900, fontSize: '1.4rem' }}>B</span>
                </div>
                <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Babylon LLC</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.02em' }}>Privacy Policy</div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                <span><strong>Effective Date:</strong> April 22, 2026</span>
                <span><strong>Last Updated:</strong> April 22, 2026</span>
            </div>
        </div>

        <Section title="1. Introduction">
            <p>Babylon LLC ("we," "our," or "us") operates the Babylon Labor Tracker application ("the App"), an internal workforce management tool built exclusively for Babylon LLC employees and authorized personnel. This Privacy Policy explains how we collect, use, store, and protect your information when you use the App. By using the App, you agree to the collection and use of information in accordance with this policy.</p>
        </Section>

        <Section title="2. Who This App Is For">
            <p>This application is strictly for <strong>internal use by Babylon LLC employees and authorized team members only</strong>. Access is restricted to users with an authorized Babylon LLC Google Workspace account. It is not available to the general public.</p>
        </Section>

        <Section title="3. Information We Collect">
            <p style={{ marginBottom: '0.75rem' }}>We collect the following categories of data:</p>

            <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>3.1 Identity &amp; Account Information</p>
            {bullets(['Full name', 'Work email address (via Google OAuth)', 'Google profile information (name, profile picture)'])}

            <p style={{ fontWeight: 700, marginBottom: '0.25rem', marginTop: '0.75rem' }}>3.2 Work &amp; Labor Data</p>
            {bullets(['Work hours logged (clock-in/clock-out times)', 'Manufacturing Order (MO) assignments', 'Labor task records and completion status', 'Productivity and performance data'])}

            <p style={{ fontWeight: 700, marginBottom: '0.25rem', marginTop: '0.75rem' }}>3.3 Location Data</p>
            {bullets(['Work site or facility location associated with labor entries', 'No real-time GPS tracking is performed'])}

            <p style={{ fontWeight: 700, marginBottom: '0.25rem', marginTop: '0.75rem' }}>3.4 Technical Data</p>
            {bullets(['IP address and device type (for security logging)', 'Browser/app usage logs', 'Session and authentication tokens'])}
        </Section>

        <Section title="4. How We Use Your Information">
            <p style={{ marginBottom: '0.5rem' }}>We use the collected data solely for the following internal business purposes:</p>
            {bullets([
                'Managing labor assignments and Manufacturing Orders',
                'Tracking work hours and generating internal reports',
                'Authenticating users via Google OAuth',
                'Improving application performance and reliability',
                'Ensuring compliance with internal HR and operations policies',
            ])}
            <p style={{ marginTop: '0.75rem' }}>We do not sell, rent, or share your personal data with any third parties for marketing or commercial purposes.</p>
        </Section>

        <Section title="5. Data Storage & Security">
            {bullets([
                'All data is stored securely in Supabase, a SOC 2 Type II compliant database platform',
                'The application is hosted on Vercel, which uses industry-standard encryption (TLS/SSL)',
                'Authentication is handled via Google OAuth 2.0 — we do not store your Google password',
                'Access to the database is restricted to authorized Babylon LLC administrators only',
                'We implement role-based access controls to limit data visibility',
            ])}
        </Section>

        <Section title="6. Data Retention">
            {bullets([
                'Employee labor and MO data is retained for as long as required for business operations and compliance purposes',
                'Upon termination of employment or removal of access, user accounts are deactivated',
                'You may request deletion of your personal data by contacting us at the email below',
            ])}
        </Section>

        <Section title="7. Third-Party Services">
            <p style={{ marginBottom: '0.75rem' }}>The App integrates with the following third-party services, each governed by their own privacy policies:</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#1e1b4b' }}>Service</th>
                        <th style={{ textAlign: 'left', padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#1e1b4b' }}>Purpose</th>
                    </tr>
                </thead>
                <tbody>
                    {[
                        ['Google OAuth', 'Authentication'],
                        ['Supabase', 'Database & Storage'],
                        ['Vercel', 'App Hosting'],
                    ].map(([svc, purpose]) => (
                        <tr key={svc}>
                            <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{svc}</td>
                            <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{purpose}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Section>

        <Section title="8. Your Rights">
            <p style={{ marginBottom: '0.5rem' }}>As a user of this internal application, you have the right to:</p>
            {bullets([
                'Access the personal data we hold about you',
                'Request correction of inaccurate data',
                'Request deletion of your personal data (subject to operational requirements)',
                'Raise concerns about how your data is handled',
            ])}
            <p style={{ marginTop: '0.75rem' }}>To exercise any of these rights, contact your Babylon LLC system administrator or email us directly.</p>
        </Section>

        <Section title="9. Cookies & Local Storage">
            <p>The App may use cookies and browser local storage to maintain your session and preferences. These are strictly functional and are not used for advertising or tracking.</p>
        </Section>

        <Section title="10. Children's Privacy">
            <p>This application is intended for use by employees aged 18 and over. We do not knowingly collect data from individuals under 18.</p>
        </Section>

        <Section title="11. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. Any changes will be communicated to users via the App or email. Continued use of the App after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="12. Contact Us">
            <p>If you have any questions or concerns about this Privacy Policy, please contact:</p>
            <div style={{ marginTop: '0.75rem', padding: '1rem 1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#1e1b4b' }}>Babylon LLC</div>
                <div style={{ color: '#64748b' }}>United States of America</div>
                <div style={{ marginTop: '0.25rem' }}>📧 <a href="mailto:admin@babylonllc.com" style={{ color: '#3b82f6', fontWeight: 700 }}>admin@babylonllc.com</a></div>
            </div>
        </Section>

        <div style={{ marginTop: '3rem', padding: '1rem 1.5rem', background: '#fef3c7', borderRadius: '12px', border: '1px solid #fde68a', fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
            This Privacy Policy was prepared for internal application use and is effective as of April 22, 2026.
        </div>
    </div>
);
