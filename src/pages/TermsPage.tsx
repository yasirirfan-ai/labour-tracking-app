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

export const TermsPage: React.FC = () => (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '4rem 2rem', fontFamily: 'Inter, sans-serif', color: '#334155', lineHeight: 1.75, fontSize: '0.95rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'white', fontWeight: 900, fontSize: '1.4rem' }}>B</span>
                </div>
                <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Babylon LLC</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.02em' }}>Terms of Service</div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                <span><strong>Effective Date:</strong> April 22, 2026</span>
                <span><strong>Last Updated:</strong> April 22, 2026</span>
            </div>
        </div>

        <Section title="1. Acceptance of Terms">
            <p>By accessing or using the Babylon Labor Tracker application ("the App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the App. These Terms apply to all users of the App, including employees and authorized personnel of Babylon LLC.</p>
        </Section>

        <Section title="2. Eligibility & Access">
            {bullets([
                'Access to the App is restricted exclusively to authorized Babylon LLC employees and personnel',
                'You must have a valid Babylon LLC Google Workspace account to log in',
                'Access is granted at the sole discretion of Babylon LLC administrators',
                'Unauthorized access attempts are strictly prohibited and may result in disciplinary or legal action',
            ])}
        </Section>

        <Section title="3. User Responsibilities">
            <p style={{ marginBottom: '0.5rem' }}>As a user of the App, you agree to:</p>
            {bullets([
                'Use the App only for legitimate business purposes related to your role at Babylon LLC',
                'Provide accurate and truthful labor and time tracking data',
                'Not share your credentials or allow others to access the App using your account',
                'Not attempt to bypass authentication, access controls, or security measures',
                'Report any suspected unauthorized access or security issues to your administrator immediately',
                'Comply with all Babylon LLC internal policies related to data use and confidentiality',
            ])}
        </Section>

        <Section title="4. Acceptable Use">
            <p style={{ marginBottom: '0.5rem' }}>You may not use the App to:</p>
            {bullets([
                'Enter false, misleading, or fraudulent labor or MO data',
                'Access data belonging to other employees without authorization',
                'Attempt to reverse engineer, decompile, or tamper with the App',
                'Upload malicious code, scripts, or content',
                'Violate any applicable local, state, or federal laws',
            ])}
            <p style={{ marginTop: '0.75rem' }}>Violation of these terms may result in immediate revocation of access and disciplinary action in accordance with Babylon LLC's HR policies.</p>
        </Section>

        <Section title="5. Data Accuracy">
            <p>Users are responsible for ensuring that all labor entries, work hours, location data, and MO records they submit are accurate and complete. Babylon LLC relies on this data for operational and compliance purposes. Intentional falsification of records may result in disciplinary action.</p>
        </Section>

        <Section title="6. Intellectual Property">
            <p>The Babylon Labor Tracker application, including its design, code, features, and content, is the exclusive property of Babylon LLC. You may not copy, reproduce, modify, distribute, or create derivative works from the App without explicit written permission from Babylon LLC.</p>
        </Section>

        <Section title="7. Availability & Maintenance">
            {bullets([
                'Babylon LLC does not guarantee 100% uptime of the App',
                'The App may be temporarily unavailable due to maintenance, updates, or technical issues',
                'Babylon LLC reserves the right to modify, suspend, or discontinue any feature of the App at any time without prior notice',
            ])}
        </Section>

        <Section title="8. Limitation of Liability">
            <p style={{ marginBottom: '0.5rem' }}>To the fullest extent permitted by law, Babylon LLC shall not be liable for:</p>
            {bullets([
                'Any loss of data resulting from technical failures or user error',
                'Any indirect, incidental, or consequential damages arising from use of the App',
                'Temporary unavailability of the App',
            ])}
        </Section>

        <Section title="9. Termination of Access">
            <p style={{ marginBottom: '0.5rem' }}>Babylon LLC reserves the right to suspend or revoke your access to the App at any time, including but not limited to:</p>
            {bullets([
                'Termination of employment',
                'Violation of these Terms',
                'Security concerns',
                'Organizational changes',
            ])}
            <p style={{ marginTop: '0.75rem' }}>Upon termination, your access will be immediately deactivated and your data may be retained in accordance with our Privacy Policy and applicable law.</p>
        </Section>

        <Section title="10. Modifications to Terms">
            <p>Babylon LLC reserves the right to update these Terms at any time. Users will be notified of significant changes via the App or email. Continued use of the App after notification constitutes acceptance of the revised Terms.</p>
        </Section>

        <Section title="11. Governing Law">
            <p>These Terms shall be governed by and construed in accordance with the laws of the United States of America. Any disputes arising from these Terms or use of the App shall be subject to the exclusive jurisdiction of the courts of the United States.</p>
        </Section>

        <Section title="12. Contact Us">
            <p>For questions regarding these Terms of Service, please contact:</p>
            <div style={{ marginTop: '0.75rem', padding: '1rem 1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#1e1b4b' }}>Babylon LLC</div>
                <div style={{ color: '#64748b' }}>United States of America</div>
                <div style={{ marginTop: '0.25rem' }}>📧 <a href="mailto:admin@babylonllc.com" style={{ color: '#3b82f6', fontWeight: 700 }}>admin@babylonllc.com</a></div>
            </div>
        </Section>

        <div style={{ marginTop: '3rem', padding: '1rem 1.5rem', background: '#fef3c7', borderRadius: '12px', border: '1px solid #fde68a', fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
            These Terms of Service are effective as of April 22, 2026 and apply to all authorized users of the Babylon Labor Tracker application.
        </div>
    </div>
);
