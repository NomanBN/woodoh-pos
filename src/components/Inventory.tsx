import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  Trash2, 
  Edit2, 
  ArrowUpRight, 
  ArrowDownLeft,
  Filter,
  History,
  CheckCircle,
  XCircle,
  Truck,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Phone,
  MapPin,
  Zap,
  FileSpreadsheet
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { InventoryItem, Supplier, InventoryReconciliation, Staff } from '../types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inventorySchema, supplierSchema, reconciliationSchema } from '../lib/validations';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import Header from './Header';
import { useStaff } from '../contexts/StaffContext';
import { usePermissions } from '../hooks/usePermissions';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import { useTranslation } from 'react-i18next';

import { useSearchParams } from 'react-router-dom';

export default function Inventory({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reconciliations, setReconciliations] = useState<InventoryReconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>(searchParams.get('filter') === 'low_stock' ? 'low_stock' : 'all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItemForReconcile, setSelectedItemForReconcile] = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'reconciliation' | 'suppliers'>('inventory');
  const { currentStaff } = useStaff();
  const { hasPermission } = usePermissions(currentStaff);

  const canCreate = hasPermission('inventory.create');
  const canEdit = hasPermission('inventory.edit');
  const canDelete = hasPermission('inventory.delete');
  const canReconcile = hasPermission('inventory.reconcile');
  const canManageSuppliers = hasPermission('suppliers.manage');

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      name: '',
      type: 'fabric' as const,
      quantity: 0,
      unit: 'meter' as const,
      conversionRate: 1,
      minThreshold: 5,
      pricePerUnit: 0,
      supplierId: ''
    }
  });

  const watchType = watch('type');

  const { 
    register: registerSupplier, 
    handleSubmit: handleSubmitSupplier, 
    reset: resetSupplier, 
    formState: { errors: supplierErrors, isSubmitting: isSubmittingSupplier } 
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      category: 'fabric' as const,
      isTest: false
    }
  });

  const {
    register: registerReconcile,
    handleSubmit: handleSubmitReconcile,
    reset: resetReconcile,
    formState: { errors: reconcileErrors, isSubmitting: isSubmittingReconcile }
  } = useForm({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      actualQuantity: 0,
      reason: '' as any,
      staffId: ''
    }
  });

  useEffect(() => {
    if (!tenantId) return;

    const qItems = query(collection(db, 'inventory'), where('tenantId', '==', tenantId));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      setLoading(false);
    });

    const qSuppliers = query(collection(db, 'suppliers'), where('tenantId', '==', tenantId));
    const unsubscribeSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    });

    const qStaff = query(collection(db, 'staff'), where('tenantId', '==', tenantId));
    const unsubscribeStaff = onSnapshot(qStaff, (snapshot) => {
      setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    });

    const qRecon = query(collection(db, 'inventoryReconciliations'), where('tenantId', '==', tenantId));
    const unsubscribeRecon = onSnapshot(qRecon, (snapshot) => {
      setReconciliations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryReconciliation)));
    });

    return () => {
      unsubscribeItems();
      unsubscribeSuppliers();
      unsubscribeStaff();
      unsubscribeRecon();
    };
  }, [tenantId]);

  // Track Low Stock Alerts
  useEffect(() => {
    if (items.length === 0) return;
    
    items.forEach(item => {
      if (item.quantity <= item.minThreshold) {
        // We use a simple local storage check to avoid spamming the same alert
        const alertKey = `low_stock_alert_${item.id}_${item.quantity}`;
        if (!localStorage.getItem(alertKey)) {
          analytics.track(AnalyticsEvent.LOW_STOCK_ALERT, {
            item_id: item.id,
            item_name: item.name,
            current_quantity: item.quantity,
            min_threshold: item.minThreshold,
            category: item.category
          });
          localStorage.setItem(alertKey, 'true');
        }
      }
    });
  }, [items]);

  const onSubmit = async (data: any) => {
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'inventory'), {
          ...data,
          tenantId,
          updatedAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingItem(null);
      reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const onSupplierSubmit = async (data: any) => {
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...data,
          tenantId,
          createdAt: serverTimestamp()
        });
      }
      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      resetSupplier();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'suppliers');
    }
  };

  const onReconcileSubmit = async (data: any) => {
    if (!selectedItemForReconcile) return;

    try {
      const diff = data.actualQuantity - selectedItemForReconcile.quantity;
      const staffMember = staff.find(s => s.id === data.staffId);

      await addDoc(collection(db, 'inventoryReconciliations'), {
        tenantId,
        itemId: selectedItemForReconcile.id,
        itemName: selectedItemForReconcile.name,
        previousQuantity: selectedItemForReconcile.quantity,
        actualQuantity: data.actualQuantity,
        difference: diff,
        reason: data.reason,
        staffId: data.staffId,
        staffName: staffMember?.name || 'Unknown',
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'inventory', selectedItemForReconcile.id), {
        quantity: data.actualQuantity,
        updatedAt: serverTimestamp()
      });

      setIsReconcileModalOpen(false);
      setSelectedItemForReconcile(null);
      resetReconcile();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventoryReconciliations');
    }
  };

  const handleExport = () => {
    const exportData = items.map(item => ({
      [t('common.name')]: item.name,
      [t('inventory.category')]: item.category === 'fabric' ? t('inventory.fabric') : 
               item.category === 'thread' ? t('inventory.thread') : 
               item.category === 'button' ? t('inventory.button') : 
               item.category === 'lining' ? t('inventory.lining') : t('common.other'),
      [t('inventory.quantity')]: item.quantity,
      [t('inventory.unit')]: item.unit === 'meter' ? t('inventory.units.meter') : item.unit === 'piece' ? t('inventory.units.piece') : item.unit === 'roll' ? t('inventory.units.roll') : item.unit,
      [t('inventory.min_threshold')]: item.minThreshold,
      [t('inventory.price_per_unit')]: item.pricePerUnit,
      [t('common.total')]: item.quantity * item.pricePerUnit
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventory_${new Date().toLocaleDateString('en-US')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('inventory.delete_confirm', 'هل أنت متأكد من حذف هذا الصنف؟'))) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'inventory');
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm(t('suppliers.delete_confirm', 'هل أنت متأكد من حذف هذا المورد؟'))) return;
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'suppliers');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterCategory === 'all' || 
     (filterCategory === 'low_stock' ? item.quantity <= item.minThreshold : item.category === filterCategory))
  );

  const lowStockItems = items.filter(item => item.quantity <= item.minThreshold);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Header 
        tenantId={tenantId} 
        title={t('inventory.title')} 
        subtitle={t('inventory.subtitle')}
      >
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex bg-surface rounded-xl border border-border p-1">
            {[
              { id: 'inventory', label: t('inventory.title'), icon: Package },
              { id: 'suppliers', label: t('suppliers.title'), icon: Truck },
              { id: 'reconciliation', label: t('reconciliation.title'), icon: History }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id 
                  ? 'bg-brand text-white shadow-sm' 
                  : 'text-content-muted hover:text-brand'
                }`}
              >
                <tab.icon size={18} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={handleExport}
            className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/10"
            title={t('common.export')}
          >
            <FileSpreadsheet size={20} />
          </button>
          {canCreate && (
            <button 
              onClick={() => {
                if (activeTab === 'suppliers') {
                  setEditingSupplier(null);
                  setIsSupplierModalOpen(true);
                } else {
                  setEditingItem(null);
                  setIsModalOpen(true);
                }
              }}
              className="bg-brand text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-brand/90 transition-colors shadow-lg shadow-brand/10"
            >
              <Plus size={20} />
              <span>{activeTab === 'suppliers' ? t('suppliers.add_supplier') : t('inventory.add_item')}</span>
            </button>
          )}
        </div>
      </Header>

      {activeTab === 'inventory' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-surface p-4 rounded-2xl shadow-sm border border-border flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                <Package size={24} />
              </div>
              <div>
                <p className="text-sm text-content-muted">{t('inventory.total_items')}</p>
                <p className="text-xl font-bold text-content">{items.length.toLocaleString('en-US')}</p>
              </div>
            </div>
            <div className="bg-surface p-4 rounded-2xl shadow-sm border border-border flex items-center gap-4">
              <div className="p-3 bg-orange-500/10 text-orange-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm text-content-muted">{t('inventory.low_stock_items')}</p>
                <p className="text-xl font-bold text-orange-600">{lowStockItems.length.toLocaleString('en-US')}</p>
              </div>
            </div>
            <div className="bg-surface p-4 rounded-2xl shadow-sm border border-border flex items-center gap-4 sm:col-span-2 lg:col-span-1">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
                <ArrowUpRight size={24} />
              </div>
              <div>
                <p className="text-sm text-content-muted">{t('inventory.estimated_value')}</p>
                <p className="text-xl font-bold text-emerald-600">
                  {items.reduce((acc, item) => acc + (item.quantity * item.pricePerUnit), 0).toLocaleString('en-US')} {t('common.currency')}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
              <input 
                type="text"
                placeholder={t('inventory.search_placeholder', 'بحث عن صنف...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted"
              />
            </div>
            <div className="flex overflow-x-auto pb-2 lg:pb-0 gap-2 scrollbar-hide">
              {['all', 'low_stock', 'fabric', 'thread', 'button', 'lining', 'other'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    filterCategory === cat 
                    ? 'bg-brand text-white' 
                    : 'bg-surface text-content-muted border border-border hover:bg-surface-muted'
                  }`}
                >
                  {cat === 'all' ? t('common.all') : 
                   cat === 'low_stock' ? t('inventory.low_stock') :
                   cat === 'fabric' ? t('inventory.fabric') : 
                   cat === 'thread' ? t('inventory.thread') : 
                   cat === 'button' ? t('inventory.button') : 
                   cat === 'lining' ? t('inventory.lining') : t('common.other')}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <motion.div 
                key={item.id}
                layout
                className="bg-surface p-5 rounded-2xl shadow-sm border border-border flex flex-col gap-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-content text-lg flex items-center gap-2">
                      {item.name}
                      {item.isTest && (
                        <span className="text-[10px] bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1">
                          <Zap size={10} />
                          {t('common.test')}
                        </span>
                      )}
                    </h3>
                    <span className="text-xs px-2 py-1 bg-surface-muted text-content-muted rounded-lg">
                      {item.category === 'fabric' ? t('inventory.fabric') : item.category === 'thread' ? t('inventory.thread') : item.category === 'button' ? t('inventory.button') : t('common.other')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {canReconcile && (
                      <button 
                        onClick={() => {
                          setSelectedItemForReconcile(item);
                          resetReconcile({
                            actualQuantity: item.quantity,
                            reason: '' as any,
                            staffId: currentStaff?.id || ''
                          });
                          setIsReconcileModalOpen(true);
                        }}
                        className="p-2 text-orange-600 hover:bg-orange-500/10 rounded-lg transition-colors"
                        title="تسوية الكمية"
                      >
                        <RefreshCcw size={18} />
                      </button>
                    )}
                    {canEdit && (
                      <button 
                        onClick={() => {
                          setEditingItem(item);
                          reset({
                            name: item.name,
                            type: item.category as any,
                            quantity: item.quantity,
                            unit: item.unit,
                            conversionRate: item.conversionRate || 1,
                            minThreshold: item.minThreshold,
                            pricePerUnit: item.pricePerUnit,
                            supplierId: item.supplierId || ''
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-brand hover:bg-brand/10 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                    )}
                    {canDelete && (
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-2 border-y border-border">
                  <div>
                    <p className="text-xs text-content-muted mb-1">{t('inventory.quantity')}</p>
                    <p className={`font-bold ${item.quantity <= item.minThreshold ? 'text-red-600' : 'text-content'}`}>
                      {item.quantity.toLocaleString('en-US')} {item.unit === 'meter' ? t('inventory.units.meter') : item.unit === 'roll' ? t('inventory.units.roll') : item.unit === 'spool' ? t('inventory.units.spool') : t('inventory.units.piece')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-content-muted mb-1">{t('inventory.price_per_unit')}</p>
                    <p className="font-bold text-content">{item.pricePerUnit.toLocaleString('en-US')} {t('common.currency')}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <Truck size={14} />
                    <span>{suppliers.find(s => s.id === item.supplierId)?.name || t('inventory.no_supplier', 'بدون مورد')}</span>
                  </div>
                  {item.quantity <= item.minThreshold && (
                    <div className="flex items-center gap-1 text-xs text-red-600 font-bold animate-pulse">
                      <AlertTriangle size={14} />
                      <span>{t('inventory.needs_order', 'تحتاج طلب!')}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((supplier) => (
            <motion.div 
              key={supplier.id}
              layout
              className="bg-surface p-5 rounded-2xl shadow-sm border border-border space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand/10 text-brand rounded-xl">
                    <Truck size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-content flex items-center gap-2">
                      {supplier.name}
                      {supplier.isTest && (
                         <span className="text-[10px] bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1">
                          <Zap size={10} />
                          {t('common.test')}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-content-muted">{supplier.contactPerson}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setEditingSupplier(supplier);
                      resetSupplier({
                        name: supplier.name,
                        contactPerson: supplier.contactPerson,
                        email: supplier.email,
                        phone: supplier.phone,
                        address: supplier.address,
                        category: supplier.category,
                        isTest: supplier.isTest || false
                      });
                      setIsSupplierModalOpen(true);
                    }}
                    className="p-2 text-brand hover:bg-brand/10 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteSupplier(supplier.id)}
                    className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-content-muted">
                  <Phone size={14} />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-content-muted">
                  <Search size={14} />
                  <span>{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-content-muted">
                  <MapPin size={14} />
                  <span className="truncate">{supplier.address}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-1 rounded-lg">
                  {supplier.category === 'fabric' ? t('inventory.fabric') : 
                   supplier.category === 'thread' ? t('inventory.thread') : 
                   supplier.category === 'button' ? t('inventory.button') : 
                   supplier.category === 'lining' ? t('inventory.lining') : t('common.other')}
                </span>
              </div>
            </motion.div>
          ))}
          {suppliers.length === 0 && (
            <div className="md:col-span-2 lg:col-span-3 p-12 text-center text-content-muted bg-surface rounded-2xl border border-dashed border-border">
              <Truck className="mx-auto mb-4 opacity-20" size={48} />
              <p>{t('suppliers.no_suppliers', 'لا يوجد موردين مسجلين حالياً')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-surface-muted text-content-muted text-sm">
                <tr>
                  <th className="px-6 py-4 font-medium">{t('common.date')}</th>
                  <th className="px-6 py-4 font-medium">{t('inventory.item_name')}</th>
                  <th className="px-6 py-4 font-medium">{t('reconciliation.difference')}</th>
                  <th className="px-6 py-4 font-medium">{t('reconciliation.reason')}</th>
                  <th className="px-6 py-4 font-medium">{t('reconciliation.reconciled_by')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reconciliations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((recon) => (
                  <tr key={recon.id} className="hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-4 text-sm text-content-muted">
                      {new Date(recon.createdAt).toLocaleDateString('en-US')}
                    </td>
                    <td className="px-6 py-4 font-bold text-content">{recon.itemName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${recon.difference > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                        {recon.difference > 0 ? '+' : ''}{recon.difference}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-content-muted">{recon.reason}</td>
                    <td className="px-6 py-4 text-sm text-content-muted">{recon.staffName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reconciliations.length === 0 && (
            <div className="p-12 text-center text-content-muted">
              <History className="mx-auto mb-4 opacity-20" size={48} />
              <p>{t('reconciliation.no_reconciliations', 'لا يوجد سجل تسويات حالياً')}</p>
            </div>
          )}
        </div>
      )}

      {/* Item Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-border"
            >
            <div className="p-6 border-b border-border flex justify-between items-center bg-brand text-white">
              <h2 className="text-xl font-bold">
                {editingItem ? t('inventory.edit_item') : t('inventory.add_item')}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="hover:rotate-90 transition-transform">
                <XCircle size={24} />
              </button>
            </div>
              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.item_name')}</label>
                    <input 
                      {...register('name')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        errors.name && "border-red-500"
                      )}
                      placeholder={t('inventory.item_name_placeholder', 'مثلاً: قماش قطن ياباني أبيض')}
                    />
                    {errors.name && <p className="text-xs text-red-500 font-bold mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.category')}</label>
                    <select 
                      {...register('type')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    >
                      <option value="fabric">{t('inventory.fabric')}</option>
                      <option value="thread">{t('inventory.thread')}</option>
                      <option value="button">{t('inventory.button')}</option>
                      <option value="lining">{t('inventory.lining')}</option>
                      <option value="other">{t('common.other')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.unit')}</label>
                    <select 
                      {...register('unit')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    >
                      <option value="meter">{t('inventory.units.meter')}</option>
                      <option value="yard">{t('inventory.units.yard', 'ياردة')}</option>
                      <option value="roll">{t('inventory.units.roll')}</option>
                      <option value="bolt">{t('inventory.units.bolt', 'طاقة')}</option>
                      <option value="piece">{t('inventory.units.piece')}</option>
                      <option value="spool">{t('inventory.units.spool')}</option>
                      <option value="box">{t('inventory.units.box')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">
                      {t('inventory.conversion_rate', 'معامل التحويل (إلى متر)')}
                    </label>
                    <input 
                      type="number"
                      step="0.0001"
                      {...register('conversionRate')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                        errors.conversionRate && "border-red-500"
                      )}
                      placeholder="مثلاً: 0.9144 للياردة"
                    />
                    {errors.conversionRate && <p className="text-xs text-red-500 font-bold mt-1">{errors.conversionRate.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.quantity')}</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register('quantity')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                        errors.quantity && "border-red-500"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.min_threshold')}</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register('minThreshold')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('inventory.price_per_unit')}</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register('pricePerUnit')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.title')}</label>
                    <select 
                      {...register('supplierId')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    >
                      <option value="">{t('inventory.select_supplier', 'اختر مورداً...')}</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* isTest Flag */}
                  <div className="md:col-span-2 flex items-center gap-3 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 mt-2">
                    <input
                      type="checkbox"
                      id="isTest"
                      {...register('isTest')}
                      className="w-5 h-5 text-brand border-border rounded focus:ring-brand"
                    />
                    <label htmlFor="isTest" className="text-sm font-bold text-amber-600 flex items-center gap-2">
                      <Zap size={16} />
                      {t('common.test_data', 'بيانات تجريبية (Test Data)')}
                    </label>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('common.saving') : (editingItem ? t('common.save_changes') : t('inventory.add_item'))}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supplier Modal */}
      <AnimatePresence>
        {isSupplierModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-border"
            >
              <div className="p-6 border-b border-border flex justify-between items-center bg-brand text-white">
                <h2 className="text-xl font-bold">
                  {editingSupplier ? t('suppliers.edit_supplier') : t('suppliers.add_supplier')}
                </h2>
                <button onClick={() => setIsSupplierModalOpen(false)} className="hover:rotate-90 transition-transform">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmitSupplier(onSupplierSubmit)} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.name')}</label>
                    <input 
                      {...registerSupplier('name')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        supplierErrors.name && "border-red-500"
                      )}
                    />
                    {supplierErrors.name && <p className="text-xs text-red-500 font-bold mt-1">{supplierErrors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.contact_person')}</label>
                    <input 
                      {...registerSupplier('contactPerson')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        supplierErrors.contactPerson && "border-red-500"
                      )}
                    />
                    {supplierErrors.contactPerson && <p className="text-xs text-red-500 font-bold mt-1">{supplierErrors.contactPerson.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.phone')}</label>
                    <input 
                      {...registerSupplier('phone')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        supplierErrors.phone && "border-red-500"
                      )}
                    />
                    {supplierErrors.phone && <p className="text-xs text-red-500 font-bold mt-1">{supplierErrors.phone.message}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.email')}</label>
                    <input 
                      type="email"
                      {...registerSupplier('email')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        supplierErrors.email && "border-red-500"
                      )}
                    />
                    {supplierErrors.email && <p className="text-xs text-red-500 font-bold mt-1">{supplierErrors.email.message}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.address')}</label>
                    <input 
                      type="text"
                      {...registerSupplier('address')}
                      className={cn(
                        "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content placeholder-content-muted",
                        supplierErrors.address && "border-red-500"
                      )}
                    />
                    {supplierErrors.address && <p className="text-xs text-red-500 font-bold mt-1">{supplierErrors.address.message}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-content-muted mb-1">{t('suppliers.specialty')}</label>
                    <select 
                      {...registerSupplier('category')}
                      className="w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
                    >
                      <option value="fabric">{t('inventory.fabric')}</option>
                      <option value="thread">{t('inventory.thread')}</option>
                      <option value="button">{t('inventory.button')}</option>
                      <option value="lining">{t('inventory.lining')}</option>
                      <option value="other">{t('common.other')}</option>
                    </select>
                  </div>

                  {/* isTest Flag */}
                  <div className="md:col-span-2 flex items-center gap-3 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                    <input
                      type="checkbox"
                      id="supplierIsTest"
                      {...registerSupplier('isTest')}
                      className="w-5 h-5 text-brand border-border rounded focus:ring-brand"
                    />
                    <label htmlFor="supplierIsTest" className="text-sm font-bold text-amber-600 flex items-center gap-2">
                      <Zap size={16} />
                      {t('common.test_data')}
                    </label>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={isSubmittingSupplier}
                  className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingSupplier ? t('common.saving') : (editingSupplier ? t('common.save_changes') : t('suppliers.add_supplier'))}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reconciliation Modal */}
      <AnimatePresence>
        {isReconcileModalOpen && selectedItemForReconcile && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border"
            >
              <div className="p-6 border-b border-border bg-orange-500 text-white flex justify-between items-center">
                <h2 className="text-xl font-bold">{t('reconciliation.title')}: {selectedItemForReconcile.name}</h2>
                <button onClick={() => setIsReconcileModalOpen(false)}>
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmitReconcile(onReconcileSubmit)} className="p-6 space-y-4">
                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 text-sm text-orange-600">
                  <p>{t('inventory.quantity')}: <strong>{selectedItemForReconcile.quantity}</strong></p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">{t('reconciliation.actual')}</label>
                  <input 
                    type="number"
                    step="0.01"
                    {...registerReconcile('actualQuantity')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-content",
                      reconcileErrors.actualQuantity && "border-red-500"
                    )}
                  />
                  {reconcileErrors.actualQuantity && <p className="text-xs text-red-500 font-bold mt-1">{reconcileErrors.actualQuantity.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">{t('reconciliation.reason')}</label>
                  <select 
                    {...registerReconcile('reason')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-content",
                      reconcileErrors.reason && "border-red-500"
                    )}
                  >
                    <option value="">{t('reconciliation.select_reason')}</option>
                    <option value="damaged">{t('inventory.damaged')}</option>
                    <option value="lost">{t('inventory.lost')}</option>
                    <option value="correction">{t('inventory.correction')}</option>
                    <option value="return">{t('inventory.return')}</option>
                    <option value="other">{t('common.other')}</option>
                  </select>
                  {reconcileErrors.reason && <p className="text-xs text-red-500 font-bold mt-1">{reconcileErrors.reason.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">{t('reconciliation.reconciled_by')}</label>
                  <select 
                    {...registerReconcile('staffId')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-content",
                      reconcileErrors.staffId && "border-red-500"
                    )}
                  >
                    <option value="">{t('common.select_staff')}</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {reconcileErrors.staffId && <p className="text-xs text-red-500 font-bold mt-1">{reconcileErrors.staffId.message}</p>}
                </div>
                <button 
                  type="submit"
                  disabled={isSubmittingReconcile}
                  className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-colors mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingReconcile ? t('common.saving') : t('reconciliation.update_quantity')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
