import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

export const OperationsPage: React.FC = () => {
    const { t } = useTranslation();
    const [operations, setOperations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [formData, setFormData] = useState({ id: '', name: '', description: '' });

    useEffect(() => { fetchOps(); }, []);

    const fetchOps = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('operations').select('*').order('sort_order', { ascending: true }) as { data: any[] };
        if (data) setOperations(data);
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!formData.name) return alert(t('operations.namePlaceholder'));
        const sort_order = operations.length > 0 ? Math.max(...operations.map((o: any) => o.sort_order || 0)) + 1 : 1;
        const { error } = await (supabase.from('operations') as any).insert({ name: formData.name, description: formData.description, sort_order });
        if (!error) {
            setIsAddOpen(false);
            setFormData({ id: '', name: '', description: '' });
            fetchOps();
        }
    };

    const handleUpdate = async () => {
        const { error } = await (supabase.from('operations') as any).update({ name: formData.name, description: formData.description }).eq('id', formData.id);
        if (!error) {
            setIsEditOpen(false);
            fetchOps();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('operations.deleteConfirm'))) return;
        const { error } = await supabase.from('operations').delete().eq('id', id);
        if (!error) fetchOps();
    };

    const openEdit = (op: any) => {
        setFormData({ id: op.id, name: op.name, description: op.description || '' });
        setIsEditOpen(true);
    };

    if (isLoading) return <div className="loading-screen">{t('operations.loading')}</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">{t('operations.title')}</h1>
                    <p className="page-subtitle">{t('operations.subtitle')}</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsAddOpen(true)} style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
                    <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i> {t('operations.add')}
                </button>
            </div>

            <div className="table-container" id="operations-list" style={{ padding: '0.5rem 0' }}>
                {operations.map((op, index) => (
                    <div key={op.id} className="operation-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card, white)', transition: 'all 0.2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <i className="fa-solid fa-grip-vertical" style={{ color: 'var(--text-muted, #D1D5DB)', cursor: 'grab' }}></i>
                            <div style={{ width: '32px', height: '32px', background: 'var(--bg-main)', color: 'var(--primary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                {index + 1}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{op.name}</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{op.description}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="icon-btn" title={t('common.edit')} onClick={() => openEdit(op)}><i className="fa-solid fa-pen"></i></button>
                            <button className="icon-btn delete" title={t('common.delete')} onClick={() => handleDelete(op.id)}><i className="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                ))}
            </div>

            {isAddOpen && (
                <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '500px', background: 'var(--bg-card, white)', borderRadius: '12px', zIndex: 1001, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem 0.5rem' }}>
                        <h3 className="offcanvas-title" style={{ color: 'var(--text-main)' }}>{t('operations.add')}</h3>
                        <button className="close-btn" onClick={() => setIsAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}><i className="fa-solid fa-xmark"></i></button>
                    </div>
                    <div style={{ padding: '0 2rem 1.5rem' }}>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('operations.name')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t('operations.namePlaceholder')} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('operations.description')} ({t('common.optional', 'optional')})</label>
                            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder={t('operations.descriptionPlaceholder')} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)' }}></textarea>
                        </div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)' }} onClick={() => setIsAddOpen(false)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={handleCreate}>{t('operations.create')}</button>
                        </div>
                    </div>
                </div>
            )}

            {isEditOpen && (
                <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '500px', background: 'var(--bg-card, white)', borderRadius: '12px', zIndex: 1001, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem 0.5rem' }}>
                        <h3 className="offcanvas-title" style={{ color: 'var(--text-main)' }}>{t('operations.edit')}</h3>
                        <button className="close-btn" onClick={() => setIsEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}><i className="fa-solid fa-xmark"></i></button>
                    </div>
                    <div style={{ padding: '0 2rem 1.5rem' }}>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('operations.name')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t('operations.description')}</label>
                            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)' }}></textarea>
                        </div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)' }} onClick={() => setIsEditOpen(false)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={handleUpdate}>{t('operations.update')}</button>
                        </div>
                    </div>
                </div>
            )}

            {(isAddOpen || isEditOpen) && <div className="overlay active" style={{ zIndex: 1000 }} onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}></div>}
        </>
    );
};
