import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  Trash2, 
  Edit2, 
  Briefcase,
  Layers,
  Scissors,
  CircleDot,
  Package,
  ExternalLink,
  MessageSquare
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
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier, PurchaseOrder, PurchaseReturn, InventoryItem } from '../types';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierSchema } from '../lib/validations';
import { cn } from '../lib/utils';
import PurchaseOrders from './PurchaseOrders';
import PurchaseReturns from './PurchaseReturns';

export default function Suppliers({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchase_orders' | 'returns'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      taxNumber: '',
      category: 'fabric' as const
    }
  });

  useEffect(() => {
    if (!tenantId) return;

    const q = query(collection(db, 'suppliers'), where('tenantId', '==', tenantId));
    const unsubscribeSuppliers = onSnapshot(q, (snapshot) => {
      const suppliersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(suppliersData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'suppliers');
    });

    const qPO = query(collection(db, 'purchaseOrders'), where('tenantId', '==', tenantId));
    const unsubscribePO = onSnapshot(qPO, (snapshot) => {
      const poData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
      setPurchaseOrders(poData);
    });

    const qReturns = query(collection(db, 'purchaseReturns'), where('tenantId', '==', tenantId));
    const unsubscribeReturns = onSnapshot(qReturns, (snapshot) => {
      const returnsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseReturn));
      setPurchaseReturns(returnsData);
    });

    const qInv = query(collection(db, 'inventory'), where('tenantId', '==', tenantId));
    const unsubscribeInv = onSnapshot(qInv, (snapshot) => {
      const invData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(invData);
    });

    return () => {
      unsubscribeSuppliers();
      unsubscribePO();
      unsubscribeReturns();
      unsubscribeInv();
    };
  }, [tenantId]);

  const onSubmit = async (data: any) => {
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...data,
          balance: 0,
          tenantId,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingSupplier(null);
      reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'suppliers');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'suppliers');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'fabric': return <Layers size={20} />;
      case 'thread': return <Scissors size={20} />;
      case 'button': return <CircleDot size={20} />;
      default: return <Package size={20} />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'fabric': return 'أقمشة';
      case 'thread': return 'خيوط';
      case 'button': return 'أزرار';
      default: return 'أخرى';
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">الموردين والمشتريات</h1>
          <p className="text-content-muted">إدارة الموردين، أوامر الشراء، والمرتجعات</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {activeTab === 'suppliers' && (
            <button 
              onClick={() => {
                setEditingSupplier(null);
                setIsModalOpen(true);
              }}
              className="flex-1 md:flex-none bg-[#1C8FFF] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-[#1C8FFF]/90 transition-colors"
            >
              <Plus size={20} />
              <span>إضافة مورد</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={cn(
            "px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap border-b-2",
            activeTab === 'suppliers' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-content-muted hover:text-content"
          )}
        >
          سجل الموردين
        </button>
        <button
          onClick={() => setActiveTab('purchase_orders')}
          className={cn(
            "px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap border-b-2",
            activeTab === 'purchase_orders' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-content-muted hover:text-content"
          )}
        >
          أوامر الشراء
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={cn(
            "px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap border-b-2",
            activeTab === 'returns' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-content-muted hover:text-content"
          )}
        >
          المرتجعات
        </button>
      </div>

      {activeTab === 'suppliers' && (
        <>
          {/* Filters & Search */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              categoryFilter === 'all' 
                ? "bg-brand text-white shadow-md shadow-brand/10" 
                : "bg-surface text-content-muted border border-border hover:bg-surface-muted"
            )}
          >
            الكل
          </button>
          {[
            { id: 'fabric', label: 'أقمشة' },
            { id: 'thread', label: 'خيوط' },
            { id: 'button', label: 'أزرار' },
            { id: 'other', label: 'أخرى' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                categoryFilter === cat.id 
                  ? "bg-brand text-white shadow-md shadow-brand/10" 
                  : "bg-surface text-content-muted border border-border hover:bg-surface-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
          <input 
            type="text"
            placeholder="بحث عن مورد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content"
          />
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.map((supplier) => (
          <motion.div 
            key={supplier.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface p-6 rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col"
          >
            {/* Card Header */}
            <div className="p-6 pb-4 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-colors",
                  supplier.category === 'fabric' ? "bg-blue-500/10 text-blue-600" :
                  supplier.category === 'thread' ? "bg-emerald-500/10 text-emerald-600" :
                  supplier.category === 'button' ? "bg-amber-500/10 text-amber-600" :
                  "bg-surface-muted text-content-muted"
                )}>
                  {getCategoryIcon(supplier.category)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-content truncate group-hover:text-brand transition-colors">
                    {supplier.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                      supplier.category === 'fabric' ? "bg-blue-500/10 text-blue-700" :
                      supplier.category === 'thread' ? "bg-emerald-500/10 text-emerald-700" :
                      supplier.category === 'button' ? "bg-amber-500/10 text-amber-700" :
                      "bg-surface-muted text-content-muted"
                    )}>
                      {getCategoryLabel(supplier.category)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                <button 
                  onClick={() => {
                    setEditingSupplier(supplier);
                    reset({
                      name: supplier.name,
                      contactPerson: supplier.contactPerson,
                      email: supplier.email,
                      phone: supplier.phone,
                      address: supplier.address,
                      category: supplier.category as any
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-content-muted hover:text-brand hover:bg-brand/10 rounded-xl transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(supplier.id)}
                  className="p-2 text-content-muted hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Card Body */}
            <div className="px-6 pb-6 space-y-4 flex-1">
              <div className="bg-surface-muted/50 rounded-2xl p-4 space-y-3 border border-border group-hover:bg-surface group-hover:border-brand/20 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-content-muted">
                    <Users size={14} className="text-brand" />
                    <span className="text-xs font-bold">المسؤول:</span>
                  </div>
                  <span className="text-sm font-black text-content">{supplier.contactPerson}</span>
                </div>
                
                <div className="h-px bg-border" />
                
                <div className="space-y-2">
                  <a 
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-3 text-content-muted hover:text-brand transition-colors group/link"
                  >
                    <div className="p-1.5 bg-surface rounded-lg border border-border group-hover/link:border-brand/30 shadow-sm">
                      <Phone size={14} className="text-content-muted group-hover/link:text-brand" />
                    </div>
                    <span className="text-sm font-bold">{supplier.phone}</span>
                  </a>
                  
                  <a 
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-3 text-content-muted hover:text-brand transition-colors group/link"
                  >
                    <div className="p-1.5 bg-surface rounded-lg border border-border group-hover/link:border-brand/30 shadow-sm">
                      <Mail size={14} className="text-content-muted group-hover/link:text-brand" />
                    </div>
                    <span className="text-sm font-bold truncate">{supplier.email}</span>
                  </a>

                  <div className="flex items-center gap-3 text-content-muted">
                    <div className="p-1.5 bg-surface rounded-lg border border-border shadow-sm">
                      <MapPin size={14} className="text-content-muted" />
                    </div>
                    <span className="text-sm font-bold truncate">{supplier.address}</span>
                  </div>
                  {supplier.taxNumber && (
                    <div className="flex items-center gap-3 text-content-muted">
                      <div className="p-1.5 bg-surface rounded-lg border border-border shadow-sm">
                        <Briefcase size={14} className="text-content-muted" />
                      </div>
                      <span className="text-sm font-bold truncate">الرقم الضريبي: {supplier.taxNumber}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-sm font-bold text-content-muted">الرصيد المستحق:</span>
                    <span className={cn(
                      "text-lg font-black",
                      supplier.balance > 0 ? "text-red-600" : "text-[#22C55E]"
                    )}>{supplier.balance.toLocaleString()} ﷼</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-2">
                <button className="flex-1 bg-brand text-white py-3 rounded-2xl text-xs font-black hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/10">
                  <MessageSquare size={16} />
                  <span>تواصل سريع</span>
                </button>
                <button className="p-3 bg-brand/10 text-brand rounded-2xl hover:bg-brand hover:text-white transition-all border border-brand/20">
                  <ExternalLink size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredSuppliers.length === 0 && !loading && (
        <div className="p-12 text-center text-content-muted bg-surface rounded-2xl border border-dashed border-border">
          <Users className="mx-auto mb-4 opacity-20" size={48} />
          <p>لا يوجد موردين مسجلين حالياً</p>
        </div>
      )}
        </>
      )}

      {activeTab === 'purchase_orders' && (
        <PurchaseOrders 
          tenantId={tenantId}
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          inventory={inventory}
        />
      )}

      {activeTab === 'returns' && (
        <PurchaseReturns 
          tenantId={tenantId}
          suppliers={suppliers}
          purchaseReturns={purchaseReturns}
          inventory={inventory}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border"
          >
            <div className="p-6 border-b border-border flex justify-between items-center bg-surface-muted">
              <h2 className="text-xl font-bold text-content">
                {editingSupplier ? 'تعديل مورد' : 'إضافة مورد جديد'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-content-muted hover:text-content">
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">اسم الشركة/المورد</label>
                <input 
                  {...register('name')}
                  className={cn(
                    "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                    errors.name && "border-red-500"
                  )}
                />
                {errors.name && <p className="text-xs text-red-500 font-bold mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">الشخص المسؤول</label>
                <input 
                  {...register('contactPerson')}
                  className={cn(
                    "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                    errors.contactPerson && "border-red-500"
                  )}
                />
                {errors.contactPerson && <p className="text-xs text-red-500 font-bold mt-1">{errors.contactPerson.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">البريد الإلكتروني</label>
                  <input 
                    type="email"
                    {...register('email')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                      errors.email && "border-red-500"
                    )}
                  />
                  {errors.email && <p className="text-xs text-red-500 font-bold mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">رقم الهاتف</label>
                  <input 
                    type="tel"
                    {...register('phone')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none text-content",
                      errors.phone && "border-red-500"
                    )}
                  />
                  {errors.phone && <p className="text-xs text-red-500 font-bold mt-1">{errors.phone.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">الرقم الضريبي (اختياري)</label>
                  <input 
                    {...register('taxNumber')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none text-content",
                      errors.taxNumber && "border-red-500"
                    )}
                  />
                  {errors.taxNumber && <p className="text-xs text-red-500 font-bold mt-1">{errors.taxNumber.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">التصنيف</label>
                  <select 
                    {...register('category')}
                    className={cn(
                      "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none text-content",
                      errors.category && "border-red-500"
                    )}
                  >
                    <option value="fabric">أقمشة</option>
                    <option value="accessories">إكسسوارات</option>
                    <option value="thread">خيوط</option>
                    <option value="button">أزرار</option>
                    <option value="lining">بطانات</option>
                    <option value="other">أخرى</option>
                  </select>
                  {errors.category && <p className="text-xs text-red-500 font-bold mt-1">{errors.category.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">العنوان</label>
                <textarea 
                  {...register('address')}
                  className={cn(
                    "w-full px-4 py-2 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand outline-none h-20 resize-none text-content",
                    errors.address && "border-red-500"
                  )}
                />
                {errors.address && <p className="text-xs text-red-500 font-bold mt-1">{errors.address.message}</p>}
              </div>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#1C8FFF] text-white py-3 rounded-xl font-bold hover:bg-[#1C8FFF]/90 transition-colors mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'جاري الحفظ...' : (editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد')}
              </button>
            </form>
          </motion.div>
        </div>
      )}
      
      {/* Footer Branding */}
      <div className="pt-8 flex justify-center">
        <a href="https://wodohtech.com" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-content-muted hover:text-[#1C8FFF] transition-colors">
          Powered By Wodoh Tech
        </a>
      </div>
    </div>
  );
}
