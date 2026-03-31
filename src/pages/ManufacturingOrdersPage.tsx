import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ManufacturingOrder } from '../types';
import { Link } from 'react-router-dom';
import { sortManufacturingOrders } from '../utils/moSorting';
import { useTranslation } from 'react-i18next';

export const ManufacturingOrdersPage: React.FC = () => {
    const { t } = useTranslation();
    const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const [formData, setFormData] = useState({
        mo_number: '',
        quantity: 0,
        po_number: '',
        product_name: '',
        sku: '',
        event_id: '',
        scheduled_date: '',
        current_status: 'Draft'
    });

    useEffect(() => { fetchOrders(true); }, []);

    const fetchOrders = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const { data } = await supabase.from('manufacturing_orders').select('*');
            if (data) {
                const activeOnly = (data as ManufacturingOrder[]).filter(o => (o.current_status || '').toLowerCase() !== 'greenlit');
                const sorted = sortManufacturingOrders(activeOnly);
                setOrders(sorted);
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    const handleSync = async () => {
        if (!confirm(t('mo.syncConfirm'))) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/sync-odoo');
            const result = await response.json();

            if (result && result.items) {
                let count = 0;
                let newIndex = 1;

                const newItemPOs = result.items.map((i: any) => i.po_number).filter(Boolean);
                const { data: existingData } = await supabase.from('manufacturing_orders')
                    .select('id, po_number')
                    .in('po_number', newItemPOs);

                const existingMap = new Map();
                existingData?.forEach((row: any) => {
                    existingMap.set(row.po_number, row.id);
                });

                const promises: Promise<any>[] = [];

                for (const item of result.items) {
                    const po = item.po_number || '';
                    if (!po) continue;
                    if (item.current_status && item.current_status.toLowerCase() === 'greenlit') continue;

                    const mo = newIndex.toString();
                    const existingId = existingMap.get(po);

                    const payload = {
                        mo_number: mo,
                        quantity: typeof item.quantity === 'number' ? item.quantity : 0,
                        po_number: po,
                        product_name: item.product_name,
                        sku: item.sku,
                        event_id: item.event_id,
                        scheduled_date: item.scheduled_date || null,
                        current_status: item.current_status,
                        sort_order: newIndex * 1000
                    };

                    if (existingId) {
                        promises.push((supabase.from('manufacturing_orders') as any).update(payload).eq('id', existingId));
                    } else {
                        promises.push((supabase.from('manufacturing_orders') as any).insert(payload));
                    }
                    count++;
                    newIndex++;
                }

                await Promise.all(promises);
                alert(t('mo.syncComplete', { count }));
                await fetchOrders(false);
            }
        } catch (e: any) {
            console.error(e);
            alert(t('mo.syncFailed', { message: e.message }));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.mo_number || !formData.product_name) return alert(t('mo.requiredError'));

        const maxSort = orders.length > 0 ? Math.max(...orders.map(o => o.sort_order || 0)) : 0;

        const { error } = await (supabase.from('manufacturing_orders') as any).insert({
            mo_number: formData.mo_number,
            quantity: formData.quantity,
            po_number: formData.po_number,
            product_name: formData.product_name,
            sku: formData.sku,
            event_id: formData.event_id,
            scheduled_date: formData.scheduled_date || null,
            current_status: formData.current_status,
            sort_order: maxSort + 1000
        });

        if (!error) {
            setIsAddOpen(false);
            resetForm();
            fetchOrders(false);
        } else {
            alert(t('mo.syncFailed', { message: error.message }));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('mo.deleteConfirm'))) return;
        const { error } = await supabase.from('manufacturing_orders').delete().eq('id', id);
        if (!error) fetchOrders(false);
    };

    const togglePin = async (order: ManufacturingOrder) => {
        const newVal = !order.is_pinned;
        const updatedOrders = sortManufacturingOrders(orders.map(o => o.id === order.id ? { ...o, is_pinned: newVal } : o));
        setOrders(updatedOrders);

        try {
            const { error } = await (supabase.from('manufacturing_orders') as any).update({ is_pinned: newVal }).eq('id', order.id);
            if (error) throw error;
        } catch (err) {
            console.error('Error pinning order:', err);
            fetchOrders(false);
        }
    };

    const resetForm = () => {
        setFormData({
            mo_number: '',
            quantity: 0,
            po_number: '',
            product_name: '',
            sku: '',
            event_id: '',
            scheduled_date: '',
            current_status: 'Draft'
        });
    };

    const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnter = (_: React.DragEvent<HTMLTableRowElement>, index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = async () => {
        if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const _orders = [...orders];
        const draggedItemContent = _orders[dragItem.current];
        _orders.splice(dragItem.current, 1);
        _orders.splice(dragOverItem.current, 0, draggedItemContent);

        dragItem.current = null;
        dragOverItem.current = null;
        setOrders(_orders);

        const updates = _orders.map((order, index) => ({
            id: order.id,
            sort_order: (index + 1) * 1000
        }));

        try {
            await (supabase.from('manufacturing_orders') as any).upsert(updates, { onConflict: 'id' });
        } catch (err: any) {
            console.error('Error reordering:', err);
        }
    };

    const filteredOrders = orders.filter(o => {
        const term = search.toLowerCase();
        return (o.mo_number?.toLowerCase().includes(term) ||
            o.product_name?.toLowerCase().includes(term) ||
            o.po_number?.toLowerCase().includes(term) ||
            o.sku?.toLowerCase().includes(term));
    });

    if (isLoading) return <div className="loading-screen">{t('mo.loading')}</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">{t('mo.title')}</h1>
                    <p className="page-subtitle">{t('mo.subtitle')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={handleSync}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 600 }}>
                        <i className="fa-solid fa-arrows-rotate" style={{ marginRight: '8px' }}></i> {t('mo.sync')}
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem' }}>
                        <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i> {t('mo.new')}
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '15px', top: '12px', color: 'var(--text-muted)' }}></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('mo.searchPlaceholder')}
                        style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                </div>
            </div>

            <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem 1rem', width: '40px' }}></th>
                            <th style={{ padding: '0.75rem 1rem', width: '50px', textAlign: 'center' }}><i className="fa-solid fa-thumbtack" style={{ color: 'var(--text-muted)' }}></i></th>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.moNumber')}</th>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', left: '100px', color: 'var(--text-main)' }}>{t('mo.productName')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.sku')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.qty')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.poNumber')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.eventId')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.scheduled')}</th>
                            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{t('mo.status')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-main)' }}>{t('mo.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.map((order, index) => (
                            <tr
                                key={order.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                style={{
                                    borderBottom: '1px solid var(--border)',
                                    background: order.is_pinned ? 'var(--bg-main)' : 'transparent',
                                    cursor: 'grab'
                                }}
                            >
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', cursor: 'grab' }}>
                                    <i className="fa-solid fa-grip-vertical"></i>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                    <button
                                        onClick={() => togglePin(order)}
                                        className="icon-btn"
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            color: order.is_pinned ? '#F59E0B' : 'var(--text-muted)',
                                            fontSize: '1rem',
                                            transition: 'transform 0.2s',
                                            transform: order.is_pinned ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                        title={order.is_pinned ? t('mo.viewMatrix') : t('mo.viewMatrix')}
                                    >
                                        <i className="fa-solid fa-thumbtack"></i>
                                    </button>
                                </td>
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>{index + 1}</td>
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, left: '100px', color: 'var(--text-main)' }}>{order.product_name}</td>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{order.sku}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{order.quantity}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{order.po_number}</td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{order.event_id}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {order.scheduled_date}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span className={`badge badge-${(order.current_status || 'draft').toLowerCase()}`} style={{ textTransform: 'capitalize' }}>
                                        {t(`mo.statuses.${(order.current_status || 'draft').toLowerCase()}`)}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                    <Link to={`/control-matrix#mo-${order.mo_number}`} className="icon-btn" title={t('mo.viewMatrix')} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fa-solid fa-table-cells"></i>
                                    </Link>
                                    <button className="icon-btn delete" title={t('common.delete')} onClick={() => handleDelete(order.id)}><i className="fa-regular fa-trash-can"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isAddOpen && (
                <div className={`offcanvas show`} style={{
                    right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                    width: '600px', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                    borderRadius: '12px', opacity: 1, zIndex: 3001, background: 'var(--bg-card)', position: 'fixed',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)'
                }}>
                    <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '2rem 2rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="offcanvas-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>{t('mo.createTitle')}</h3>
                        <button className="close-btn" onClick={() => { setIsAddOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div className="offcanvas-body" style={{ padding: '0 2rem 2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.moNumber')}</label>
                                <input type="text" value={formData.mo_number} onChange={e => setFormData({ ...formData, mo_number: e.target.value })}
                                    placeholder={t('mo.moPlaceholder')}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.productName')}</label>
                                <input type="text" value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                    placeholder={t('mo.productPlaceholder')}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.sku')}</label>
                                <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                    placeholder={t('mo.skuPlaceholder')}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.qty')}</label>
                                <input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                    placeholder="0"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.poNumber')}</label>
                                <input type="text" value={formData.po_number} onChange={e => setFormData({ ...formData, po_number: e.target.value })}
                                    placeholder={t('mo.poPlaceholder')}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.eventId')}</label>
                                <input type="text" value={formData.event_id} onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                                    placeholder={t('mo.eventPlaceholder')}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.scheduled')}</label>
                                <input type="date" value={formData.scheduled_date} onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('mo.status')}</label>
                                <select value={formData.current_status} onChange={e => setFormData({ ...formData, current_status: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                >
                                    <option value="Draft">{t('mo.statuses.draft')}</option>
                                    <option value="Scheduled">{t('mo.statuses.scheduled')}</option>
                                    <option value="Staged">{t('mo.statuses.staged')}</option>
                                    <option value="Weighed">{t('mo.statuses.weighed')}</option>
                                    <option value="Batched">{t('mo.statuses.batched')}</option>
                                    <option value="Filled">{t('mo.statuses.filled')}</option>
                                    <option value="Packed">{t('mo.statuses.packed')}</option>
                                    <option value="Putback">{t('mo.statuses.putback')}</option>
                                    <option value="Done">{t('mo.statuses.done')}</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
                            <button className="btn btn-secondary" onClick={() => { setIsAddOpen(false); }}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={handleCreate}>
                                {t('mo.createOrder')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(isAddOpen) && <div className="overlay active" style={{ zIndex: 1000 }} onClick={() => { setIsAddOpen(false); }}></div>}
        </>
    );
};
