import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  UserPlus,
  Users,
  Phone,
  Ruler,
  Trash2,
  Edit2,
  History,
  ShoppingBag,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  ExternalLink,
  Zap,
  ArrowUpDown,
  Filter,
  ArrowLeftRight,
  User,
  Scissors
} from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, where, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Customer, Measurements, Styles, Order, ThobeMeasurements } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema } from '../lib/validations';
import { formatCurrency, cn } from '../lib/utils';
import Header from './Header';
import ThobeMeasurementSelector from './ThobeMeasurementSelector';
import { useStaff } from '../contexts/StaffContext';
import { usePermissions } from '../hooks/usePermissions';
import { PermissionKey } from '../types';

interface CustomersProps {
  tenantId: string;
}

export default function Customers({ tenantId }: CustomersProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');
  const [filter, setFilter] = useState<'all' | 'measurements' | 'recent' | 'test'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const { currentStaff } = useStaff();
  const { hasPermission, checkPermission } = usePermissions(currentStaff);
  const navigate = useNavigate();

  const canCreate = hasPermission('customers.create');
  const canEdit = hasPermission('customers.edit');
  const canDelete = hasPermission('customers.delete');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(customerSchema)
  });

  const watchMeasurements = watch('measurements');

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, 'customers'), 
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });
    return () => unsubscribe();
  }, [tenantId]);

  const fetchCustomerOrders = async (customerId: string) => {
    try {
      const q = query(
        collection(db, 'orders'),
        where('tenantId', '==', tenantId),
        where('customerId', '==', customerId),
        orderBy('orderDate', 'desc')
      );
      const snap = await getDocs(q);
      setCustomerOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    }
  };

  const onSubmit = async (data: any) => {
    if (!tenantId) return;

    const permission = editingCustomer ? 'customers.edit' : 'customers.create';
    const allowed = await checkPermission(permission, 'إدارة العملاء');
    if (!allowed) return;
    
    const customerData = {
      ...data,
      tenantId,
      createdAt: editingCustomer?.createdAt || new Date().toISOString(),
      updatedBy: currentStaff?.name || auth.currentUser?.displayName || 'المالك',
      updatedByUid: currentStaff?.id || auth.currentUser?.uid || 'owner',
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), customerData);
      } else {
        await addDoc(collection(db, 'customers'), customerData);
      }
      setIsModalOpen(false);
      setEditingCustomer(null);
      reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  };

  const handleDelete = async (id: string) => {
    const allowed = await checkPermission('customers.delete', 'إدارة العملاء');
    if (!allowed) return;

    if (window.confirm('هل أنت متأكد من حذف هذا العميل؟')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'customers');
      }
    }
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    reset(customer);
    setIsModalOpen(true);
  };

  const openDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    fetchCustomerOrders(customer.id);
    setIsDetailsOpen(true);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const VISUAL_LABELS: Record<string, string> = {
    'classic': 'كلاسيك',
    'mandarin': 'صيني',
    'square': 'مربع',
    'round': 'دائري',
    'hidden': 'مخفي',
    'visible': 'ظاهر',
    'plain': 'سادة',
    'pleated': 'كسرات',
    'padded': 'حشوة',
    'double': 'دبل'
  };

  const VISUAL_ICONS: Record<string, React.ReactNode> = {
    'classic': <div className="w-10 h-5 border-2 border-current rounded-t-xl" />,
    'mandarin': <div className="w-10 h-3 border-2 border-current rounded-t-md" />,
    'square': <div className="w-8 h-8 border-2 border-current" />,
    'round': <div className="w-8 h-8 border-2 border-current rounded-full" />,
    'hidden': <div className="w-8 h-8 border-2 border-dashed border-current opacity-50" />,
    'visible': <div className="w-8 h-8 border-2 border-current rounded-b-xl" />,
    'plain': <div className="w-10 h-10 border-2 border-current" />,
    'pleated': <div className="w-10 h-10 border-2 border-current flex gap-1.5 px-1.5"><div className="w-0.5 h-full bg-current"/><div className="w-0.5 h-full bg-current"/><div className="w-0.5 h-full bg-current"/></div>,
    'padded': <div className="w-10 h-10 border-2 border-current flex items-center justify-center"><div className="w-8 h-3 bg-current opacity-20"/></div>,
    'double': <div className="w-10 h-10 border-2 border-current flex flex-col gap-1.5 p-1.5"><div className="h-0.5 w-full bg-current"/><div className="h-0.5 w-full bg-current"/></div>
  };

  const filteredCustomers = customers
    .filter(c => {
      // Search filter
      const searchLower = search.toLowerCase().trim();
      const matchesSearch = !searchLower || searchLower.split(/\s+/).every(term => 
        c.name.toLowerCase().includes(term) || 
        c.phone.includes(term)
      );
      if (!matchesSearch) return false;

      // Category filter
      if (filter === 'measurements') {
        const hasMeasurements = c.measurements && Object.values(c.measurements).some(v => v !== undefined && v !== null && v !== '');
        if (!hasMeasurements) return false;
      }
      if (filter === 'recent') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (new Date(c.createdAt) < sevenDaysAgo) return false;
      }
      if (filter === 'test') {
        if (!c.isTest) return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const VisualPart = ({ label, icon: Icon, value, options, onChange }: any) => (
    <div className="space-y-3 p-4 bg-surface rounded-2xl border border-border shadow-sm hover:border-brand/40 transition-all group">
      <div className="flex items-center gap-2 text-content-muted group-hover:text-brand transition-colors">
        <Icon size={18} />
        <span className="text-xs font-black uppercase tracking-wider">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt: any) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
              value === opt.id 
                ? "bg-brand/10 border-brand text-brand" 
                : "bg-surface-muted border-transparent text-content-muted hover:bg-surface"
            )}
          >
            <div className="w-10 h-10 flex items-center justify-center">
              {opt.icon}
            </div>
            <span className="text-[10px] font-bold">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <Header 
        tenantId={tenantId} 
        title="العملاء" 
        subtitle="إدارة بيانات العملاء وقياساتهم"
      >
        {canCreate && (
          <button 
            onClick={() => { setEditingCustomer(null); reset({}); setIsModalOpen(true); }}
            className="bg-brand text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/10"
          >
            <UserPlus size={20} />
            <span>إضافة عميل جديد</span>
          </button>
        )}
      </Header>

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 bg-surface p-4 rounded-3xl border border-border shadow-sm flex items-center gap-3 group focus-within:border-brand/40 transition-all">
            <Search size={20} className="text-content-muted group-focus-within:text-brand transition-colors" />
            <input 
              type="text" 
              placeholder="ابحث عن عميل بالاسم أو رقم الهاتف..." 
              className="flex-1 bg-transparent border-none focus:ring-0 text-content placeholder-content-muted font-bold"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="p-1 hover:bg-surface-muted rounded-full text-content-muted hover:text-brand transition-all"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setSortBy(sortBy === 'name' ? 'date' : 'name')}
              className="bg-surface px-6 py-3 rounded-2xl border border-border shadow-sm flex items-center gap-2 text-content font-bold hover:bg-surface-muted transition-all active:scale-95"
            >
              <ArrowUpDown size={18} className="text-brand" />
              <span>{sortBy === 'name' ? 'ترتيب حسب الاسم' : 'ترتيب حسب التاريخ'}</span>
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'الكل', icon: Users },
            { id: 'measurements', label: 'بقياسات', icon: Ruler },
            { id: 'recent', label: 'أضيف حديثاً', icon: History },
            { id: 'test', label: 'تجريبي', icon: Zap },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id as any)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition-all border-2",
                filter === chip.id 
                  ? "bg-brand border-brand text-white shadow-lg shadow-brand/20 scale-105" 
                  : "bg-surface border-border text-content-muted hover:border-brand/30 hover:text-brand"
              )}
            >
              <chip.icon size={16} />
              <span>{chip.label}</span>
              {filter === chip.id && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
                  {filteredCustomers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
          <motion.div
            layout
            key={customer.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface p-6 rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all group relative overflow-hidden"
          >
            {customer.isTest && (
              <div className="absolute top-0 left-0 bg-amber-500/10 text-amber-600 px-4 py-1.5 rounded-br-2xl text-[10px] font-black uppercase flex items-center gap-1 z-10">
                <Zap size={10} />
                تجريبي
              </div>
            )}

            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-brand/10 text-brand rounded-2xl flex items-center justify-center text-xl font-black shadow-inner">
                  {getInitials(customer.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-black text-content truncate group-hover:text-brand transition-colors">
                    {customer.name}
                  </h3>
                  <a 
                    href={`tel:${customer.phone}`} 
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-content-muted font-bold flex items-center gap-1 hover:text-brand transition-colors mt-1"
                  >
                    <Phone size={12} />
                    <span>{customer.phone}</span>
                  </a>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                {canEdit && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); openEditModal(customer); }} 
                    className="p-2 text-content-muted hover:text-brand hover:bg-brand/10 rounded-xl transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                )}
                {canDelete && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(customer.id); }} 
                    className="p-2 text-content-muted hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-muted/50 p-4 rounded-2xl border border-border group-hover:bg-surface group-hover:border-brand/20 transition-all">
                  <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-black uppercase mb-1">
                    <Ruler size={12} />
                    <span>الطول</span>
                  </div>
                  <p className="text-lg font-black text-content">
                    {customer.measurements?.length || '-'} 
                    <span className="text-[10px] text-content-muted mr-1">سم</span>
                  </p>
                </div>
                <div className="bg-surface-muted/50 p-4 rounded-2xl border border-border group-hover:bg-surface group-hover:border-brand/20 transition-all">
                  <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-black uppercase mb-1">
                    <Ruler size={12} />
                    <span>الكتف</span>
                  </div>
                  <p className="text-lg font-black text-content">
                    {customer.measurements?.shoulder || '-'} 
                    <span className="text-[10px] text-content-muted mr-1">سم</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => openDetails(customer)}
                  className="flex-1 bg-brand text-white py-3.5 rounded-2xl text-sm font-bold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/10"
                >
                  <Info size={18} />
                  <span>عرض الملف الكامل</span>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/orders?customerId=${customer.id}`);
                  }}
                  className="p-3.5 bg-brand/10 text-brand rounded-2xl hover:bg-brand hover:text-white transition-all border border-brand/20"
                  title="طلب جديد"
                >
                  <Plus size={22} />
                </button>
              </div>
            </div>
          </motion.div>
        )) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center bg-surface rounded-[3rem] border-2 border-dashed border-border text-content-muted">
            <div className="p-6 bg-surface-muted rounded-full mb-4">
              <Search size={48} className="opacity-20" />
            </div>
            <h3 className="text-xl font-black text-content mb-2">لم يتم العثور على نتائج</h3>
            <p className="text-sm font-bold">جرب تغيير كلمات البحث أو الفلاتر المختارة</p>
            <button 
              onClick={() => { setSearch(''); setFilter('all'); }}
              className="mt-6 text-brand font-black hover:underline"
            >
              إعادة تعيين البحث
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface w-full max-w-6xl rounded-3xl shadow-2xl relative z-10 overflow-hidden max-h-[90vh] overflow-y-auto text-right border border-border"
              dir="rtl"
            >
              <form onSubmit={handleSubmit(onSubmit)} className="p-8">
                <h3 className="text-2xl font-bold text-content mb-6">
                  {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-content-muted">الاسم الكامل</label>
                    <input 
                      {...register('name')} 
                      className={cn(
                        "w-full bg-surface-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-brand text-content",
                        errors.name && "ring-2 ring-red-500"
                      )} 
                    />
                    {errors.name && <p className="text-xs text-red-500 font-bold">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-content-muted">رقم الهاتف</label>
                    <input 
                      {...register('phone')} 
                      className={cn(
                        "w-full bg-surface-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-brand text-content",
                        errors.phone && "ring-2 ring-red-500"
                      )} 
                    />
                    {errors.phone && <p className="text-xs text-red-500 font-bold">{errors.phone.message}</p>}
                  </div>
                </div>

                <h4 className="text-lg font-bold text-content mb-4 flex items-center gap-2">
                  <Ruler size={20} className="text-brand" />
                  القياسات الأساسية
                </h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {['length', 'shoulder', 'chest', 'waist', 'hips', 'sleeve', 'neck'].map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium text-content-muted">
                        {field === 'length' ? 'الطول' : 
                         field === 'shoulder' ? 'الكتف' :
                         field === 'chest' ? 'الصدر' :
                         field === 'waist' ? 'الخصر' :
                         field === 'hips' ? 'الأرداف' :
                         field === 'sleeve' ? 'الكم' : 'الرقبة'}
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        {...register(`measurements.${field}` as any)} 
                        className="w-full bg-surface-muted border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand text-content" 
                      />
                    </div>
                  ))}
                </div>

                <h4 className="text-lg font-bold text-content mb-4 flex items-center gap-2">
                  <Zap size={20} className="text-brand" />
                  التفاصيل البصرية والمقاسات التفاعلية
                </h4>

                <div className="mb-8">
                  <ThobeMeasurementSelector 
                    values={(watchMeasurements?.thobeMeasurements as ThobeMeasurements) || {
                      collar: 0,
                      chest: 0,
                      shoulders: 0,
                      sleeves: 0,
                      length: 0,
                      bottomWidth: 0
                    }}
                    onChange={(newMeasurements) => setValue('measurements.thobeMeasurements' as any, newMeasurements)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <VisualPart
                    label="نوع الياقة"
                    icon={ChevronLeft}
                    value={watchMeasurements?.collarType}
                    onChange={(val: string) => setValue('measurements.collarType', val)}
                    options={[
                      { id: 'classic', label: 'كلاسيك', icon: <div className="w-8 h-4 border-2 border-current rounded-t-lg" /> },
                      { id: 'mandarin', label: 'صيني', icon: <div className="w-8 h-2 border-2 border-current rounded-t-sm" /> },
                    ]}
                  />
                  <VisualPart
                    label="نوع الكبك"
                    icon={ChevronLeft}
                    value={watchMeasurements?.cuffType}
                    onChange={(val: string) => setValue('measurements.cuffType', val)}
                    options={[
                      { id: 'square', label: 'مربع', icon: <div className="w-6 h-6 border-2 border-current" /> },
                      { id: 'round', label: 'دائري', icon: <div className="w-6 h-6 border-2 border-current rounded-full" /> },
                    ]}
                  />
                  <VisualPart
                    label="نوع الجيب"
                    icon={ChevronLeft}
                    value={watchMeasurements?.pocketType}
                    onChange={(val: string) => setValue('measurements.pocketType', val)}
                    options={[
                      { id: 'hidden', label: 'مخفي', icon: <div className="w-6 h-6 border-2 border-dashed border-current" /> },
                      { id: 'visible', label: 'ظاهر', icon: <div className="w-6 h-6 border-2 border-current rounded-b-lg" /> },
                    ]}
                  />
                  <VisualPart
                    label="شكل الصدر"
                    icon={ChevronLeft}
                    value={watchMeasurements?.chestStyle}
                    onChange={(val: string) => setValue('measurements.chestStyle', val)}
                    options={[
                      { id: 'plain', label: 'سادة', icon: <div className="w-8 h-8 border-2 border-current" /> },
                      { id: 'pleated', label: 'كسرات', icon: <div className="w-8 h-8 border-2 border-current flex gap-1 px-1"><div className="w-px h-full bg-current"/><div className="w-px h-full bg-current"/></div> },
                    ]}
                  />
                  <VisualPart
                    label="شكل الكتف"
                    icon={ChevronLeft}
                    value={watchMeasurements?.shoulderStyle}
                    onChange={(val: string) => setValue('measurements.shoulderStyle', val)}
                    options={[
                      { id: 'plain', label: 'سادة', icon: <div className="w-8 h-8 border-2 border-current" /> },
                      { id: 'padded', label: 'حشوة', icon: <div className="w-8 h-8 border-2 border-current flex items-center justify-center"><div className="w-6 h-2 bg-current opacity-20"/></div> },
                      { id: 'double', label: 'دبل', icon: <div className="w-8 h-8 border-2 border-current flex flex-col gap-1 p-1"><div className="h-px w-full bg-current"/><div className="h-px w-full bg-current"/></div> },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-brand/5 p-4 rounded-2xl">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand">شكل الرقبة</label>
                    <select {...register('styles.neckShape')} className="w-full bg-surface border-none rounded-lg p-2 text-sm text-content">
                      <option value="round">دائري</option>
                      <option value="v-neck">سبعة (V)</option>
                      <option value="square">مربع</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand">نوع الكم</label>
                    <select {...register('styles.sleeveStyle')} className="w-full bg-surface border-none rounded-lg p-2 text-sm text-content">
                      <option value="normal">عادي</option>
                      <option value="cuff">كبك</option>
                      <option value="wide">واسع</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand">الجيب</label>
                    <select {...register('styles.pocketType')} className="w-full bg-surface border-none rounded-lg p-2 text-sm text-content">
                      <option value="none">بدون</option>
                      <option value="single">واحد</option>
                      <option value="double">اثنين</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 mb-8">
                  <label className="text-sm font-bold text-content-muted">ملاحظات إضافية</label>
                  <textarea {...register('notes')} className="w-full bg-surface-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-brand h-24 text-content" />
                </div>

                {/* isTest Flag */}
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 mb-8">
                  <input
                    type="checkbox"
                    id="isTest"
                    {...register('isTest')}
                    className="w-5 h-5 text-brand border-border rounded focus:ring-brand"
                  />
                  <label htmlFor="isTest" className="text-sm font-bold text-amber-600 flex items-center gap-2">
                    <Zap size={16} />
                    بيانات تجريبية (Test Data)
                  </label>
                </div>

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-content-muted font-bold hover:bg-surface-muted rounded-xl">إلغاء</button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="bg-brand text-white px-8 py-3 rounded-xl font-bold hover:bg-brand/90 shadow-lg shadow-brand/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDetailsOpen && selectedCustomer && (
          <CustomerDetailsModal 
            customer={selectedCustomer} 
            onClose={() => setIsDetailsOpen(false)}
            onEdit={() => { setIsDetailsOpen(false); openEditModal(selectedCustomer); }}
            orders={customerOrders}
            onNewOrder={() => navigate(`/orders?customerId=${selectedCustomer.id}`)}
            visualLabels={VISUAL_LABELS}
            visualIcons={VISUAL_ICONS}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const DetailSection = ({ title, icon: Icon, children, defaultOpen = true }: any) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 flex items-center justify-between bg-surface-muted/50 hover:bg-surface-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-surface rounded-xl text-brand shadow-sm">
            <Icon size={20} />
          </div>
          <h3 className="text-sm font-black text-content uppercase tracking-widest">{title}</h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={20} className="text-content-muted" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-6 border-t border-border">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CustomerDetailsModal = ({ 
  customer, 
  onClose, 
  onEdit, 
  orders,
  onNewOrder,
  visualLabels,
  visualIcons
}: { 
  customer: Customer, 
  onClose: () => void,
  onEdit: () => void,
  orders: Order[],
  onNewOrder: () => void,
  visualLabels: Record<string, string>,
  visualIcons: Record<string, React.ReactNode>
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 backdrop-blur-md"
      onClick={onClose}
    />
    <motion.div 
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 20 }}
      className="bg-surface w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] border border-border"
    >
      <div className="p-6 border-b border-border flex justify-between items-center bg-brand/5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand text-white rounded-2xl">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-content">{customer.name}</h2>
            <p className="text-xs text-content-muted font-bold">{customer.phone}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
          <X size={24} className="text-content-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-right" dir="rtl">
        {/* Measurements Section */}
        <DetailSection title="القياسات الحالية" icon={Ruler}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'الطول', value: customer.measurements?.length, icon: <ArrowUpDown size={14} />, color: 'bg-blue-500/10 text-blue-600' },
              { label: 'الكتف', value: customer.measurements?.shoulder, icon: <ArrowLeftRight size={14} />, color: 'bg-brand/10 text-brand' },
              { label: 'الصدر', value: customer.measurements?.chest, icon: <Users size={14} />, color: 'bg-emerald-500/10 text-emerald-600' },
              { label: 'الخصر', value: customer.measurements?.waist, icon: <Filter size={14} />, color: 'bg-amber-500/10 text-amber-600' },
              { label: 'الأرداف', value: customer.measurements?.hips, icon: <ChevronDown size={14} />, color: 'bg-rose-500/10 text-rose-600' },
              { label: 'الكم', value: customer.measurements?.sleeve, icon: <Scissors size={14} />, color: 'bg-cyan-500/10 text-cyan-600' },
              { label: 'الرقبة', value: customer.measurements?.neck, icon: <User size={14} />, color: 'bg-purple-500/10 text-purple-600' },
            ].map((m) => (
              <div key={m.label} className="bg-surface p-4 rounded-2xl border border-border hover:border-brand/20 transition-all group shadow-sm hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("p-1.5 rounded-lg", m.color)}>
                    {m.icon}
                  </div>
                  <p className="text-[10px] text-content-muted font-black uppercase tracking-wider">{m.label}</p>
                </div>
                <p className="text-xl font-black text-content">
                  {m.value || '-'} 
                  <span className="text-[10px] text-content-muted mr-1 font-bold">سم</span>
                </p>
              </div>
            ))}
          </div>
        </DetailSection>

        {/* Visual Details Section */}
        <DetailSection title="مخطط التفصيل البصري" icon={Zap}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'الياقة', value: customer.measurements?.collarType, desc: 'نوع القبة' },
              { label: 'الكبك', value: customer.measurements?.cuffType, desc: 'نهاية الكم' },
              { label: 'الجيب', value: customer.measurements?.pocketType, desc: 'نوع الجيب' },
              { label: 'الصدر', value: customer.measurements?.chestStyle, desc: 'شكل الصدر' },
              { label: 'الكتف', value: customer.measurements?.shoulderStyle, desc: 'قصة الكتف' },
            ].map((v) => (
              <div key={v.label} className="bg-surface p-4 rounded-3xl border border-border flex flex-col items-center text-center group hover:border-brand/40 transition-all shadow-sm hover:shadow-md">
                <div className="w-16 h-16 bg-brand/5 text-brand rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-inner">
                  {v.value ? visualIcons[v.value] : <Info size={24} className="opacity-20" />}
                </div>
                <p className="text-[10px] text-brand/60 font-black uppercase tracking-widest mb-1">{v.label}</p>
                <p className="text-sm font-black text-content truncate w-full">
                  {v.value ? visualLabels[v.value] : 'غير محدد'}
                </p>
                <p className="text-[9px] text-content-muted font-bold mt-0.5">{v.desc}</p>
              </div>
            ))}
          </div>
        </DetailSection>

        {/* Garment Blueprint Section */}
        <DetailSection title="المخطط الهندسي للثوب" icon={Scissors}>
          <div className="bg-surface-muted/30 rounded-[2.5rem] p-4 border border-border">
            <ThobeMeasurementSelector 
              values={(customer.measurements?.thobeMeasurements as ThobeMeasurements) || {
                collar: 0,
                chest: 0,
                shoulders: 0,
                sleeves: 0,
                length: 0,
                bottomWidth: 0
              }}
              onChange={() => {}} // Read-only in details view
            />
          </div>
        </DetailSection>

        {/* Style Preferences Section */}
        <DetailSection title="تفضيلات التصميم" icon={ShoppingBag} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface-muted p-4 rounded-2xl border border-border">
              <span className="text-[10px] text-content-muted font-bold block mb-1">شكل الرقبة</span>
              <span className="text-sm font-bold text-content">
                {customer.styles?.neckShape === 'round' ? 'دائري' : customer.styles?.neckShape === 'v-neck' ? 'سبعة' : customer.styles?.neckShape === 'square' ? 'مربع' : '-'}
              </span>
            </div>
            <div className="bg-surface-muted p-4 rounded-2xl border border-border">
              <span className="text-[10px] text-content-muted font-bold block mb-1">نوع الكم</span>
              <span className="text-sm font-bold text-content">
                {customer.styles?.sleeveStyle === 'normal' ? 'عادي' : customer.styles?.sleeveStyle === 'cuff' ? 'كبك' : customer.styles?.sleeveStyle === 'wide' ? 'واسع' : '-'}
              </span>
            </div>
            <div className="bg-surface-muted p-4 rounded-2xl border border-border">
              <span className="text-[10px] text-content-muted font-bold block mb-1">الجيب</span>
              <span className="text-sm font-bold text-content">
                {customer.styles?.pocketType === 'none' ? 'بدون' : customer.styles?.pocketType === 'single' ? 'واحد' : customer.styles?.pocketType === 'double' ? 'اثنين' : '-'}
              </span>
            </div>
          </div>
        </DetailSection>

        {/* Order History Section */}
        <DetailSection title="سجل الطلبات" icon={History} defaultOpen={false}>
          <div className="space-y-3">
            {orders.length > 0 ? (
              orders.map((order) => (
                <div key={order.id} className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex items-center justify-between hover:border-brand/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-surface-muted rounded-xl text-content-muted">
                      <ShoppingBag size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-content">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-[10px] text-content-muted">{new Date(order.orderDate).toLocaleDateString('ar-SA')}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-brand">{formatCurrency(order.totalAmount)}</p>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      order.status === 'delivered' ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                    )}>
                      {order.status === 'delivered' ? 'تم التسليم' : 'قيد التنفيذ'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-surface-muted rounded-2xl border-2 border-dashed border-border text-content-muted">
                <p className="text-sm font-bold">لا توجد طلبات سابقة</p>
              </div>
            )}
          </div>
        </DetailSection>

        {customer.notes && (
          <DetailSection title="ملاحظات" icon={Info} defaultOpen={false}>
            <p className="text-sm text-content-muted leading-relaxed bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
              {customer.notes}
            </p>
          </DetailSection>
        )}
      </div>

      <div className="p-6 bg-surface-muted border-t border-border flex gap-3">
        <button 
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 bg-surface text-content py-4 rounded-2xl font-bold border border-border hover:bg-surface-muted transition-all"
        >
          <Edit2 size={20} />
          <span>تعديل البيانات</span>
        </button>
        <button 
          onClick={onNewOrder}
          className="flex-1 flex items-center justify-center gap-2 bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10"
        >
          <Plus size={20} />
          <span>طلب جديد</span>
        </button>
      </div>
    </motion.div>
  </div>
);
