import React from 'react';
import type { User } from '../types';

interface EmployeeSnapshotProps {
    employee: User;
    position: { x: number; y: number };
}

export const EmployeeSnapshot: React.FC<EmployeeSnapshotProps> = ({ employee, position }) => {
    return (
        <div className="employee-snapshot" style={{ top: position.y + 10, left: position.x + 10 }}>
            <div className="snapshot-card">
                <div className="snapshot-header">
                    <div className="snapshot-photo">
                        {employee.photo_url ? (
                            <img src={employee.photo_url} alt={employee.name} />
                        ) : (
                            <div className="snapshot-placeholder">
                                <i className="fa-solid fa-user"></i>
                            </div>
                        )}
                    </div>
                    <div className="snapshot-info">
                        <h3>{employee.name}</h3>
                        <p>{employee.job_title || 'Manufacturing Associate'} | {employee.department || 'Our Babylon'}</p>
                    </div>
                </div>
                <div className="snapshot-footer">
                    <span className="snapshot-link">
                        <i className="fa-solid fa-id-card"></i> Open Snapshot View
                    </span>
                </div>
            </div>

            <style>{`
                .employee-snapshot {
                    position: fixed;
                    z-index: 9999;
                    pointer-events: none; /* Let user click on the name under the snapshot if needed, or make it interactive? */
                }
                .snapshot-card {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid #e5e7eb;
                    padding: 1rem;
                    width: 300px;
                }
                .snapshot-header {
                    display: flex;
                    gap: 1rem;
                    align-items: flex-start;
                }
                .snapshot-photo {
                    width: 50px;
                    height: 50px;
                    border-radius: 8px;
                    background: #f3f4f6;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .snapshot-photo img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .snapshot-placeholder {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #9ca3af;
                }
                .snapshot-info h3 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: #111827;
                }
                .snapshot-info p {
                    margin: 4px 0 0 0;
                    font-size: 0.8rem;
                    color: #6b7280;
                }
                .snapshot-footer {
                    margin-top: 1rem;
                    padding-top: 0.75rem;
                    border-top: 1px solid #f3f4f6;
                }
                .snapshot-link {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--primary, #1e1b4b);
                    font-size: 0.8rem;
                    font-weight: 500;
                }
            `}</style>
        </div>
    );
};
