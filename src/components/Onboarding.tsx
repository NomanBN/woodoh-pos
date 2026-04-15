import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Store, 
  MapPin, 
  Phone, 
  CheckCircle, 
  ArrowLeft, 
  ArrowRight,
  Scissors,
  X,
  Loader2,
  Lock,
  Shield,
  AlertCircle
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { hashPin } from '../services/staffService';
import { initializeTenantRoles } from '../services/permissionService';
import { convertToMeters } from '../services/inventoryService';
import { AuditLog } from '../types';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { onboardingSchema } from '../lib/validations';
import { cn } from '../lib/utils';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import Branding from './Branding';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { register, handleSubmit, trigger, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      customerId: '',
      shopName: '',
      category: 'tailor' as const,
      inventoryStrategy: 'centralized' as const,
      phone: '',
      address: ''
    }
  });

  const [initialItems, setInitialItems] = useState<any[]>([
    { name: 'قماش ياباني أبيض', unit: 'meter', conversionRate: 1, quantity: 0 }
  ]);

  const handleNext = async () => {
    const fields = step === 1 ? ['customerId', 'shopName', 'category'] : step === 2 ? ['address', 'phone'] : step === 3 ? ['inventoryStrategy'] : [];
    
    if (step === 5) {
      if (validatePin()) {
        handleSubmit(onSubmit)();
      }
      return;
    }

    if (step === 4) {
      setStep(step + 1);
      return;
    }

    const isValid = await trigger(fields as any);
    if (isValid) setStep(step + 1);
  };

  const validatePin = () => {
    const weakPins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1212', '2580'];
    if (pin.length !== 4) {
      setPinError('يجب أن يتكون الرمز من 4 أرقام');
      return false;
    }
    if (pin !== confirmPin) {
      setPinError('الرمزان غير متطابقين');
      return false;
    }
    if (weakPins.includes(pin)) {
      setPinError('هذا الرمز ضعيف جداً، يرجى اختيار رمز أكثر تعقيداً');
      return false;
    }
    setPinError(null);
    return true;
  };

  const handleBack = () => setStep(step - 1);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      // 1. Check if Customer ID is already taken
      const qCheck = query(collection(db, 'tenants'), where('customerId', '==', data.customerId));
      const checkSnap = await getDocs(qCheck);
      if (!checkSnap.empty) {
        alert('كود العميل هذا مستخدم بالفعل، يرجى اختيار كود آخر.');
        setLoading(false);
        return;
      }

      // 2. Update the request
      const q = query(collection(db, 'tailorRequests'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const reqDoc = snap.docs[0];
        await updateDoc(doc(db, 'tailorRequests', reqDoc.id), {
          customerId: data.customerId,
          shopName: data.shopName,
          address: data.address,
          shopPhone: data.phone,
          category: data.category,
          onboardingStep: 2,
          status: 'pending'
        });
      }

      // 3. Create the Tenant Workspace (Pending)
      // Use Customer ID as the document ID to ensure stability
      await setDoc(doc(db, 'tenants', data.customerId), {
        uid: user.uid,
        customerId: data.customerId,
        name: data.shopName,
        address: data.address,
        phone: data.phone,
        category: data.category,
        inventoryStrategy: data.inventoryStrategy,
        defaultLayout: data.defaultLayout || 'sidebar',
        defaultFulfillment: data.defaultFulfillment || 'split',
        ownerEmail: user.email,
        status: 'pending',
        planId: 'basic',
        createdAt: new Date().toISOString()
      });

      // 3.5 Create Initial Branch
      const branchRef = await addDoc(collection(db, 'branches'), {
        name: data.inventoryStrategy === 'centralized' ? 'المستودع المركزي' : 'المعرض الرئيسي',
        location: data.address,
        phone: data.phone,
        type: data.inventoryStrategy === 'centralized' ? 'warehouse' : 'store',
        tenantId: data.customerId,
        isMain: true,
        createdAt: new Date().toISOString()
      });

      // 4.5 Initialize Default Roles
      const roleIds = await initializeTenantRoles(data.customerId);

      // 4. Create the first Staff Member (Admin)
      const hashedPin = await hashPin(pin);
      await setDoc(doc(db, 'staff', user.uid), {
        name: data.shopName,
        email: user.email,
        phone: data.phone,
        role: 'owner', // Use 'owner' for the first user
        roleId: roleIds['owner'] || '',
        status: 'active',
        pin: hashedPin,
        mustChangePin: false,
        tenantId: data.customerId,
        branchId: branchRef.id, // Link first staff to the main branch
        createdAt: serverTimestamp()
      });

      // 4.6 Create Initial Inventory
      for (const item of initialItems) {
        if (item.name) {
          const itemRef = await addDoc(collection(db, 'inventory'), {
            name: item.name,
            category: 'fabric',
            unit: item.unit,
            baseUnit: 'meter',
            conversionRate: item.conversionRate,
            minThreshold: 10,
            pricePerUnit: 0,
            tenantId: data.customerId,
            sku: `${item.name.substring(0,3).toUpperCase()}-${Math.floor(1000+Math.random()*9000)}`,
            barcode: Math.random().toString().substring(2, 12),
            quantity: convertToMeters(item.quantity || 0, item.unit),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // Initialize stock for the first branch
          const initialQuantityInMeters = convertToMeters(item.quantity || 0, item.unit);
          await setDoc(doc(db, 'branch_inventory', `${branchRef.id}_${itemRef.id}`), {
            branchId: branchRef.id,
            itemId: itemRef.id,
            quantity: initialQuantityInMeters,
            tenantId: data.customerId,
            updatedAt: new Date().toISOString()
          });

          // Log initial stock addition
          if (item.quantity > 0) {
            await addDoc(collection(db, 'stock_ledger'), {
              itemId: itemRef.id,
              branchId: branchRef.id,
              type: 'addition',
              previousQuantity: 0,
              newQuantity: initialQuantityInMeters,
              change: initialQuantityInMeters,
              staffId: user.uid,
              staffName: data.shopName,
              tenantId: data.customerId,
              createdAt: new Date().toISOString()
            });
          }
        }
      }

      // 5. Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'تعيين الرمز الأول (Onboarding)',
        performedBy: 'Owner',
        performedByEmail: user.email || '',
        targetTenantId: data.customerId,
        details: `تم إكمال إعداد الرمز السري الأول للمنشأة خلال مرحلة التهيئة للعميل ${data.customerId}`,
        timestamp: new Date().toISOString(),
        type: 'security'
      } as Omit<AuditLog, 'id'>);

      // 6. Track Onboarding Success
      analytics.track(AnalyticsEvent.TENANT_ONBOARDED, {
        customer_id: data.customerId,
        shop_name: data.shopName,
        category: data.category,
        onboarding_source: 'web_app'
      });

      setStep(4); // Success step
    } catch (error) {
      console.error('Onboarding error:', error);
      alert('حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-100 overflow-hidden flex flex-col md:flex-row">
        
        {/* Sidebar - Progress */}
        <div className="md:w-1/3 bg-indigo-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          
          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-3 mb-12">
              <div className="bg-white/20 p-2 rounded-xl">
                <Scissors size={24} />
              </div>
              <h1 className="font-black text-xl">تهيئة النظام</h1>
            </div>

            <div className="space-y-6">
              {[
                { s: 1, t: 'معلومات المتجر', d: 'اسم المحل ونوعه' },
                { s: 2, t: 'الموقع والتواصل', d: 'العنوان ورقم الهاتف' },
                { s: 3, t: 'استراتيجية المخزون', d: 'مركزي أم فرعي' },
                { s: 4, t: 'الأصناف الأولية', d: 'تعريف الأقمشة والوحدات' },
                { s: 5, t: 'أمان النظام', d: 'تعيين رمز الدخول' },
                { s: 6, t: 'مراجعة الطلب', d: 'تأكيد البيانات' }
              ].map((item) => (
                <div key={item.s} className="flex gap-4 items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    step >= item.s ? 'bg-white text-indigo-600' : 'bg-indigo-500 text-indigo-300'
                  }`}>
                    {step > item.s ? <CheckCircle size={16} /> : item.s}
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${step >= item.s ? 'text-white' : 'text-indigo-300'}`}>{item.t}</p>
                    <p className="text-[10px] text-indigo-200">{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="md:w-2/3 p-8 md:p-12">
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">معلومات المتجر</h2>
                <p className="text-gray-500 font-medium">أخبرنا عن اسم محلك التجاري</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">كود العميل (Customer ID)</label>
                  <div className="relative">
                    <CheckCircle className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      {...register('customerId')}
                      placeholder="مثال: CUST-12345"
                      className={cn(
                        "w-full bg-gray-50 border-none rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-indigo-600 outline-none font-medium",
                        errors.customerId && "ring-2 ring-red-500"
                      )}
                    />
                    {errors.customerId && <p className="text-xs text-red-500 font-bold mt-1">{errors.customerId.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">اسم المحل / العلامة التجارية</label>
                  <div className="relative">
                    <Store className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      {...register('shopName')}
                      placeholder="مثال: خياط الفخامة"
                      className={cn(
                        "w-full bg-gray-50 border-none rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-indigo-600 outline-none font-medium",
                        errors.shopName && "ring-2 ring-red-500"
                      )}
                    />
                    {errors.shopName && <p className="text-xs text-red-500 font-bold mt-1">{errors.shopName.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">نوع النشاط</label>
                  <select 
                    {...register('category')}
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-600 outline-none font-medium"
                  >
                    <option value="tailor">خياطة رجالية</option>
                    <option value="tailor-female">خياطة نسائية</option>
                    <option value="uniform">زي موحد</option>
                  </select>
                </div>
              </div>

              <button 
                onClick={handleNext}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                <span>التالي</span>
                <ArrowLeft size={20} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">الموقع والتواصل</h2>
                <p className="text-gray-500 font-medium">كيف يمكن للعملاء الوصول إليك؟</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">عنوان المحل</label>
                  <div className="relative">
                    <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      {...register('address')}
                      placeholder="المدينة، الحي، الشارع"
                      className={cn(
                        "w-full bg-gray-50 border-none rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-indigo-600 outline-none font-medium",
                        errors.address && "ring-2 ring-red-500"
                      )}
                    />
                    {errors.address && <p className="text-xs text-red-500 font-bold mt-1">{errors.address.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">رقم هاتف المحل (اختياري)</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="tel"
                      {...register('phone')}
                      placeholder="01XXXXXXXX"
                      className={cn(
                        "w-full bg-gray-50 border-none rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-indigo-600 outline-none font-medium",
                        errors.phone && "ring-2 ring-red-500"
                      )}
                    />
                    {errors.phone && <p className="text-xs text-red-500 font-bold mt-1">{errors.phone.message}</p>}
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleBack}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  السابق
                </button>
                <button 
                  onClick={handleNext}
                  className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <span>التالي</span>
                  <ArrowLeft size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">إعدادات النظام</h2>
                <p className="text-gray-500 font-medium">كيف تود إدارة مخزونك وواجهة النظام؟</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">استراتيجية المخزون</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('inventoryStrategy') === 'centralized' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="centralized" 
                        {...register('inventoryStrategy')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('inventoryStrategy') === 'centralized' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('inventoryStrategy') === 'centralized' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">مخزون مركزي (Centralized)</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">جميع الفروع تسحب وتستهلك من مستودع مركزي واحد مشترك.</p>
                    </label>

                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('inventoryStrategy') === 'decentralized' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="decentralized" 
                        {...register('inventoryStrategy')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('inventoryStrategy') === 'decentralized' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('inventoryStrategy') === 'decentralized' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">مخزون فرعي (Decentralized)</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">كل فرع يمتلك مستودعه الخاص، والطلبات تخصم فقط من مخزون الفرع.</p>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">واجهة النظام الافتراضية</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('defaultLayout') === 'sidebar' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="sidebar" 
                        {...register('defaultLayout')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('defaultLayout') === 'sidebar' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('defaultLayout') === 'sidebar' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">القائمة الجانبية</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">واجهة تقليدية مع قائمة جانبية للتنقل.</p>
                    </label>

                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('defaultLayout') === 'grid' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="grid" 
                        {...register('defaultLayout')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('defaultLayout') === 'grid' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('defaultLayout') === 'grid' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">الشبكة (Grid)</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">واجهة لمسية للتابلت مع بطاقات كبيرة.</p>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">آلية التسليم الافتراضية</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('defaultFulfillment') === 'split' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="split" 
                        {...register('defaultFulfillment')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('defaultFulfillment') === 'split' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('defaultFulfillment') === 'split' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">تسليم مجزأ (Split)</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">تسليم المنتجات الجاهزة فوراً وتأجيل التفصيل.</p>
                    </label>

                    <label className={cn(
                      "relative flex flex-col p-6 rounded-3xl border-2 cursor-pointer transition-all",
                      getValues('defaultFulfillment') === 'unified' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                    )}>
                      <input 
                        type="radio" 
                        value="unified" 
                        {...register('defaultFulfillment')} 
                        className="sr-only"
                      />
                      <div className="flex items-center gap-4 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                          getValues('defaultFulfillment') === 'unified' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {getValues('defaultFulfillment') === 'unified' && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className="font-black text-lg text-gray-900">تسليم موحد (Unified)</span>
                      </div>
                      <p className="text-sm text-gray-500 font-medium mr-10">تسليم جميع عناصر الطلب معاً في نفس الوقت.</p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleBack}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  السابق
                </button>
                <button 
                  onClick={handleNext}
                  className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <span>التالي</span>
                  <ArrowLeft size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">الأصناف الأولية</h2>
                <p className="text-gray-500 font-medium">قم بتعريف الأقمشة الأساسية ومعاملات التحويل</p>
              </div>

              <div className="space-y-4 max-h-[40vh] overflow-y-auto p-2">
                {initialItems.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3 relative group">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase">اسم القماش</label>
                        <input 
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...initialItems];
                            newItems[idx].name = e.target.value;
                            setInitialItems(newItems);
                          }}
                          className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold shadow-sm"
                          placeholder="مثلاً: قماش قطن"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase">الوحدة الأساسية</label>
                        <select 
                          value={item.unit}
                          onChange={(e) => {
                            const newItems = [...initialItems];
                            newItems[idx].unit = e.target.value;
                            setInitialItems(newItems);
                          }}
                          className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold shadow-sm"
                        >
                          <option value="meter">متر</option>
                          <option value="yard">ياردة</option>
                          <option value="roll">رول</option>
                          <option value="bolt">طاقة</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase">معامل التحويل (للمتر)</label>
                        <input 
                          type="number"
                          step="0.0001"
                          value={item.conversionRate}
                          onChange={(e) => {
                            const newItems = [...initialItems];
                            newItems[idx].conversionRate = Number(e.target.value);
                            setInitialItems(newItems);
                          }}
                          className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold shadow-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase">الكمية الافتتاحية</label>
                        <input 
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...initialItems];
                            newItems[idx].quantity = Number(e.target.value);
                            setInitialItems(newItems);
                          }}
                          className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold shadow-sm"
                        />
                      </div>
                    </div>
                    {initialItems.length > 1 && (
                      <button 
                        onClick={() => setInitialItems(initialItems.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setInitialItems([...initialItems, { name: '', unit: 'meter', conversionRate: 1, quantity: 0 }])}
                className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-all"
              >
                + إضافة صنف آخر
              </button>

              <div className="flex gap-4">
                <button 
                  onClick={handleBack}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  السابق
                </button>
                <button 
                  onClick={handleNext}
                  className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <span>التالي</span>
                  <ArrowLeft size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">أمان النظام</h2>
                <p className="text-gray-500 font-medium">تعيين رمز الدخول السريع الأول للموظفين</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Lock size={16} className="text-indigo-600" />
                    الرمز السري الجديد (4 أرقام)
                  </label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, ''));
                      setPinError(null);
                    }}
                    className={cn(
                      "w-full bg-gray-50 border-none rounded-2xl py-4 text-center text-2xl font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-indigo-600",
                      pinError && "ring-2 ring-red-500"
                    )}
                    placeholder="****"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Shield size={16} className="text-indigo-600" />
                    تأكيد الرمز السري
                  </label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => {
                      setConfirmPin(e.target.value.replace(/\D/g, ''));
                      setPinError(null);
                    }}
                    className={cn(
                      "w-full bg-gray-50 border-none rounded-2xl py-4 text-center text-2xl font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-indigo-600",
                      pinError && "ring-2 ring-red-500"
                    )}
                    placeholder="****"
                  />
                </div>

                {pinError && (
                  <div className="flex items-center gap-2 text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl border border-red-100">
                    <AlertCircle size={16} />
                    <span>{pinError}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleBack}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  السابق
                </button>
                <button 
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : null}
                  <span>إكمال الإعداد</span>
                  <ArrowLeft size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full mb-4">
                <CheckCircle size={48} />
              </div>
              <h2 className="text-3xl font-black text-gray-900">تم إرسال طلبك!</h2>
              <p className="text-gray-500 font-medium leading-relaxed">
                شكراً لك على إكمال بيانات المتجر. طلبك الآن قيد المراجعة النهائية من قبل الإدارة. سيتم إخطارك فور تفعيل مساحة العمل الخاصة بك.
              </p>
              <button 
                onClick={() => {
                  auth.signOut();
                  navigate('/login');
                }}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
              >
                العودة للرئيسية
              </button>
              
              <Branding className="mt-8 opacity-50" />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
