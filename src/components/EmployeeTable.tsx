import React from 'react';
import type { User } from '../types';

interface EmployeeTableProps {
    employees: User[];
    onEmployeeClick: (employee: User) => void;
    onMouseEnterName: (e: React.MouseEvent, employee: User) => void;
    onMouseLeaveName: () => void;
    onEdit?: (employee: User) => void;
    onArchive?: (id: string, currentStatus: boolean) => void;
}

export const EmployeeTable: React.FC<EmployeeTableProps> = ({ 
    employees, 
    onEmployeeClick, 
    onMouseEnterName, 
    onMouseLeaveName,
    onEdit,
    onArchive
}) => {
    return (
        <div className="employee-table-wrapper">
            <table className="employee-table">
                <thead>
                    <tr>
                        <th>Employee Photo</th>
                        <th>Preferred Name</th>
                        <th>Last Name</th>
                        <th>Job Title</th>
                        <th>Department</th>
                        <th>Employment Status</th>
                        <th>Reporting To</th>
                        <th>Hire Date</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {employees.map((employee) => {
                        return (
                            <tr key={employee.id}>
                                <td className="td-photo">
                                    <div className="photo-container">
                                        {employee.photo_url ? (
                                            <img src={employee.photo_url} alt={employee.name} />
                                        ) : (
                                            <div className="photo-placeholder">
                                                <i className="fa-solid fa-user"></i>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="td-name">
                                    <span 
                                        className="name-link" 
                                        onClick={() => onEmployeeClick(employee)}
                                        onMouseEnter={(e) => onMouseEnterName(e, employee)}
                                        onMouseLeave={onMouseLeaveName}
                                    >
                                        {employee.preferred_name || employee.name.split(' ')[0]}
                                    </span>
                                </td>
                                <td className="td-lastname">
                                    <span className="name-link" onClick={() => onEmployeeClick(employee)}>
                                        {employee.last_name || employee.name.split(' ')[1] || ''}
                                    </span>
                                </td>
                                <td>{employee.job_title || 'N/A'}</td>
                                <td>{employee.department || 'N/A'}</td>
                                <td>{employee.employment_status || 'Full Time'}</td>
                                <td>{employee.reporting_to || 'N/A'}</td>
                                <td>{employee.hire_date || 'N/A'}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <div className="action-buttons">
                                        <button className="table-action-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit?.(employee); }}>
                                            <i className="fa-solid fa-pen"></i>
                                        </button>
                                        <button className="table-action-btn delete" title={employee.active === false ? "Restore" : "Archive"} onClick={(e) => { e.stopPropagation(); onArchive?.(employee.id, employee.active !== false); }}>
                                            <i className={`fa-solid ${employee.active === false ? 'fa-rotate-left' : 'fa-trash'}`}></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <style>{`
                .employee-table-wrapper {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e5e7eb;
                    overflow: hidden;
                    margin-top: 1rem;
                }
                .employee-table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                }
                .employee-table th {
                    background: #f9fafb;
                    padding: 12px 16px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #4b5563;
                    text-transform: uppercase;
                    border-bottom: 1px solid #e5e7eb;
                }
                .employee-table td {
                    padding: 12px 16px;
                    font-size: 0.875rem;
                    color: #111827;
                    border-bottom: 1px solid #f3f4f6;
                    vertical-align: middle;
                }
                .photo-container {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    background: #f3f4f6;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .photo-container img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .photo-placeholder {
                    color: #9ca3af;
                    font-size: 1.2rem;
                }
                .name-link {
                    color: var(--primary, #1e1b4b);
                    cursor: pointer;
                    font-weight: 500;
                }
                .name-link:hover {
                    text-decoration: underline;
                    color: var(--primary-light, #312e81);
                }
                .td-photo { width: 80px; }
                .td-name, .td-lastname { width: 140px; }
                .action-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }
                .table-action-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    color: #6b7280;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .table-action-btn:hover {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }
                .table-action-btn.delete:hover {
                    background: #fef2f2;
                    border-color: #fee2e2;
                    color: #ef4444;
                }
            `}</style>
        </div>
    );
};
