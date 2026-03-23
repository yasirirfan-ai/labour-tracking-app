import React from 'react';
import type { User } from '../types';

interface Props {
    employees: any[];
    onEmployeeClick: (employee: User) => void;
    onDelete: (id: string, currentStatus: boolean) => void;
}

export const EmployeeCardGrid: React.FC<Props> = ({ employees, onEmployeeClick, onDelete }) => {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1.5rem',
            padding: '1rem 0'
        }}>
            {employees.map(employee => {
                const initials = employee.name?.substring(0, 2).toUpperCase() || 'W';
                const role = employee.job_title || employee.role || 'Role N/A';
                const empId = employee.worker_id || 'N/A';
                const workMode = employee.work_mode || 'Onsite';

                // Demo fallback logic mimicking the screenshots
                let monthlyRemuneration = 0;
                if (employee.annual_pay) {
                    monthlyRemuneration = parseFloat(employee.annual_pay) / 12;
                } else if (employee.hourly_rate) {
                    monthlyRemuneration = parseFloat(employee.hourly_rate) * 160;
                }

                const REQUIRED_TRAININGS = [
                    'GMP and Quality Awareness',
                    'Gowning, Hand Washing and Conduct',
                    'Premises Cleaning and Sanitation',
                    'Pest Control',
                    'Biohazard Response',
                    'Personnel and Training',
                    'Visitor Policy'
                ];
                const completedTrainings = employee.completed_trainings || [];
                const completedCount = completedTrainings.filter((t: string) => REQUIRED_TRAININGS.includes(t)).length;
                const trainingPercent = Math.round((completedCount / REQUIRED_TRAININGS.length) * 100);
                const isComplete = trainingPercent === 100;

                return (
                    <div key={employee.id} style={{
                        background: 'white',
                        borderRadius: '24px',
                        padding: '1.5rem',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 8px 20px -5px rgba(0, 0, 0, 0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.25rem',
                        transition: 'transform 0.2s',
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{
                                    width: '56px', height: '56px', borderRadius: '50%',
                                    background: '#F8FAFC', color: '#94A3B8', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 900,
                                    border: '1px solid #F1F5F9'
                                }}>
                                    {initials}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '2px' }}>{employee.name}</span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {role}
                                    </span>
                                </div>
                            </div>
                            <div style={{
                                background: isComplete ? '#D1FAE5' : '#EFF6FF',
                                color: isComplete ? '#059669' : '#3B82F6',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 800
                            }}>
                                {trainingPercent}%
                            </div>
                        </div>

                        {/* ID and Mode */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid #F1F5F9' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Employee ID</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>{empId}</div>
                            </div>
                            <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid #F1F5F9' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Work Mode</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>{workMode}</div>
                            </div>
                        </div>

                        {/* Remuneration */}
                        <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid #F1F5F9' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Monthly Remuneration</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                                $ {monthlyRemuneration.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                            <button
                                onClick={() => onEmployeeClick(employee)}
                                style={{
                                    flex: 1,
                                    background: 'white',
                                    border: '1.5px solid #F1F5F9',
                                    padding: '0.75rem',
                                    borderRadius: '16px',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    color: '#0F172A',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    letterSpacing: '0.05em',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#F8FAFC'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                            >
                                DETAILS
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(employee.id, employee.active); }}
                                style={{
                                    background: '#FEF2F2',
                                    border: 'none',
                                    width: '48px',
                                    borderRadius: '16px',
                                    color: '#EF4444',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#FEE2E2'}
                                onMouseOut={(e) => e.currentTarget.style.background = '#FEF2F2'}
                            >
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
