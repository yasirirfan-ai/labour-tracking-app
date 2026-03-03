import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
    const [stats, setStats] = useState({ activeWorkers: 0, totalWorkers: 0, runningTimers: 0, todayHours: 0, todayCost: 0 });
    const [activeMos, setActiveMos] = useState<string[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: taskData } = await supabase.from('tasks').select('*') as { data: any[] };
            const { data: moData } = await supabase.from('manufacturing_orders').select('*') as { data: any[] };

            if (userData && taskData) {
                const activeWorkers = userData.filter(u => taskData.some((t: any) => t.assigned_to_id === u.id && t.status === 'active')).length;
                const runningTimers = taskData.filter((t: any) => t.status === 'active').length;
                const totalSec = taskData.reduce((acc, t: any) => acc + (t.active_seconds || 0), 0);
                const totalCost = taskData.reduce((acc, t: any) => {
                    const emp = userData.find(u => u.id === t.assigned_to_id);
                    return acc + (((t.active_seconds || 0) / 3600) * (emp?.hourly_rate || 0));
                }, 0);

                setStats({
                    activeWorkers,
                    totalWorkers: userData.length,
                    runningTimers,
                    todayHours: parseFloat((totalSec / 3600).toFixed(1)),
                    todayCost: parseFloat(totalCost.toFixed(2))
                });

                setTasks(taskData);
                if (moData) {
                     // Filter for active/in-progress orders roughly
                     const active = moData.filter((m: any) => {
                         const s = (m.current_status || '').toLowerCase();
                         return s !== 'completed' && s !== 'done' && s !== 'draft';
                     });
                     setActiveMos(active.map((m: any) => m.mo_number));
                }
            }
        } catch (err) {
            console.error('Error fetching dashboard:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div className="loading-screen">Loading Dashboard...</div>;

    const getActiveCountForMo = (moRef: string) => {
        return tasks.filter(t => t.mo_reference === moRef && t.status === 'active').length;
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Manufacturing labor overview</p>
            </div>

            <div className="stats-grid">
                <Link to="/employee-activity" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">Active Workers</div>
                        <div className="stat-value">{stats.activeWorkers}</div>
                        <div className="stat-detail">{stats.totalWorkers} total workers</div>
                    </div>
                    <div className="icon-box icon-blue">
                        <i className="fa-solid fa-user-group"></i>
                    </div>
                </Link>

                <Link to="/control-matrix" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">Running Timers</div>
                        <div className="stat-value">{stats.runningTimers}</div>
                        <div className="stat-detail">Currently active</div>
                    </div>
                    <div className="icon-box icon-green">
                        <i className="fa-regular fa-circle-play"></i>
                    </div>
                </Link>

                <Link to="/reports" className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                        <div className="stat-label">Today's Hours</div>
                        <div className="stat-value">{stats.todayHours}</div>
                        <div className="stat-detail">Hours logged</div>
                    </div>
                    <div className="icon-box icon-yellow">
                        <i className="fa-regular fa-clock"></i>
                    </div>
                </Link>

                <div className="stat-card">
                    <div>
                        <div className="stat-label">Today's Labor Cost</div>
                        <div className="stat-value">${stats.todayCost}</div>
                        <div className="stat-detail">Calculated from entries</div>
                    </div>
                    <div className="icon-box icon-red">
                        <i className="fa-solid fa-dollar-sign"></i>
                    </div>
                </div>
            </div>

            <div className="content-grid" style={{ gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <div className="section-card">
                    <div className="section-header">
                        <h2 className="section-title">Active Orders</h2>
                        <Link to="/manufacturing-orders" className="view-link">View All <i className="fa-solid fa-arrow-right"></i></Link>
                    </div>

                    <div className="list-container">
                        {activeMos.length > 0 ? (
                            activeMos.map(mo => (
                                <Link key={mo} to="/control-matrix" className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className="item-main">
                                        <div style={{ width: '40px', height: '40px', background: '#EEF2FF', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem' }}>
                                            MO
                                        </div>
                                        <div>
                                            <div className="item-title">{mo}</div>
                                            <div className="item-sub">In Progress</div>
                                        </div>
                                    </div>
                                    <span className="status-badge badge-blue">{getActiveCountForMo(mo)} active operations</span>
                                </Link>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No active orders</div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
