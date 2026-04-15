import React, { useState, useEffect } from 'react';
import { Store, MapPin, Phone, Globe, Bell, Shield, CreditCard, MessageSquare, CheckCircle2, AlertCircle, ChevronRight, ExternalLink, Zap, Upload, X as CloseIcon, Database, Trash2, ShieldCheck, Palette } from 'lucide-react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '../lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { settingsSchema } from '../lib/validations';
import Header from './Header';
import { useStaff } from '../contexts/StaffContext';
import { usePermissions } from '../hooks/usePermissions';
import ThemeSwitcher from './ThemeSwitcher';

import WarehouseManagement from './Inventory/WarehouseManagement';
import Staff from './Staff';
import InvoiceLayoutSettings from './InvoiceLayoutSettings';

import Branding from './Branding';

interface SettingsProps {
  tenantId: string;
}

type TabType = 'profile' | 'appearance' | 'invoice' | 'branches' | 'staff' | 'whatsapp' | 'billing' | 'notifications' | 'data';

export default function Settings({ tenantId }: SettingsProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isDeletingTestData, setIsDeletingTestData] = useState(false);
  const { currentStaff } = useStaff();
  const { hasPermission } = usePermissions(currentStaff);

  const canEdit = hasPermission('settings.edit');
  const canViewWhatsApp = hasPermission('settings.whatsapp');
  const canViewBilling = hasPermission('settings.billing');
  const canViewNotifications = hasPermission('settings.notifications');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      inventoryStrategy: 'centralized' as const,
      logoUrl: ''
    }
  });

  const currentStrategy = watch('inventoryStrategy');

  useEffect(() => {
    const fetchTenant = async () => {
      if (!tenantId || tenantId === 'super_admin') {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          reset({
            name: data.name || '',
            phone: data.phone || '',
            address: data.address || '',
            inventoryStrategy: data.inventoryStrategy || 'centralized',
            logoUrl: data.logoUrl || ''
          });
          setLogoPreview(data.logoUrl || null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'tenants');
      } finally {
        setLoading(false);
      }
    };
    fetchTenant();
  }, [tenantId, reset]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for base64
        alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 1 ميجابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setValue('logoUrl', base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSave = async (data: any) => {
    if (!tenantId || tenantId === 'super_admin') return;
    try {
      const docRef = doc(db, 'tenants', tenantId);
      await updateDoc(docRef, data);
      alert('تم حفظ الإعدادات بنجاح');
      window.location.reload(); // Refresh to update logo in layout
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tenants');
    }
  };

  const handleDeleteTestData = async () => {
    if (!tenantId) return;
    if (!confirm('هل أنت متأكد من حذف جميع البيانات التجريبية؟ لا يمكن التراجع عن هذه الخطوة.')) return;

    setIsDeletingTestData(true);
    try {
      const collections = ['orders', 'customers', 'inventory', 'staff', 'notifications'];
      let totalDeleted = 0;

      for (const collName of collections) {
        const q = query(collection(db, collName), where('tenantId', '==', tenantId), where('isTest', '==', true));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach(doc => {
            batch.delete(doc.ref);
            totalDeleted++;
          });
          await batch.commit();
        }
      }

      alert(`تم حذف ${totalDeleted} من السجلات التجريبية بنجاح`);
      window.location.reload();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'test_data');
      alert('حدث خطأ أثناء حذف البيانات التجريبية');
    } finally {
      setIsDeletingTestData(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const TABS: { id: TabType; label: string; icon: any; visible: boolean }[] = [
    { id: 'profile', label: 'الملف الشخصي', icon: Store, visible: true },
    { id: 'appearance', label: 'المظهر والسمات', icon: Palette, visible: true },
    { id: 'invoice', label: 'تخطيط الفاتورة', icon: FileText, visible: true },
    { id: 'branches', label: 'الفروع والمواقع', icon: Store, visible: hasPermission('branches.view') },
    { id: 'staff', label: 'الموظفين والصلاحيات', icon: Shield, visible: currentStaff?.role === 'owner' || currentStaff?.role === 'admin' || currentStaff?.role === 'super_admin' },
    { id: 'whatsapp', label: 'تكامل واتساب', icon: MessageSquare, visible: canViewWhatsApp },
    { id: 'billing', label: 'الاشتراك والمدفوعات', icon: CreditCard, visible: canViewBilling },
    { id: 'notifications', label: 'التنبيهات', icon: Bell, visible: canViewNotifications },
    { id: 'data', label: 'إدارة البيانات', icon: Database, visible: currentStaff?.role === 'owner' || currentStaff?.role === 'super_admin' },
  ];

  const visibleTabs = TABS.filter(tab => tab.visible);

  return (
    <div className="max-w-6xl space-y-8 text-right" dir="rtl">
      <Header 
        tenantId={tenantId} 
        title="الإعدادات" 
        subtitle="تخصيص تجربة متجرك وإدارة اشتراكك"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 space-y-2">
          {visibleTabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-[1.5rem] text-sm font-black transition-all group",
                activeTab === tab.id 
                  ? "bg-brand text-white shadow-xl shadow-brand/10" 
                  : "text-content-muted hover:bg-surface-muted hover:text-brand"
              )}
            >
              <tab.icon size={20} className={cn("transition-transform group-hover:scale-110", activeTab === tab.id ? "text-white" : "text-content-muted")} />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div layoutId="activeTab" className="mr-auto">
                  <ChevronRight size={16} className="rotate-180" />
                </motion.div>
              )}
            </button>
          ))}
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'profile' && (
                <form onSubmit={handleSubmit(onSave)} className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm space-y-8">
                  <div className="flex items-center gap-8 border-b border-border pb-8">
                    <div className="relative group">
                      <div className="w-32 h-32 bg-surface-muted rounded-[2rem] border-2 border-dashed border-border flex items-center justify-center overflow-hidden transition-all group-hover:border-brand/30">
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Store size={40} className="text-content-muted/30" />
                        )}
                      </div>
                      <label className="absolute -bottom-2 -right-2 p-3 bg-brand text-white rounded-2xl shadow-lg cursor-pointer hover:bg-brand/90 transition-all hover:scale-110">
                        <Upload size={20} />
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                      </label>
                      {logoPreview && (
                        <button 
                          type="button"
                          onClick={() => { setLogoPreview(null); setValue('logoUrl', ''); }}
                          className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-xl shadow-lg hover:bg-red-600 transition-all"
                        >
                          <CloseIcon size={16} />
                        </button>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-content">شعار المتجر</h3>
                      <p className="text-xs text-content-muted font-bold uppercase tracking-widest mt-1">سيظهر هذا الشعار في ترويسة النظام والفواتير</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-content-muted uppercase tracking-widest">اسم المتجر</label>
                      <div className="relative">
                        <Store className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
                        <input 
                          type="text" 
                          {...register('name')}
                          className={cn(
                            "w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 pr-12 font-bold transition-all outline-none text-content",
                            errors.name && "border-red-500"
                          )} 
                        />
                      </div>
                      {errors.name && <p className="text-xs text-red-500 font-bold mt-1">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-content-muted uppercase tracking-widest">رقم الهاتف</label>
                      <div className="relative">
                        <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
                        <input 
                          type="text" 
                          {...register('phone')}
                          className={cn(
                            "w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 pr-12 font-bold transition-all outline-none text-content",
                            errors.phone && "border-red-500"
                          )} 
                        />
                      </div>
                      {errors.phone && <p className="text-xs text-red-500 font-bold mt-1">{errors.phone.message}</p>}
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-black text-content-muted uppercase tracking-widest">العنوان بالتفصيل</label>
                      <div className="relative">
                        <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
                        <input 
                          type="text" 
                          {...register('address')}
                          className={cn(
                            "w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-4 pr-12 font-bold transition-all outline-none text-content",
                            errors.address && "border-red-500"
                          )} 
                        />
                      </div>
                      {errors.address && <p className="text-xs text-red-500 font-bold mt-1">{errors.address.message}</p>}
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      <label className="text-xs font-black text-content-muted uppercase tracking-widest">استراتيجية المخزون</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          currentStrategy === 'centralized' ? "border-brand bg-brand/5" : "border-border hover:border-brand/20"
                        )}>
                          <input type="radio" value="centralized" {...register('inventoryStrategy')} className="sr-only" />
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                            currentStrategy === 'centralized' ? "border-brand" : "border-border"
                          )}>
                            {currentStrategy === 'centralized' && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                          </div>
                          <div>
                            <p className="font-black text-content text-sm">مخزون مركزي (Centralized)</p>
                            <p className="text-[10px] text-content-muted font-medium">سحب من مستودع واحد لجميع الفروع</p>
                          </div>
                        </label>

                        <label className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          currentStrategy === 'decentralized' ? "border-brand bg-brand/5" : "border-border hover:border-brand/20"
                        )}>
                          <input type="radio" value="decentralized" {...register('inventoryStrategy')} className="sr-only" />
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                            currentStrategy === 'decentralized' ? "border-brand" : "border-border"
                          )}>
                            {currentStrategy === 'decentralized' && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                          </div>
                          <div>
                            <p className="font-black text-content text-sm">مخزون فرعي (Decentralized)</p>
                            <p className="text-[10px] text-content-muted font-medium">كل فرع يخصم من مخزونه الخاص</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border flex justify-end">
                    {canEdit && (
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-brand text-white px-12 py-4 rounded-2xl font-black hover:bg-brand/90 transition-all shadow-xl shadow-brand/10 disabled:opacity-50 hover:scale-105 active:scale-95"
                      >
                        {isSubmitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                      </button>
                    )}
                  </div>
                </form>
              )}

              {activeTab === 'branches' && (
                <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
                  <WarehouseManagement tenantId={tenantId} />
                </div>
              )}

              {activeTab === 'staff' && (
                <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
                  <Staff tenantId={tenantId} />
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                  <div className="flex items-center gap-4 border-b border-border pb-6 mb-6">
                    <div className="p-4 bg-brand/10 text-brand rounded-3xl">
                      <Palette size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-content">مظهر النظام</h3>
                      <p className="text-xs text-content-muted font-bold uppercase tracking-widest mt-1">اختر السمة التي تناسب ذوقك</p>
                    </div>
                  </div>
                  <ThemeSwitcher />
                </div>
              )}

              {activeTab === 'invoice' && (
                <InvoiceLayoutSettings tenantId={tenantId} />
              )}

              {activeTab === 'whatsapp' && (
                <div className="space-y-6">
                  <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm space-y-8">
                    <div className="flex items-center gap-4 border-b border-border pb-6">
                      <div className="p-4 bg-emerald-500/10 text-emerald-600 rounded-3xl">
                        <MessageSquare size={32} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-content">تكامل واتساب</h3>
                        <p className="text-xs text-content-muted font-bold uppercase tracking-widest mt-1">التواصل التلقائي مع العملاء</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-6 bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-surface rounded-2xl shadow-sm">
                            <Zap size={24} className="text-emerald-500" />
                          </div>
                          <div>
                            <p className="font-black text-content">إرسال الفواتير تلقائياً</p>
                            <p className="text-xs text-content-muted font-medium">إرسال رابط الفاتورة فور إنشاء الطلب</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-14 h-7 bg-surface-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-surface after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-black text-content-muted uppercase tracking-widest">قالب الرسالة الافتراضية</label>
                        <textarea 
                          defaultValue="مرحباً {customer_name}، تم استلام طلبك رقم {order_id}. يمكنك متابعة حالة الطلب من هنا: {invoice_url}"
                          className="w-full bg-surface-muted border-2 border-transparent focus:border-brand rounded-2xl p-6 font-bold transition-all outline-none h-40 resize-none text-sm leading-relaxed text-content"
                        />
                        <div className="flex flex-wrap gap-2">
                          {['{customer_name}', '{order_id}', '{invoice_url}', '{amount}'].map(tag => (
                            <span key={tag} className="text-[10px] bg-surface-muted text-content-muted px-2 py-1 rounded-lg font-bold cursor-pointer hover:bg-surface-muted/80">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'billing' && (
                <div className="space-y-6">
                  {/* Current Plan Card */}
                  <div className="bg-brand text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-surface/10 blur-[100px] -translate-x-1/2 -translate-y-1/2" />
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                      <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 bg-surface/20 text-surface px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                          <Zap size={14} />
                          الخطة الحالية
                        </div>
                        <h3 className="text-4xl font-black">الباقة الاحترافية</h3>
                        <p className="text-white/80 font-medium max-w-md">أنت تستمتع بكافة مميزات النظام السحابي المتقدم مع دعم فني على مدار الساعة.</p>
                      </div>
                      <div className="text-left">
                        <p className="text-white/60 font-bold uppercase tracking-widest text-xs mb-1">تاريخ التجديد القادم</p>
                        <p className="text-2xl font-black text-white">15 أبريل 2026</p>
                        <button className="mt-4 text-xs font-black text-surface bg-surface/10 hover:bg-surface/20 px-6 py-3 rounded-xl transition-all border border-surface/10">
                          تغيير الباقة
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Billing History */}
                  <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm space-y-6">
                    <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                      <CreditCard size={16} />
                      سجل الفواتير
                    </h4>
                    <div className="space-y-3">
                      {[
                        { date: '15 مارس 2026', amount: 299, status: 'paid' },
                        { date: '15 فبراير 2026', amount: 299, status: 'paid' },
                        { date: '15 يناير 2026', amount: 299, status: 'paid' },
                      ].map((inv, idx) => (
                        <div key={inv.date} className="flex justify-between items-center p-4 hover:bg-surface-muted rounded-2xl transition-colors border border-transparent hover:border-border">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
                              <CheckCircle2 size={18} />
                            </div>
                            <div>
                              <p className="font-bold text-content">فاتورة شهرية - {inv.date}</p>
                              <p className="text-[10px] text-content-muted font-bold uppercase">رقم الفاتورة: INV-00{idx + 123}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="font-black text-content">{formatCurrency(inv.amount)}</span>
                            <button className="p-2 text-content-muted hover:text-brand transition-colors">
                              <ExternalLink size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm space-y-8">
                   <div className="flex items-center gap-4 border-b border-border pb-6">
                      <div className="p-4 bg-amber-500/10 text-amber-600 rounded-3xl">
                        <Bell size={32} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-content">تنبيهات النظام</h3>
                        <p className="text-xs text-content-muted font-bold uppercase tracking-widest mt-1">إدارة الإشعارات والتنبيهات</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {[
                        { title: 'تنبيهات المخزون المنخفض', desc: 'تلقي إشعار عندما يقل رصيد القماش عن الحد الأدنى', checked: true },
                        { title: 'تحديثات حالة الطلب', desc: 'إشعار عند تغيير حالة أي طلب من قبل الموظفين', checked: true },
                        { title: 'تقارير المبيعات اليومية', desc: 'ملخص يومي للمبيعات والأداء في نهاية اليوم', checked: false },
                        { title: 'تنبيهات المواعيد المتأخرة', desc: 'تنبيه عند اقتراب موعد تسليم طلب لم يكتمل بعد', checked: true },
                      ].map((item) => (
                        <div key={item.title} className="flex items-center justify-between p-6 hover:bg-surface-muted rounded-[2rem] transition-all border border-transparent hover:border-border">
                          <div className="space-y-1">
                            <p className="font-black text-content">{item.title}</p>
                            <p className="text-xs text-content-muted font-medium">{item.desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={item.checked} />
                            <div className="w-12 h-6 bg-surface-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-surface after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                </div>
              )}

              {activeTab === 'data' && (
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm space-y-8">
                   <div className="flex items-center gap-4 border-b border-border pb-6">
                      <div className="p-4 bg-rose-500/10 text-rose-600 rounded-3xl">
                        <Database size={32} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-content">إدارة البيانات</h3>
                        <p className="text-xs text-content-muted font-bold uppercase tracking-widest mt-1">التحكم في البيانات والبيانات التجريبية</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-rose-500/5 rounded-[2rem] border border-rose-500/10 space-y-4">
                        <div className="flex items-center gap-3 text-rose-600">
                          <AlertCircle size={24} />
                          <h4 className="text-lg font-black">منطقة الخطر</h4>
                        </div>
                        <p className="text-sm text-rose-600/80 font-bold leading-relaxed">
                          يمكنك هنا حذف جميع البيانات التي تم تعليمها كـ "بيانات تجريبية" (Test Data).
                          هذا الإجراء سيقوم بحذف الطلبات، العملاء، المخزون، والموظفين الذين تم إنشاؤهم كبيانات تجريبية فقط.
                        </p>
                        <div className="pt-4">
                          <button
                            onClick={handleDeleteTestData}
                            disabled={isDeletingTestData}
                            className="flex items-center gap-2 bg-rose-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-rose-700 transition-all shadow-xl shadow-rose-500/10 disabled:opacity-50"
                          >
                            {isDeletingTestData ? (
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={20} />
                            )}
                            <span>حذف جميع البيانات التجريبية</span>
                          </button>
                        </div>
                      </div>
                    </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      
      <div className="mt-12 opacity-30">
        <Branding />
      </div>
    </div>
  );
}
