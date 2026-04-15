import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  ShoppingBag,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  Trash2,
  Printer,
  QrCode,
  Share2,
  MessageSquare,
  CreditCard,
  User,
  X,
  History,
  Image as ImageIcon,
  Scissors,
  CheckSquare,
  Package,
  Truck,
  MoreHorizontal,
  Info,
  Filter,
  Zap,
  UserPlus,
  Ruler,
  ChevronLeft,
  Shield,
  FileSpreadsheet
} from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, getDocs, deleteDoc, doc, updateDoc, where, serverTimestamp, arrayUnion, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order, Customer, OrderStatus, OrderHistory, InventoryItem, PaymentMethod, OrderItem, Staff, Tenant, ThobeMeasurements } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import Header from './Header';
import VisualMeasurements from './VisualMeasurements';
import ThobeMeasurementSelector from './ThobeMeasurementSelector';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '../hooks/usePermissions';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { orderSchema, customerSchema } from '../lib/validations';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import Branding from './Branding';
import { checkStockAvailability, deductStock } from '../services/inventoryService';
import { useStaff } from '../contexts/StaffContext';
import { useBranding } from '../contexts/BrandingContext';
import { analytics, AnalyticsEvent } from '../services/analyticsService';

export const STATUS_CONFIG: Record<OrderStatus, { label: string, icon: any, color: string, bgColor: string }> = {
  'measurements_taken': { label: 'أخذ المقاسات', icon: User, color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
  'cutting': { label: 'قص القماش', icon: Scissors, color: 'text-amber-600', bgColor: 'bg-amber-500/10' },
  'sewing': { label: 'خياطة', icon: Clock, color: 'text-indigo-600', bgColor: 'bg-indigo-500/10' },
  'embroidery': { label: 'تطريز', icon: CheckSquare, color: 'text-purple-600', bgColor: 'bg-purple-500/10' },
  'ironing_packaging': { label: 'كوي وتغليف', icon: Package, color: 'text-pink-600', bgColor: 'bg-pink-500/10' },
  'ready': { label: 'جاهز للاستلام', icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-500/10' },
  'partial_delivered': { label: 'تسليم جزئي', icon: Package, color: 'text-teal-600', bgColor: 'bg-teal-500/10' },
  'delivered': { label: 'تم التسليم', icon: Truck, color: 'text-content-muted', bgColor: 'bg-surface-muted' }
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'كاش', icon: ShoppingBag },
  { id: 'network', label: 'شبكة', icon: CreditCard },
  { id: 'cash_on_delivery', label: 'الدفع عند الاستلام', icon: Truck },
  { id: 'partial', label: 'عربون/جزئي', icon: Clock },
];

export default function Orders({ tenantId }: { tenantId: string }) {
  const { settings: branding } = useBranding();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ id: string, status: OrderStatus } | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [isConfirmDeliveryOpen, setIsConfirmDeliveryOpen] = useState(false);
  const [tenantStrategy, setTenantStrategy] = useState<'centralized' | 'decentralized'>('centralized');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchParams] = useSearchParams();
  const { currentStaff } = useStaff();
  const { hasPermission, checkPermission } = usePermissions(currentStaff);

  const canCreate = hasPermission('orders.create');
  const canEdit = hasPermission('orders.edit');
  const canDelete = hasPermission('orders.delete');
  const canRefund = hasPermission('action.refund');
  const canDiscount = hasPermission('action.discount');

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting, isValid } } = useForm({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      items: [{ 
        garmentType: 'ثوب', 
        quantity: 1, 
        price: 0, 
        fabric: '',
        closureType: 'buttons',
        closureVisibility: 'visible',
        collarType: 'plain',
        cuffType: 'plain',
        pocketType: 'single',
        chestStyle: 'plain',
        collarPadding: 'soft'
      }],
      status: 'measurements_taken',
      paidAmount: 0,
      paymentMethod: 'cash',
      images: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items" as any
  });

  const watchItems = watch("items" as any);
  const watchCustomerId = watch("customerId");
  const selectedCustomer = customers.find(c => c.id === watchCustomerId);
  const totalAmount = watchItems?.reduce((acc: number, item: any) => acc + (Number(item.price) * Number(item.quantity) || 0), 0) || 0;

  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, 'orders'), 
      where('tenantId', '==', tenantId),
      orderBy('orderDate', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Only show orders that have at least one custom item, or legacy orders (no type field)
      const trackingOrders = allOrders.filter(order => 
        order.items.some(item => item.type === 'custom' || !item.type)
      );
      setOrders(trackingOrders);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });

    const fetchData = async () => {
      try {
        const qCust = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
        const custSnap = await getDocs(qCust);
        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));

        const qInv = query(collection(db, 'inventory'), where('tenantId', '==', tenantId), where('category', '==', 'fabric'));
        const invSnap = await getDocs(qInv);
        setInventory(invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));

        const qStaff = query(collection(db, 'staff'), where('tenantId', '==', tenantId));
        const staffSnap = await getDocs(qStaff);
        setStaff(staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));

        const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
        if (tenantSnap.exists()) {
          setTenant({ id: tenantSnap.id, ...tenantSnap.data() } as Tenant);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'data');
      }
    };

    fetchData();
    return () => unsubscribe();
  }, [tenantId]);

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (customerId && customers.length > 0) {
      setValue('customerId', customerId);
      setIsModalOpen(true);
    }
  }, [searchParams, customers, setValue]);

  const VisualPart = ({ label, icon: Icon, value, options, onChange }: any) => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-content-muted uppercase tracking-widest flex items-center gap-2">
        <Icon size={14} className="text-brand" />
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt: any) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all group",
              value === opt.id 
                ? "border-brand bg-brand/5 text-brand shadow-lg shadow-brand/10" 
                : "border-border bg-surface text-content-muted hover:border-brand/20 hover:bg-surface-muted"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
              value === opt.id ? "bg-brand text-white" : "bg-surface-muted text-content-muted"
            )}>
              {opt.icon}
            </div>
            <span className="text-[10px] font-black">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const QuickAddCustomerModal = () => {
    const { register: regCust, handleSubmit: handleCustSubmit, reset: resetCust, watch: watchCust, setValue: setCustValue, formState: { errors: custErrors, isSubmitting: custSubmitting } } = useForm({
      resolver: zodResolver(customerSchema)
    });

    const watchCustMeasurements = watchCust('measurements');

    const onQuickAddSubmit = async (data: any) => {
      try {
        const docRef = await addDoc(collection(db, 'customers'), {
          ...data,
          tenantId,
          createdAt: new Date().toISOString()
        });
        const newCustomer = { id: docRef.id, ...data, tenantId, createdAt: new Date().toISOString() } as Customer;
        setCustomers(prev => [newCustomer, ...prev]);
        setValue('customerId', docRef.id);
        setIsQuickAddOpen(false);
        resetCust();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'customers');
      }
    };

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsQuickAddOpen(false)} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface w-full max-w-6xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] text-right" dir="rtl">
          <div className="p-6 border-b border-border flex justify-between items-center bg-brand/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-brand text-white rounded-2xl">
                <UserPlus size={24} />
              </div>
              <h3 className="text-xl font-black text-content">إضافة عميل جديد</h3>
            </div>
            <button onClick={() => setIsQuickAddOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
              <X size={24} className="text-content-muted" />
            </button>
          </div>
          <form onSubmit={handleCustSubmit(onQuickAddSubmit)} className="p-8 space-y-8 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-content-muted">الاسم الكامل</label>
                <input {...regCust('name')} className="w-full bg-surface-muted border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand text-content" />
                {custErrors.name && <p className="text-[10px] text-red-500 font-bold">{custErrors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-content-muted">رقم الهاتف</label>
                <input {...regCust('phone')} className="w-full bg-surface-muted border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand text-content" />
                {custErrors.phone && <p className="text-[10px] text-red-500 font-bold">{custErrors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                <Ruler size={16} />
                القياسات الأساسية
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { id: 'length', label: 'الطول' },
                  { id: 'shoulder', label: 'الكتف' },
                  { id: 'chest', label: 'الصدر' },
                  { id: 'waist', label: 'الخصر' },
                  { id: 'hips', label: 'الأرداف' },
                  { id: 'sleeve', label: 'الكم' },
                  { id: 'neck', label: 'الرقبة' },
                ].map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label className="text-[10px] font-bold text-content-muted">{field.label}</label>
                    <input 
                      type="number" 
                      step="0.1"
                      {...regCust(`measurements.${field.id}` as any)} 
                      className="w-full bg-surface-muted border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand text-content" 
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                <Zap size={16} />
                التفاصيل البصرية والمقاسات التفاعلية
              </h4>
              <VisualMeasurements 
                values={watchCustMeasurements || {}} 
                onChange={(field, val) => setCustValue(`measurements.${field}` as any, val)} 
              />
              
              <div className="mt-8 pt-8 border-t border-border">
                <h3 className="text-sm font-black text-content flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-brand rounded-full" />
                  مُحدد المقاسات البصري التفاعلي
                </h3>
                <ThobeMeasurementSelector 
                  values={(watchCustMeasurements?.thobeMeasurements as ThobeMeasurements) || {
                    collar: 0,
                    chest: 0,
                    shoulders: 0,
                    sleeves: 0,
                    length: 0,
                    bottomWidth: 0
                  }}
                  onChange={(newMeasurements) => setCustValue('measurements.thobeMeasurements' as any, newMeasurements)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={() => setIsQuickAddOpen(false)} className="px-8 py-4 text-content-muted font-black hover:text-content transition-colors">إلغاء</button>
              <button type="submit" disabled={custSubmitting} className="bg-brand text-white px-12 py-4 rounded-2xl font-black hover:bg-brand/90 shadow-xl shadow-brand/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                {custSubmitting ? 'جاري الحفظ...' : 'تأكيد وإضافة العميل'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  useEffect(() => {
    const fetchStrategy = async () => {
      if (!tenantId) return;
      const docSnap = await getDoc(doc(db, 'tenants', tenantId));
      if (docSnap.exists()) {
        setTenantStrategy(docSnap.data().inventoryStrategy || 'centralized');
      }
    };
    fetchStrategy();
  }, [tenantId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const onSubmit = async (data: any) => {
    if (!tenantId) {
      setToast({ message: 'خطأ: لم يتم العثور على كود المتجر', type: 'error' });
      return;
    }

    if (tenantStrategy === 'decentralized' && !currentStaff?.branchId) {
      setToast({ message: 'خطأ: يجب ربط الموظف بفرع لاستخدام استراتيجية المخزون اللامركزية', type: 'error' });
      return;
    }

    const initialHistory: OrderHistory = {
      status: 'measurements_taken',
      updatedAt: new Date().toISOString(),
      updatedBy: currentStaff?.name || 'المالك',
      updatedByUid: currentStaff?.id || auth.currentUser?.uid,
      notes: 'تم إنشاء الطلب'
    };

    const orderData = {
      ...data,
      tenantId,
      branchId: currentStaff?.branchId || null,
      customerName: selectedCustomer?.name || 'عميل غير معروف',
      totalAmount,
      remainingAmount: totalAmount - Number(data.paidAmount || 0),
      paymentMethod: data.paymentMethod || 'cash',
      createdBy: currentStaff?.id || auth.currentUser?.uid || 'unknown',
      orderDate: new Date().toISOString(),
      createdAt: serverTimestamp(),
      qrCode: `tailor-order-${Date.now()}`,
      history: [initialHistory],
      images: data.images || []
    };

    try {
      // 1. Check Stock Availability
      const { available, missingItems } = await checkStockAvailability(
        data.items,
        currentStaff?.branchId || '',
        tenantId,
        tenantStrategy
      );

      if (!available) {
        if (!confirm(`تحذير: الكميات التالية غير متوفرة في المخزون: ${missingItems.join(', ')}. هل تود المتابعة على أي حال؟`)) {
          setToast({ message: 'تم إلغاء إضافة الطلب بسبب نقص المخزون', type: 'error' });
          return;
        }
      }

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setToast({ message: 'تم إضافة الطلب بنجاح', type: 'success' });
      
      // Track Order Created
      analytics.track(AnalyticsEvent.ORDER_CREATED, {
        order_id: docRef.id,
        customer_id: orderData.customerId,
        total_amount: orderData.totalAmount,
        items_count: orderData.items.length,
        payment_method: orderData.paymentMethod
      });

      // Track Measurements Added (if customer is selected)
      if (selectedCustomer?.measurements) {
        analytics.track(AnalyticsEvent.MEASUREMENTS_ADDED, {
          order_id: docRef.id,
          customer_id: orderData.customerId,
          measurements: selectedCustomer.measurements
        });
      }

      setIsModalOpen(false);
      reset();
    } catch (error: any) {
      console.error('Order submission error:', error);
      let msg = 'حدث خطأ أثناء إضافة الطلب. يرجى التحقق من الصلاحيات والبيانات.';
      
      if (error?.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error?.includes('insufficient permissions')) {
            msg = 'ليس لديك صلاحية لإضافة طلبات. يرجى مراجعة مدير النظام.';
          }
        } catch (e) {}
      }
      
      setToast({ message: msg, type: 'error' });
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    }
  };

  const updateStatus = async (id: string, status: OrderStatus, notes?: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    // Prevent any changes if order is already delivered (locked)
    if (order.status === 'delivered') {
      alert('لا يمكن تعديل حالة الطلب بعد تسليمه.');
      return;
    }

    // Prevent delivery if there's a remaining balance
    if (status === 'delivered') {
      if (order.remainingAmount > 0) {
        alert('لا يمكن تسليم الطلب قبل سداد كامل المبلغ المتبقي.');
        setPendingStatusUpdate({ id, status });
        setIsPaymentModalOpen(true);
        return;
      } else {
        // If balance is 0, show confirmation modal
        setPendingStatusUpdate({ id, status });
        setIsConfirmDeliveryOpen(true);
        return;
      }
    }

    try {
      // Deduct stock if moving to 'cutting'
      if (status === 'cutting' && order.status !== 'cutting') {
        try {
          await deductStock(order, currentStaff!, tenantStrategy);
        } catch (err) {
          console.error('Stock deduction error:', err);
          alert('حدث خطأ أثناء خصم المخزون: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'));
          return;
        }
      }

      const historyEntry: OrderHistory = {
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: currentStaff?.name || 'المالك',
        updatedByUid: currentStaff?.id || auth.currentUser?.uid,
        notes: notes || `تغيير الحالة إلى ${STATUS_CONFIG[status].label}`
      };

      await updateDoc(doc(db, 'orders', id), { 
        status,
        history: arrayUnion(historyEntry)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    }
  };

  const confirmDelivery = async () => {
    if (!pendingStatusUpdate) return;
    
    try {
      const { id, status } = pendingStatusUpdate;
      const order = orders.find(o => o.id === id);
      if (!order) return;

      const historyEntry: OrderHistory = {
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: currentStaff?.name || 'المالك',
        updatedByUid: currentStaff?.id || auth.currentUser?.uid,
        notes: `تم تسليم الطلب وإغلاقه`
      };

      await updateDoc(doc(db, 'orders', id), { 
        status,
        history: arrayUnion(historyEntry)
      });

      // Track Order Delivered
      analytics.track(AnalyticsEvent.ORDER_DELIVERED, {
        order_id: id,
        customer_id: order.customerId,
        total_amount: order.totalAmount
      });

      setIsConfirmDeliveryOpen(false);
      setPendingStatusUpdate(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    }
  };

  const handleDelete = async (id: string) => {
    const allowed = await checkPermission('orders.delete', 'إدارة الطلبات');
    if (!allowed) return;

    if (window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      try {
        await deleteDoc(doc(db, 'orders', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'orders');
      }
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.customerName.toLowerCase().includes(search.toLowerCase()) || 
                         o.id.includes(search);
    const matchesStatus = !statusFilter || o.status === statusFilter;
    
    // Date comparison
    const orderDate = o.orderDate.split('T')[0];
    const matchesDate = (!startDate || orderDate >= startDate) && 
                       (!endDate || orderDate <= endDate);
    
    // Tab filtering
    const matchesTab = activeTab === 'active' ? o.status !== 'delivered' : o.status === 'delivered';
    
    return matchesSearch && matchesStatus && matchesDate && matchesTab;
  });

  const sendToWhatsApp = (order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    const phone = customer?.phone || '';
    const brandingText = `\n\nPowered By ${branding.companyName}${branding.websiteUrl ? `\n${branding.websiteUrl}` : ''}`;
    const message = `مرحباً ${order.customerName}، تم استلام طلبك رقم #${order.id.slice(-6).toUpperCase()}. الإجمالي: ${formatCurrency(order.totalAmount)}. المتبقي: ${formatCurrency(order.remainingAmount)}.${brandingText}`;
    const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const OrderDetailsDrawer = ({ order }: { order: Order }) => {
    const [isPaying, setIsPaying] = useState(false);
    const [payAmount, setPayAmount] = useState(order.remainingAmount);
    const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
    const [isProcessing, setIsProcessing] = useState(false);

    const statusOrder: OrderStatus[] = [
      'measurements_taken',
      'cutting',
      'sewing',
      'ready',
      'delivered'
    ];

    const currentStatusIndex = statusOrder.indexOf(order.status);

    const handleQuickPayment = async () => {
      if (payAmount <= 0) return;
      setIsProcessing(true);
      try {
        const newPaidAmount = order.paidAmount + payAmount;
        const newRemainingAmount = Math.max(0, order.totalAmount - newPaidAmount);
        
        const historyEntry: OrderHistory = {
          status: order.status,
          updatedAt: new Date().toISOString(),
          updatedBy: currentStaff?.name || 'المالك',
          updatedByUid: currentStaff?.id || auth.currentUser?.uid,
          notes: `تسديد مبلغ: ${formatCurrency(payAmount)} عبر ${PAYMENT_METHODS.find(m => m.id === payMethod)?.label}`
        };

        await updateDoc(doc(db, 'orders', order.id), {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          history: arrayUnion(historyEntry)
        });

        // Track Payment Completed
        analytics.track(AnalyticsEvent.PAYMENT_COMPLETED, {
          order_id: order.id,
          amount_paid: payAmount,
          remaining_amount: newRemainingAmount,
          payment_method: payMethod
        });

        setIsPaying(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'orders');
      } finally {
        setIsProcessing(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] flex justify-end overflow-hidden">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => setIsDetailsOpen(false)}
        />
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-surface w-full max-w-md h-full shadow-2xl relative z-10 flex flex-col text-right"
          dir="rtl"
        >
          <div className="p-6 border-b border-border flex justify-between items-center bg-brand/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-brand text-white rounded-2xl">
                <Info size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-content">تفاصيل الطلب</h2>
                <p className="text-xs text-content-muted font-bold">#{order.id.slice(-6).toUpperCase()}</p>
              </div>
            </div>
            <button onClick={() => setIsDetailsOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
              <X size={24} className="text-content-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Progress Tracker */}
            <section className="bg-surface p-6 rounded-3xl border border-border shadow-sm overflow-x-auto">
              <div className="relative flex justify-between items-start min-w-[300px]">
                {/* Progress Line */}
                <div className="absolute top-5 right-0 left-0 h-0.5 bg-surface-muted -z-0" />
                <div 
                  className="absolute top-5 right-0 h-0.5 bg-brand transition-all duration-500 -z-0" 
                  style={{ width: `${(currentStatusIndex / (statusOrder.length - 1)) * 100}%` }}
                />

                {statusOrder.map((status) => {
                  const config = STATUS_CONFIG[status];
                  const Icon = config.icon;
                  const idx = statusOrder.indexOf(status);
                  const isCompleted = idx <= currentStatusIndex;
                  const isActive = idx === currentStatusIndex;

                  return (
                    <div key={status} className="relative flex flex-col items-center gap-2 z-10 w-1/5">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-4 border-surface shadow-sm",
                        isCompleted ? "bg-brand text-white" : "bg-surface-muted text-content-muted",
                        isActive && "ring-4 ring-brand/10 scale-110"
                      )}>
                        <Icon size={18} />
                      </div>
                      <span className={cn(
                        "text-[9px] font-bold text-center leading-tight",
                        isCompleted ? "text-brand" : "text-content-muted"
                      )}>
                        {config.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Payment Status Card */}
            <section className={cn(
              "p-6 rounded-3xl border-2 transition-all",
              order.remainingAmount > 0 ? "bg-red-500/5 border-red-500/10" : "bg-emerald-500/5 border-emerald-500/10"
            )}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-content">حالة الدفع</h3>
                {order.remainingAmount > 0 ? (
                  <span className="bg-red-500 text-white text-[10px] px-2 py-1 rounded-full font-bold">متبقي رصيد</span>
                ) : (
                  <span className="bg-emerald-500 text-white text-[10px] px-2 py-1 rounded-full font-bold">مدفوع بالكامل</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">الإجمالي:</span>
                  <span className="font-bold text-content">{formatCurrency(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">المدفوع:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(order.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t border-border/50">
                  <span className="font-bold text-content">المتبقي:</span>
                  <span className={cn("font-black", order.remainingAmount > 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatCurrency(order.remainingAmount)}
                  </span>
                </div>
              </div>

              {order.remainingAmount > 0 && !isPaying && (
                <button 
                  onClick={() => setIsPaying(true)}
                  className="w-full mt-4 bg-brand text-white py-3 rounded-2xl font-bold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/10"
                >
                  <CreditCard size={18} />
                  تسديد المتبقي
                </button>
              )}

              {isPaying && (
                <div className="mt-4 p-4 bg-surface rounded-2xl border border-red-500/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-content-muted uppercase">المبلغ المراد تسديده</label>
                    <input 
                      type="number" 
                      value={payAmount}
                      onChange={(e) => setPayAmount(Number(e.target.value))}
                      className="w-full bg-surface-muted border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-brand text-content"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setPayMethod(m.id as PaymentMethod)}
                        className={cn(
                          "p-2 rounded-xl border text-[10px] font-bold flex flex-col items-center gap-1 transition-all",
                          payMethod === m.id ? "bg-brand border-brand text-white shadow-md" : "bg-surface border-border text-content-muted hover:bg-surface-muted"
                        )}
                      >
                        <m.icon size={16} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleQuickPayment}
                      disabled={isProcessing || payAmount <= 0}
                      className="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-sm hover:bg-brand/90 disabled:opacity-50"
                    >
                      {isProcessing ? 'جاري...' : 'تأكيد الدفع'}
                    </button>
                    <button 
                      onClick={() => setIsPaying(false)}
                      className="px-4 py-3 text-content-muted font-bold text-sm hover:bg-surface-muted rounded-xl"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Status Timeline */}
            <section className="space-y-4">
              <h3 className="text-xs font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                <History size={14} />
                سجل الحالة
              </h3>
              <div className="space-y-4 relative before:absolute before:right-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {order.history?.slice().reverse().map((h, idx) => {
                  const updater = staff.find(s => s.id === h.updatedByUid);
                  const isOwner = tenant && (tenant.id === h.updatedByUid || tenant.ownerEmail === h.updatedBy);
                  
                  let updaterName = h.updatedBy;
                  let updaterRole = '';

                  if (updater) {
                    updaterName = updater.name;
                    updaterRole = updater.role === 'tailor' ? 'خياط' : 'موظف';
                  } else if (isOwner) {
                    updaterName = tenant.name;
                    updaterRole = 'المالك';
                  }

                  return (
                    <div key={h.updatedAt + h.status + idx} className="relative pr-10">
                      <div className={cn(
                        "absolute right-2 top-1 w-4 h-4 rounded-full border-4 border-surface shadow-sm z-10",
                        idx === 0 ? "bg-brand animate-pulse" : "bg-content-muted/30"
                      )} />
                      <div className="bg-surface-muted p-4 rounded-2xl border border-border">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex flex-col">
                            <span className={cn("text-xs font-bold", STATUS_CONFIG[h.status].color)}>
                              {STATUS_CONFIG[h.status].label}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-5 h-5 rounded-full bg-surface flex items-center justify-center border border-border">
                                <User size={10} className="text-gray-400" />
                              </div>
                              <span className="text-[10px] text-gray-600 font-bold">
                                {updaterName}
                                {updaterRole && <span className="text-gray-400 font-medium mr-1">({updaterRole})</span>}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] text-gray-400 font-medium flex items-center gap-1">
                              <Calendar size={10} />
                              {new Date(h.updatedAt).toLocaleDateString('ar-SA')}
                            </span>
                            <span className="text-[9px] text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                              <Clock size={10} />
                              {new Date(h.updatedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-content-muted bg-surface/50 p-2 rounded-lg border border-border">{h.notes}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Customer Measurements */}
            {customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements && (
              <section className="space-y-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Ruler size={14} />
                  مقاسات العميل (الثوب)
                </h3>
                <div className="bg-brand/5 p-6 rounded-3xl border border-brand/10">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'الرقبة', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.collar },
                      { label: 'الصدر', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.chest },
                      { label: 'الأكتاف', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.shoulders },
                      { label: 'الأكمام', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.sleeves },
                      { label: 'الطول', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.length },
                      { label: 'الوسع', value: customers.find(c => c.id === order.customerId)?.measurements?.thobeMeasurements?.bottomWidth },
                    ].map((m, i) => (
                      <div key={i} className="text-center">
                        <span className="block text-[10px] text-content-muted font-bold mb-1">{m.label}</span>
                        <span className="text-lg font-black text-brand">{m.value || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Items */}
            <section className="space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ShoppingBag size={14} />
                الأصناف
              </h3>
              <div className="space-y-3">
                {order.items.map((item, idx) => (
                  <div key={item.garmentType + item.fabric + idx} className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-gray-800 text-sm">{item.garmentType}</p>
                      <span className="text-[10px] font-black bg-surface px-2 py-1 rounded-lg border border-brand/10">x{item.quantity}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[10px] text-indigo-600 font-medium">
                      <p>القماش: {item.fabric}</p>
                      <p>الإضافات: {item.additions || 'لا يوجد'}</p>
                      <p>التطريز: {item.embroidery || 'لا يوجد'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="p-6 bg-surface-muted border-t border-border grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 bg-surface text-content py-4 rounded-2xl font-bold border border-border hover:bg-surface-muted transition-all text-sm">
              <Printer size={18} />
              <span>طباعة</span>
            </button>
            <button 
              onClick={() => sendToWhatsApp(order)}
              className="flex items-center justify-center gap-2 bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 text-sm"
            >
              <MessageSquare size={18} />
              <span>واتساب</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const ConfirmDeliveryModal = () => (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsConfirmDeliveryOpen(false)} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 p-8 text-center" dir="rtl">
        <div className="w-20 h-20 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-xl font-black text-content mb-2">تأكيد تسليم الطلب</h3>
        <p className="text-content-muted text-sm mb-8 font-medium">هل تم تسليم الطلب للعميل بنجاح؟ سيتم إغلاق الطلب نهائياً ولا يمكن تعديله لاحقاً.</p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={confirmDelivery}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
          >
            تأكيد التسليم
          </button>
          <button 
            onClick={() => setIsConfirmDeliveryOpen(false)}
            className="w-full py-4 text-content-muted font-bold hover:bg-surface-muted rounded-2xl transition-all"
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    </div>
  );

  const PaymentModal = ({ order, onComplete }: { order: Order, onComplete: () => void }) => {
    const [amount, setAmount] = useState(order.remainingAmount);
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [isProcessing, setIsProcessing] = useState(false);

    const handlePayment = async () => {
      if (amount <= 0) return;
      
      setIsProcessing(true);
      try {
        const newPaidAmount = order.paidAmount + amount;
        const newRemainingAmount = Math.max(0, order.totalAmount - newPaidAmount);
        
        const historyEntry: OrderHistory = {
          status: order.status,
          updatedAt: new Date().toISOString(),
          updatedBy: currentStaff?.name || 'المالك',
          updatedByUid: currentStaff?.id || auth.currentUser?.uid,
          notes: `تم سداد مبلغ ${formatCurrency(amount)} بواسطة ${PAYMENT_METHODS.find(m => m.id === method)?.label}. المتبقي: ${formatCurrency(newRemainingAmount)}`
        };

        await updateDoc(doc(db, 'orders', order.id), {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          paymentMethod: method,
          history: arrayUnion(historyEntry)
        });

        if (newRemainingAmount === 0 && pendingStatusUpdate) {
          const finalHistoryEntry: OrderHistory = {
            status: pendingStatusUpdate.status,
            updatedAt: new Date().toISOString(),
            updatedBy: currentStaff?.name || 'المالك',
            updatedByUid: currentStaff?.id || auth.currentUser?.uid,
            notes: 'تم سداد المتبقي وتسليم الطلب'
          };

          await updateDoc(doc(db, 'orders', order.id), { 
            status: pendingStatusUpdate.status,
            history: arrayUnion(finalHistoryEntry)
          });

          // Track Order Delivered
          analytics.track(AnalyticsEvent.ORDER_DELIVERED, {
            order_id: order.id,
            customer_id: order.customerId,
            total_amount: order.totalAmount
          });
        }

        setIsPaymentModalOpen(false);
        setPendingStatusUpdate(null);
        onComplete();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'orders');
      } finally {
        setIsProcessing(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden text-right" dir="rtl">
          <div className="p-6 border-b border-border flex justify-between items-center bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-600 text-white rounded-2xl">
                <CreditCard size={24} />
              </div>
              <h3 className="text-xl font-black text-content">استكمال الدفع</h3>
            </div>
            <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
              <X size={24} className="text-content-muted" />
            </button>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-surface-muted p-6 rounded-3xl border border-border text-center">
              <p className="text-xs font-bold text-content-muted uppercase tracking-widest mb-1">المبلغ المتبقي</p>
              <p className="text-3xl font-black text-red-600">{formatCurrency(order.remainingAmount)}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-content-muted uppercase tracking-widest">المبلغ المدفوع الآن</label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                max={order.remainingAmount}
                className="w-full bg-surface-muted border-2 border-transparent focus:border-emerald-500 rounded-2xl p-4 font-black text-emerald-600 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-content-muted uppercase tracking-widest">طريقة الدفع</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.filter(m => m.id !== 'partial').map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id as PaymentMethod)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-bold",
                      method === m.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border bg-surface text-content-muted"
                    )}
                  >
                    <m.icon size={16} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={handlePayment}
              disabled={isProcessing || amount <= 0}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all disabled:opacity-50"
            >
              {isProcessing ? 'جاري المعالجة...' : 'تأكيد الدفع والاستلام'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const InvoiceModal = ({ order }: { order: Order }) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={() => setIsInvoiceOpen(false)}
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-surface w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="p-8 space-y-6 text-right" dir="rtl">
          <div className="flex justify-between items-start">
            <div className="bg-brand text-white p-4 rounded-3xl">
              <ShoppingBag size={32} />
            </div>
            <button onClick={() => setIsInvoiceOpen(false)} className="p-2 hover:bg-surface-muted rounded-full transition-colors">
              <X size={24} className="text-content-muted" />
            </button>
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black text-content">فاتورة طلب</h2>
            <p className="text-content-muted font-medium">رقم الطلب: #{order.id.slice(-6).toUpperCase()}</p>
          </div>

          <div className="bg-surface-muted p-6 rounded-[2rem] space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-surface rounded-xl shadow-sm">
                  <User size={18} className="text-brand" />
                </div>
                <div>
                  <p className="text-[10px] text-content-muted font-bold uppercase tracking-wider">العميل</p>
                  <p className="font-bold text-content">{order.customerName}</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-content-muted font-bold uppercase tracking-wider">التاريخ</p>
                <p className="font-bold text-content">{new Date(order.orderDate).toLocaleDateString('ar-SA')}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-border pt-4 space-y-3">
              {order.items?.map((item: any, idx: number) => (
                <div key={item.garmentType + item.fabric + idx} className="flex justify-between text-sm">
                  <span className="text-content-muted">{item.garmentType} ({item.fabric})</span>
                  <span className="font-bold text-content">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-content-muted font-medium">الإجمالي</span>
                <span className="text-xl font-black text-brand">{formatCurrency(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-content-muted">المدفوع ({PAYMENT_METHODS.find(m => m.id === order.paymentMethod)?.label || order.paymentMethod})</span>
                <span className="font-bold text-emerald-600">{formatCurrency(order.paidAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-border">
                <span className="text-content-muted">المتبقي</span>
                <span className="font-black text-red-600">{formatCurrency(order.remainingAmount)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-surface border-2 border-border rounded-3xl shadow-inner">
              <QRCodeSVG value={order.qrCode || order.id} size={120} />
            </div>
            <p className="text-[10px] text-content-muted font-bold text-center px-8 uppercase tracking-widest">
              امسح الكود لمتابعة حالة الطلب عبر تطبيق العملاء
            </p>

            <Branding className="opacity-40 py-0" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10">
              <Printer size={20} />
              <span>طباعة</span>
            </button>
            <button 
              onClick={() => sendToWhatsApp(order)}
              className="flex items-center justify-center gap-2 bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
            >
              <MessageSquare size={20} />
              <span>واتساب</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[120] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border min-w-[300px]",
              toast.type === 'success' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-black text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <Header 
        tenantId={tenantId} 
        title="الطلبات" 
        subtitle="إدارة طلبات الخياطة والمواعيد"
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              const exportData = filteredOrders.map(o => ({
                'رقم الطلب': o.id.slice(-6).toUpperCase(),
                'العميل': o.customerName,
                'التاريخ': new Date(o.orderDate).toLocaleDateString('ar-SA'),
                'الإجمالي': o.totalAmount,
                'المدفوع': o.paidAmount,
                'المتبقي': o.remainingAmount,
                'الحالة': STATUS_CONFIG[o.status].label,
                'طريقة الدفع': PAYMENT_METHODS.find(m => m.id === o.paymentMethod)?.label || o.paymentMethod
              }));
              const worksheet = XLSX.utils.json_to_sheet(exportData);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
              XLSX.writeFile(workbook, `الطلبات_${new Date().toLocaleDateString('ar-SA')}.xlsx`);
            }}
            className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
          >
            <FileSpreadsheet size={20} />
            <span>تصدير Excel</span>
          </button>
          <div className="flex bg-surface p-1 rounded-2xl border border-border shadow-sm">
            <button
              onClick={() => setActiveTab('active')}
              className={cn(
                "px-6 py-2 rounded-xl font-bold text-sm transition-all",
                activeTab === 'active' ? "bg-brand text-white shadow-lg shadow-brand/10" : "text-content-muted hover:bg-surface-muted"
              )}
            >
              الطلبات النشطة
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={cn(
                "px-6 py-2 rounded-xl font-bold text-sm transition-all",
                activeTab === 'completed' ? "bg-brand text-white shadow-lg shadow-brand/10" : "text-content-muted hover:bg-surface-muted"
              )}
            >
              الطلبات المكتملة
            </button>
          </div>
          <button 
            onClick={() => window.location.href = '/pos'}
            className="bg-brand text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/10"
          >
            <Plus size={20} />
            <span>إنشاء طلب جديد</span>
          </button>
        </div>
      </Header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-surface p-4 rounded-3xl border border-border shadow-sm flex items-center gap-3">
          <Search size={20} className="text-content-muted" />
          <input 
            type="text" 
            placeholder="ابحث برقم الطلب أو اسم العميل..." 
            className="flex-1 bg-transparent border-none focus:ring-0 text-content"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-surface p-4 rounded-3xl border border-border shadow-sm">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-content-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
              className="bg-surface-muted border-none rounded-xl px-3 py-2 text-xs font-bold text-content focus:ring-2 focus:ring-brand"
            >
              <option value="">كل الحالات</option>
              {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_CONFIG[status].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-content-muted" />
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-surface-muted border-none rounded-xl px-3 py-2 text-[10px] font-bold text-content focus:ring-2 focus:ring-brand"
              />
              <span className="text-content-muted text-xs">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-surface-muted border-none rounded-xl px-3 py-2 text-[10px] font-bold text-content focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {(statusFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setStartDate('');
                setEndDate('');
              }}
              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="مسح الفلاتر"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredOrders.map((order) => (
          <motion.div
            layout
            key={order.id}
            className="bg-surface p-6 rounded-3xl border border-border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-2xl",
                STATUS_CONFIG[order.status].bgColor,
                STATUS_CONFIG[order.status].color
              )}>
                {React.createElement(STATUS_CONFIG[order.status].icon, { size: 24 })}
              </div>
              <div className="cursor-pointer" onClick={() => { setSelectedOrder(order); setIsDetailsOpen(true); }}>
                <h3 className="text-lg font-bold text-content flex items-center gap-2">
                  {order.customerName}
                  <span className="text-[10px] bg-surface-muted text-content-muted px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                    #{order.id.slice(-6).toUpperCase()}
                  </span>
                  {order.isTest && (
                    <span className="text-[10px] bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1">
                      <Zap size={10} />
                      بيانات تجريبية
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-content-muted">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(order.orderDate).toLocaleDateString('ar-SA')}
                  </span>
                  <span className="font-bold text-brand">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={() => {
                  setSelectedOrder(order);
                  setIsInvoiceOpen(true);
                }}
                className="p-2 text-brand hover:bg-brand/10 rounded-xl transition-all flex items-center gap-2 font-bold text-sm"
              >
                <QrCode size={20} />
                <span>الفاتورة</span>
              </button>

              <div className="relative group">
                <button 
                  disabled={order.status === 'delivered'}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                    STATUS_CONFIG[order.status].bgColor,
                    STATUS_CONFIG[order.status].color,
                    order.status === 'delivered' ? "cursor-not-allowed opacity-80" : "hover:shadow-md"
                  )}
                >
                  <span>{STATUS_CONFIG[order.status].label}</span>
                  {order.status !== 'delivered' && <ChevronDown size={16} />}
                </button>
                
                {order.status !== 'delivered' && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-surface rounded-2xl shadow-xl border border-border py-2 z-20 hidden group-hover:block">
                    {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => updateStatus(order.id, status)}
                        className={cn(
                          "w-full text-right px-4 py-2 text-xs font-bold hover:bg-surface-muted transition-colors",
                          order.status === status ? STATUS_CONFIG[status].color : "text-content-muted"
                        )}
                      >
                        {STATUS_CONFIG[status].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={() => { setSelectedOrder(order); setIsDetailsOpen(true); }}
                className="p-2 text-content-muted hover:text-brand hover:bg-brand/10 rounded-xl transition-all"
              >
                <Info size={20} />
              </button>

              <button 
                onClick={() => handleDelete(order.id)}
                disabled={order.status === 'delivered'}
                className={cn(
                  "p-2 transition-all rounded-xl",
                  order.status === 'delivered' ? "text-content-muted/20 cursor-not-allowed" : "text-content-muted hover:text-red-600 hover:bg-red-500/10"
                )}
              >
                <Trash2 size={20} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modals */}
      {isInvoiceOpen && selectedOrder && <InvoiceModal order={selectedOrder} />}
      <AnimatePresence>
        {isDetailsOpen && selectedOrder && <OrderDetailsDrawer order={selectedOrder} />}
      </AnimatePresence>
      {isQuickAddOpen && <QuickAddCustomerModal />}
      {isConfirmDeliveryOpen && <ConfirmDeliveryModal />}
      {isPaymentModalOpen && selectedOrder && (
        <PaymentModal 
          order={selectedOrder} 
          onComplete={() => {
            // Refresh orders if needed or just let onSnapshot handle it
          }} 
        />
      )}

      {/* Create Order Modal */}
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
              className="bg-surface w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden max-h-[90vh] flex flex-col text-right"
              dir="rtl"
            >
              <div className="p-6 border-b border-border flex justify-between items-center bg-brand/5">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand text-white rounded-2xl">
                    <Plus size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-content">إنشاء طلب جديد</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
                  <X size={24} className="text-content-muted" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Customer Selection & Info */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-black text-content-muted uppercase tracking-widest">العميل</label>
                        <button 
                          type="button" 
                          onClick={() => setIsQuickAddOpen(true)}
                          className="text-brand text-xs font-bold flex items-center gap-1 hover:underline"
                        >
                          <UserPlus size={14} />
                          إضافة عميل جديد
                        </button>
                      </div>
                      <select 
                        {...register('customerId')} 
                        className={cn(
                          "w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 font-bold transition-all outline-none text-content",
                          errors.customerId && "border-red-500"
                        )}
                      >
                        <option value="">اختر عميل...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {errors.customerId && <p className="text-xs text-red-500 font-bold mt-1">{errors.customerId.message}</p>}
                    </div>

                    {selectedCustomer && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-brand/5 p-6 rounded-3xl border border-brand/10 space-y-4"
                      >
                        <div className="flex items-center gap-2 text-brand mb-2">
                          <Ruler size={18} />
                          <h4 className="font-black text-sm uppercase tracking-wider">مقاسات العميل (آلي)</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'الطول', value: selectedCustomer.measurements?.length },
                            { label: 'الكتف', value: selectedCustomer.measurements?.shoulder },
                            { label: 'الصدر', value: selectedCustomer.measurements?.chest },
                            { label: 'الخصر', value: selectedCustomer.measurements?.waist },
                            { label: 'الأرداف', value: selectedCustomer.measurements?.hips },
                            { label: 'الكم', value: selectedCustomer.measurements?.sleeve },
                            { label: 'الرقبة', value: selectedCustomer.measurements?.neck },
                          ].map((m) => (
                            <div key={m.label} className="bg-surface p-2 rounded-xl border border-brand/10 text-center">
                              <p className="text-[10px] text-content-muted font-bold">{m.label}</p>
                              <p className="text-sm font-black text-brand">{m.value || '-'}</p>
                            </div>
                          ))}
                        </div>
                        
                        {/* Visual Details Display */}
                        <div className="pt-4 border-t border-brand/10 grid grid-cols-2 gap-2">
                          {[
                            { label: 'الياقة', value: selectedCustomer.measurements?.collarType },
                            { label: 'الكبك', value: selectedCustomer.measurements?.cuffType },
                            { label: 'الجيب', value: selectedCustomer.measurements?.pocketType },
                            { label: 'الصدر', value: selectedCustomer.measurements?.chestStyle },
                          ].filter(v => v.value).map((v) => (
                            <div key={v.label} className="flex items-center gap-2 bg-surface/50 p-2 rounded-lg border border-brand/5">
                              <Zap size={12} className="text-brand/40" />
                              <span className="text-[10px] font-bold text-content-muted">{v.label}: {v.value}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Delivery Info */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-black text-content-muted uppercase tracking-widest">تاريخ التسليم المتوقع</label>
                      <div className="relative">
                        <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
                        <input 
                          type="date" 
                          {...register('deliveryDate')} 
                          className={cn(
                            "w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 pr-12 font-bold transition-all outline-none text-content",
                            errors.deliveryDate && "border-red-500"
                          )} 
                        />
                      </div>
                      {errors.deliveryDate && <p className="text-xs text-red-500 font-bold mt-1">{errors.deliveryDate.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-content-muted uppercase tracking-widest">ملاحظات عامة</label>
                      <textarea 
                        {...register('notes')} 
                        placeholder="أي تعليمات إضافية..."
                        className="w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 font-bold transition-all outline-none h-32 resize-none text-content" 
                      />
                    </div>
                  </div>
                </div>

                {/* Items Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                      <ShoppingBag size={16} />
                      الأصناف المطلوبة
                    </h4>
                    <button 
                      type="button" 
                      onClick={() => append({ garmentType: 'ثوب', quantity: 1, price: 0, fabric: '' })}
                      className="bg-brand/5 text-brand px-4 py-2 rounded-xl text-xs font-black hover:bg-brand/10 transition-all flex items-center gap-2"
                    >
                      <Plus size={14} /> إضافة صنف
                    </button>
                  </div>
                  
                    <div className="space-y-4">
                      {fields.map((field, index) => (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={field.id} 
                          className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface-muted p-6 rounded-[2rem] relative group border border-transparent hover:border-brand/10 transition-all"
                        >
                          <div className="space-y-1">
                            <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">نوع القطعة</label>
                            <input 
                              {...register(`items.${index}.garmentType` as any)} 
                              className={cn(
                                "w-full bg-surface border-none rounded-xl p-3 text-sm font-bold shadow-sm text-content",
                                (errors.items as any)?.[index]?.garmentType && "ring-2 ring-red-500"
                              )} 
                              placeholder="مثلاً: ثوب، قميص..."
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">القماش</label>
                            <select 
                              {...register(`items.${index}.fabric` as any)} 
                              onChange={(e) => {
                                const selectedFabric = inventory.find(i => i.name === e.target.value);
                                if (selectedFabric) {
                                  setValue(`items.${index}.fabricId` as any, selectedFabric.id);
                                  setValue(`items.${index}.selectedUnit` as any, selectedFabric.unit);
                                  // Trigger calculation
                                  const qty = watch(`items.${index}.quantity` as any) || 0;
                                  setValue(`items.${index}.consumedMeters` as any, qty * (selectedFabric.conversionRate || 1));
                                }
                                register(`items.${index}.fabric` as any).onChange(e);
                              }}
                              className={cn(
                                "w-full bg-surface border-none rounded-xl p-3 text-sm font-bold shadow-sm text-content",
                                (errors.items as any)?.[index]?.fabric && "ring-2 ring-red-500"
                              )}
                            >
                              <option value="">اختر قماش...</option>
                              {inventory.map(item => (
                                <option key={item.id} value={item.name}>{item.name} ({item.quantity} {item.unit})</option>
                              ))}
                              <option value="custom">قماش خارجي</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">الكمية والوحدة</label>
                            <div className="flex gap-1">
                              <input 
                                type="number" 
                                step="0.01"
                                {...register(`items.${index}.quantity` as any)} 
                                onChange={(e) => {
                                  const qty = Number(e.target.value);
                                  const fabricName = watch(`items.${index}.fabric` as any);
                                  const selectedFabric = inventory.find(i => i.name === fabricName);
                                  if (selectedFabric) {
                                    setValue(`items.${index}.consumedMeters` as any, qty * (selectedFabric.conversionRate || 1));
                                  }
                                  register(`items.${index}.quantity` as any).onChange(e);
                                }}
                                className={cn(
                                  "w-2/3 bg-surface border-none rounded-xl p-3 text-sm font-bold shadow-sm text-content",
                                  (errors.items as any)?.[index]?.quantity && "ring-2 ring-red-500"
                                )} 
                              />
                              <select
                                {...register(`items.${index}.selectedUnit` as any)}
                                className="w-1/3 bg-surface border-none rounded-xl p-3 text-[10px] font-bold shadow-sm text-content"
                              >
                                <option value="meter">متر</option>
                                <option value="yard">ياردة</option>
                                <option value="roll">رول</option>
                                <option value="bolt">طاقة</option>
                              </select>
                            </div>
                            {watch(`items.${index}.consumedMeters` as any) > 0 && (
                              <p className="text-[10px] text-brand font-bold mt-1">
                                يعادل: {watch(`items.${index}.consumedMeters` as any).toFixed(2)} متر مستهلك
                              </p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">السعر</label>
                            <input 
                              type="number" 
                              {...register(`items.${index}.price` as any)} 
                              className={cn(
                                "w-full bg-surface border-none rounded-xl p-3 text-sm font-bold shadow-sm text-content",
                                (errors.items as any)?.[index]?.price && "ring-2 ring-red-500"
                              )} 
                            />
                          </div>

                          {/* Visual Customization UI */}
                          <div className="md:col-span-4 mt-4 pt-4 border-t border-border space-y-6">
                            <VisualMeasurements 
                              values={watch(`items.${index}` as any)} 
                              onChange={(field, val) => setValue(`items.${index}.${field}` as any, val)} 
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">نوع الحشو (الياقة)</label>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setValue(`items.${index}.collarPadding` as any, 'hard')}
                                    className={cn(
                                      "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                                      watch(`items.${index}.collarPadding` as any) === 'hard' ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-content-muted"
                                    )}
                                  >
                                    <Shield size={18} />
                                    <span className="text-[10px] font-bold">قاسي</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setValue(`items.${index}.collarPadding` as any, 'soft')}
                                    className={cn(
                                      "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                                      watch(`items.${index}.collarPadding` as any) === 'soft' ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-content-muted"
                                    )}
                                  >
                                    <Clock size={18} />
                                    <span className="text-[10px] font-bold">لين</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">إضافات أخرى</label>
                                <input 
                                  {...register(`items.${index}.additions` as any)}
                                  placeholder="مثلاً: جيب إضافي..."
                                  className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold shadow-sm text-content"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] text-content-muted font-bold uppercase tracking-wider">التطريز</label>
                                <input 
                                  {...register(`items.${index}.embroidery` as any)}
                                  placeholder="نوع التطريز..."
                                  className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold shadow-sm text-content"
                                />
                              </div>
                            </div>
                          </div>

                          {index > 0 && (
                            <button 
                              type="button" 
                              onClick={() => remove(index)}
                              className="absolute -right-2 -top-2 bg-red-500 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </div>
                </div>

                {/* Financials & Images */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-brand text-white p-8 rounded-[2.5rem] shadow-2xl shadow-brand/10 space-y-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 scale-150">
                        <ShoppingBag size={120} />
                      </div>
                      <div className="relative z-10">
                        <div className="flex justify-between items-center">
                          <span className="text-brand-content/80 font-bold text-sm uppercase tracking-widest">الإجمالي الكلي</span>
                          <span className="text-3xl font-black text-white">{formatCurrency(totalAmount)}</span>
                        </div>
                        
                        <div className="space-y-3 mt-6">
                          <label className="text-xs font-bold text-brand-content/60 uppercase tracking-widest">طريقة الدفع</label>
                          <div className="grid grid-cols-2 gap-2">
                            {PAYMENT_METHODS.map((method) => (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => setValue('paymentMethod' as any, method.id)}
                                className={cn(
                                  "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-bold",
                                  watch('paymentMethod' as any) === method.id ? "border-surface bg-surface text-brand shadow-lg" : "border-surface/20 bg-surface/10 text-surface"
                                )}
                              >
                                <method.icon size={16} />
                                {method.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3 pt-6 border-t border-white/10 mt-6">
                          <label className="text-xs font-bold text-brand-content/60 uppercase tracking-widest">المبلغ المدفوع</label>
                          <div className="relative">
                            <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                            <input 
                              type="number" 
                              {...register('paidAmount')} 
                              className="w-full bg-surface/10 border-2 border-surface/10 rounded-2xl p-4 pr-12 font-black text-surface placeholder:text-surface/30 focus:ring-2 focus:ring-surface outline-none" 
                            />
                          </div>
                          <div className="flex justify-between text-xs font-bold pt-2">
                            <span className="text-brand-content/80">المتبقي:</span>
                            <span className="text-white bg-red-500 px-2 py-0.5 rounded-lg">{formatCurrency(Number(totalAmount) - Number(watch('paidAmount') || 0))}</span>
                          </div>
                        </div>
                      </div>

                    {/* isTest Flag */}
                    <div className="flex items-center gap-3 p-4 bg-surface/5 rounded-2xl border border-surface/10 mt-6">
                      <input
                        type="checkbox"
                        id="isTest"
                        {...register('isTest')}
                        className="w-5 h-5 text-indigo-500 border-white/20 rounded focus:ring-indigo-500 bg-transparent"
                      />
                      <label htmlFor="isTest" className="text-sm font-bold text-gray-300 flex items-center gap-2">
                        <Zap size={16} className="text-amber-400" />
                        بيانات تجريبية (Test Data)
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon size={16} />
                      صور توضيحية / تصاميم
                    </h4>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          id="imageUrlInput"
                          placeholder="رابط الصورة (URL)..."
                          className="flex-1 bg-surface-muted border-none rounded-xl p-3 text-sm font-bold text-content"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('imageUrlInput') as HTMLInputElement;
                            if (input.value) {
                              const currentImages = watch('images') || [];
                              setValue('images', [...currentImages, input.value]);
                              input.value = '';
                            }
                          }}
                          className="bg-brand text-white px-4 rounded-xl font-bold text-xs"
                        >
                          إضافة
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {watch('images')?.map((img, idx) => (
                          <div key={img + idx} className="relative group aspect-square">
                            <img src={img} className="w-full h-full object-cover rounded-xl border border-border" referrerPolicy="no-referrer" />
                            <button 
                              type="button"
                              onClick={() => {
                                const currentImages = watch('images') || [];
                                setValue('images', currentImages.filter((_, i) => i !== idx));
                              }}
                              className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* isTest Flag */}
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 mb-8">
                  <input
                    type="checkbox"
                    id="isTestOrder"
                    {...register('isTest')}
                    className="w-5 h-5 text-brand border-border rounded focus:ring-brand"
                  />
                  <label htmlFor="isTestOrder" className="text-sm font-bold text-amber-600 flex items-center gap-2">
                    <Zap size={16} />
                    بيانات تجريبية (Test Data)
                  </label>
                </div>

                <div className="flex justify-end gap-4 pt-8 border-t border-border">
                  {Object.keys(errors).length > 0 && (
                    <p className="text-xs text-red-500 font-bold flex items-center gap-1">
                      <AlertCircle size={14} />
                      يرجى إكمال جميع الحقول المطلوبة بشكل صحيح
                    </p>
                  )}
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)} 
                    className="px-8 py-4 text-content-muted font-black hover:text-content transition-colors"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="bg-brand text-white px-12 py-4 rounded-2xl font-black hover:bg-brand/90 shadow-xl shadow-brand/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'جاري الحفظ...' : 'تأكيد وإنشاء الطلب'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
