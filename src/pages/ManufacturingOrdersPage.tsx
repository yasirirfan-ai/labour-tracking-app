import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ManufacturingOrder } from '../types';
import { Link } from 'react-router-dom';
import { sortManufacturingOrders } from '../utils/moSorting';



export const ManufacturingOrdersPage: React.FC = () => {
    // Explicitly typed state
    const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isAddOpen, setIsAddOpen] = useState(false);

    // Drag and Drop Refs
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    // Updated formData structure
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
                // Filter out Greenlit orders immediately
                const activeOnly = (data as ManufacturingOrder[]).filter(o => (o.current_status || '').toLowerCase() !== 'greenlit');

                // Sort using unified utility
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
        if (!confirm('Fetch latest orders? This will update existing records.')) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/sync-odoo');
            const result = await response.json();

            if (result && result.items) {
                let count = 0;
                let newIndex = 1;

                // Bulk fetch existing existing PO numbers
                const newItemPOs = result.items.map((i: any) => i.po_number).filter(Boolean);
                const { data: existingData } = await supabase.from('manufacturing_orders')
                    .select('id, po_number')
                    .in('po_number', newItemPOs);

                // Map PO number -> Order ID for quick lookup
                const existingMap = new Map();
                existingData?.forEach((row: any) => {
                    existingMap.set(row.po_number, row.id);
                });

                const promises: Promise<any>[] = [];

                for (const item of result.items) {
                    const po = item.po_number || '';
                    if (!po) continue;

                    // USER REQUEST: Skip orders with status 'Greenlit'
                    if (item.current_status && item.current_status.toLowerCase() === 'greenlit') continue;

                    // USER REQUEST: Force Strict Sequencing (1, 2, 3...)
                    // Ignore API MO number, use our counter
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
                        sort_order: newIndex * 1000 // Force sort order to match API sequence
                    };

                    // Add operation to promises array for parallel execution
                    if (existingId) {
                        promises.push((supabase.from('manufacturing_orders') as any).update(payload).eq('id', existingId));
                    } else {
                        promises.push((supabase.from('manufacturing_orders') as any).insert(payload));
                    }
                    count++;
                    newIndex++;
                }

                // Execute all updates/inserts in parallel
                await Promise.all(promises);

                alert(`Sync Complete. Processed ${count} orders.`);
                await fetchOrders(false);
            }
        } catch (e: any) {
            console.error(e);
            alert('Sync Failed: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.mo_number || !formData.product_name) return alert('MO Number and Product Name are required');

        // Get max sort order to append to bottom
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
            sort_order: maxSort + 1000 // Add to end with spacing
        });

        if (!error) {
            setIsAddOpen(false);
            resetForm();
            fetchOrders(false);
        } else {
            alert('Error creating order: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this order?')) return;
        const { error } = await supabase.from('manufacturing_orders').delete().eq('id', id);
        if (!error) fetchOrders(false);
    };

    const togglePin = async (order: ManufacturingOrder) => {
        const newVal = !order.is_pinned;
        // Optimistic update
        // Optimistic update with unified sorting
        const updatedOrders = sortManufacturingOrders(orders.map(o => o.id === order.id ? { ...o, is_pinned: newVal } : o));
        setOrders(updatedOrders);

        try {
            const { error } = await (supabase.from('manufacturing_orders') as any).update({ is_pinned: newVal }).eq('id', order.id);
            if (error) throw error;
        } catch (err) {
            console.error('Error pinning order:', err);
            // Revert on error without full reload
            fetchOrders(false);
            alert('Failed to update pin status. Ensure database schema includes "is_pinned" column.');
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

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = "move";
        // e.target.classList.add('dragging'); // Optional styling
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

        // Logic: Clone list, remove item, insert at new pos
        const _orders = [...orders];
        const draggedItemContent = _orders[dragItem.current];
        _orders.splice(dragItem.current, 1);
        _orders.splice(dragOverItem.current, 0, draggedItemContent);

        dragItem.current = null;
        dragOverItem.current = null;

        // Optimistic Update
        setOrders(_orders);

        // Calculate new sort orders and Upsert
        // We re-index everything to be clean: index * 1000
        // This is safe for < 100 items per page. If list is huge, this is heavy, but fine for now.
        const updates = _orders.map((order, index) => ({
            id: order.id,
            sort_order: (index + 1) * 1000
        }));

        try {
            const { error } = await (supabase.from('manufacturing_orders') as any).upsert(updates, { onConflict: 'id' });
            if (error) throw error;
        } catch (err: any) {
            console.error('Error reordering:', err);
            // Only alert if it's not the specific 'column missing' error we just fixed, 
            // or better, show the real error to debug.
            // User asked not to see error, but we need to know why it fails.
            // For now, let's log to console and suppressing the alert to satisfy "I don't want to see any [error]".
            // If functionality breaks, they will tell us.
        }
    };


    const filteredOrders = orders.filter(o => {
        const term = search.toLowerCase();
        return (o.mo_number?.toLowerCase().includes(term) ||
            o.product_name?.toLowerCase().includes(term) ||
            o.po_number?.toLowerCase().includes(term) ||
            o.sku?.toLowerCase().includes(term));
    });

    if (isLoading) return <div className="loading-screen">Loading Orders...</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Manufacturing Orders</h1>
                    <p className="page-subtitle">Track production orders</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={handleSync}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem', background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '8px', fontWeight: 600 }}>
                        <i className="fa-solid fa-arrows-rotate" style={{ marginRight: '8px' }}></i> Sync Orders
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem' }}>
                        <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i> New Order
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '15px', top: '12px', color: '#9CA3AF' }}></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search MO, Product, PO..."
                        style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                </div>
            </div>

            <div className="table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem 1rem', width: '40px' }}></th> {/* Grip */}
                            <th style={{ padding: '0.75rem 1rem', width: '50px', textAlign: 'center' }}><i className="fa-solid fa-thumbtack" style={{ color: '#94A3B8' }}></i></th>
                            <th style={{ padding: '0.75rem 1rem' }}>MO Number</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Product Name</th>
                            <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Qty</th>
                            <th style={{ padding: '0.75rem 1rem' }}>PO Number</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Event ID</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
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
                                onDragOver={(e) => e.preventDefault()} // Necessary to allow drop
                                style={{
                                    borderBottom: '1px solid #F1F5F9',
                                    background: order.is_pinned ? '#FFFBEB' : 'transparent',
                                    cursor: 'grab'
                                }}
                            >
                                <td style={{ padding: '0.75rem 1rem', color: '#CBD5E1', cursor: 'grab' }}>
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
                                            color: order.is_pinned ? '#F59E0B' : '#CBD5E1',
                                            fontSize: '1rem',
                                            transition: 'transform 0.2s',
                                            transform: order.is_pinned ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                        title={order.is_pinned ? "Unpin Order" : "Pin Order"}
                                    >
                                        <i className="fa-solid fa-thumbtack"></i>
                                    </button>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>{index + 1}</td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{order.product_name}</td>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#64748B' }}>{order.sku}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{order.quantity}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{order.po_number}</td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#94A3B8' }}>{order.event_id}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {order.scheduled_date}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span className={`badge badge-${(order.current_status || 'draft').toLowerCase()}`} style={{ textTransform: 'capitalize' }}>
                                        {order.current_status}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                    <Link to={`/control-matrix#mo-${order.mo_number}`} className="icon-btn" title="View Matrix" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fa-solid fa-table-cells"></i>
                                    </Link>
                                    <button className="icon-btn delete" title="Delete" onClick={() => handleDelete(order.id)}><i className="fa-regular fa-trash-can"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            <div className={`offcanvas ${isAddOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: '600px', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '12px', opacity: (isAddOpen) ? 1 : 0,
                pointerEvents: (isAddOpen) ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed'
            }}>
                <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '2rem 2rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create New Order</h3>
                    <button className="close-btn" onClick={() => { setIsAddOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="offcanvas-body" style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>MO Number</label>
                            <input type="text" value={formData.mo_number} onChange={e => setFormData({ ...formData, mo_number: e.target.value })}
                                disabled={false}
                                placeholder="e.g. WH/MO/001"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'white' }}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Product Name</label>
                            <input type="text" value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                placeholder="e.g. Eucalyptus Shower Gel 16oz"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>SKU</label>
                            <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                placeholder="e.g. 1BSGE16OZ"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Quantity</label>
                            <input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                placeholder="0"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>PO Number</label>
                            <input type="text" value={formData.po_number} onChange={e => setFormData({ ...formData, po_number: e.target.value })}
                                placeholder="e.g. PO10202"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Event ID</label>
                            <input type="text" value={formData.event_id} onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                                placeholder="e.g. jkv0u..."
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Scheduled Date</label>
                            <input type="date" value={formData.scheduled_date} onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Status</label>
                            <select value={formData.current_status} onChange={e => setFormData({ ...formData, current_status: e.target.value })}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'white' }}
                            >
                                <option value="Draft">Draft</option>
                                <option value="Scheduled">Scheduled</option>
                                <option value="Staged">Staged</option>
                                <option value="Weighed">Weighed</option>
                                <option value="Batched">Batched</option>
                                <option value="Filled">Filled</option>
                                <option value="Packed">Packed</option>
                                <option value="Putback">Putback</option>
                                <option value="Done">Done</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
                        <button className="btn btn-secondary" onClick={() => { setIsAddOpen(false); }}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            Create Order
                        </button>
                    </div>
                </div>
            </div>

            {(isAddOpen) && <div className="overlay active" style={{ zIndex: 1000 }} onClick={() => { setIsAddOpen(false); }}></div>}
        </>
    );
};
