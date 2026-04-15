import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc, 
  deleteDoc, 
  setDoc,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Settings, 
  Globe, 
  Database, 
  Save, 
  AlertCircle, 
  Zap, 
  Ban, 
  Shield,
  ShieldCheck,
  Server,
  Activity,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Tenant } from '../types';
import GlobalRoleManager from './GlobalRoleManager';

export default function SaaSSystemSettings() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [brandingSettings, setBrandingSettings] = useState({
    websiteUrl: '',
    companyName: 'Wodoh Tech'
  });
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'test' | 'wipe';
    tenantId: string;
    tenantName: string;
    inputValue: string;
  }>({
    isOpen: false,
    type: 'test',
    tenantId: '',
    tenantName: '',
    inputValue: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      const tenantsSnap = await getDocs(collection(db, 'tenants'));
      setTenants(tenantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant)));

      const brandingDoc = await getDoc(doc(db, 'saas_settings', 'branding'));
      if (brandingDoc.exists()) {
        setBrandingSettings({
          websiteUrl: brandingDoc.data().websiteUrl || '',
          companyName: brandingDoc.data().companyName || 'Wodoh Tech'
        });
      }

      const saasUserDoc = await getDoc(doc(db, 'saas_users', auth.currentUser?.uid || ''));
      if (saasUserDoc.exists()) {
        setUserRole(saasUserDoc.data().role);
      }
    };
    fetchData();
  }, []);

  const logAuditAction = async (action: string, details: string, targetTenantId?: string) => {
    try {
      await setDoc(doc(collection(db, 'audit_logs')), {
        action,
        performedBy: auth.currentUser?.uid,
        performedByEmail: auth.currentUser?.email,
        targetTenantId,
        details,
        type: action.includes('wipe') ? 'deletion' : 'update',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging audit action:', error);
    }
  };

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    try {
      await setDoc(doc(db, 'saas_settings', 'branding'), {
        ...brandingSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email
      });
      alert('تم تحديث إعدادات العلامة التجارية بنجاح');
      await logAuditAction('update_branding', `Updated branding to ${brandingSettings.companyName}`);
    } catch (error) {
      console.error('Error saving branding settings:', error);
      alert('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const confirmWipeData = async () => {
    const { tenantId, tenantName, inputValue } = confirmModal;
    if (inputValue !== tenantName) {
      alert('الاسم غير مطابق. تم إلغاء العملية.');
      return;
    }

    setIsDeleting(true);
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      const collections = ['customers', 'orders', 'inventory', 'notifications', 'staff', 'suppliers', 'reconciliations'];
      let totalDeleted = 0;

      for (const colName of collections) {
        const q = query(collection(db, colName), where('tenantId', '==', tenantId));
        const snap = await getDocs(q);
        for (const document of snap.docs) {
          await deleteDoc(doc(db, colName, document.id));
          totalDeleted++;
        }
      }

      await logAuditAction('wipe_tenant_data', `Full data wipe performed for tenant ${tenantId} (${tenantName}). Total records deleted: ${totalDeleted}`, tenantId);
      alert(`تم مسح كافة بيانات المشترك بنجاح (${totalDeleted} سجل)`);
    } catch (error) {
      console.error('Error wiping tenant data:', error);
      alert('حدث خطأ أثناء مسح بيانات المشترك');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteTestData = async () => {
    const { tenantId } = confirmModal;
    setIsDeleting(true);
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      const collections = ['customers', 'orders', 'inventory', 'notifications'];
      let totalDeleted = 0;

      for (const colName of collections) {
        const q = query(collection(db, colName), where('tenantId', '==', tenantId), where('isTest', '==', true));
        const snap = await getDocs(q);
        for (const document of snap.docs) {
          await deleteDoc(doc(db, colName, document.id));
          totalDeleted++;
        }
      }

      await logAuditAction('delete_test_data', `Deleted test records for tenant ${tenantId}`, tenantId);
      alert(`تم حذف سجلات الاختبار بنجاح`);
    } catch (error) {
      console.error('Error deleting test data:', error);
      alert('حدث خطأ أثناء حذف بيانات الاختبار');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 font-sans" dir="rtl">
      <div>
        <h2 className="text-3xl font-black text-gray-900">إعدادات النظام (System Settings)</h2>
        <p className="text-gray-500 font-bold mt-1">تكوين الإعدادات العالمية وإدارة البيانات</p>
      </div>

      {/* Role Information Banner */}
      <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">
            <Shield size={24} />
          </div>
          <div>
            <h4 className="text-indigo-900 font-black">صلاحيات المستخدم الحالية</h4>
            <p className="text-indigo-700 text-sm font-medium">
              أنت مسجل دخول بصلاحية: <span className="font-black uppercase">{userRole || 'Super Admin'}</span>
            </p>
          </div>
        </div>
        {userRole === 'support_tech' && (
          <span className="px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-xs font-black">
            وضع العرض فقط (Support Mode)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* System Health */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={24} />
            صحة النظام والأمان
          </h3>
          <div className="space-y-6">
            {[
              { label: 'قاعدة البيانات', status: 'متصلة', health: '99.9%', icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'خدمات المصادقة', status: 'مستقرة', health: '100%', icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'التخزين السحابي', status: 'تحذير', health: '85%', icon: Server, color: 'text-amber-600', bg: 'bg-amber-50' }
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-2xl", item.bg, item.color)}>
                    <item.icon size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-gray-900">{item.label}</div>
                    <div className="text-xs text-gray-500 font-bold">{item.status}</div>
                  </div>
                </div>
                <span className={cn("text-sm font-black", item.color)}>{item.health}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Branding Settings */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-2">
            <Globe className="text-indigo-600" size={24} />
            إعدادات العلامة التجارية (White-labeling)
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-700">اسم الشركة (يظهر في Powered By)</label>
              <input 
                type="text"
                value={brandingSettings.companyName}
                onChange={(e) => setBrandingSettings(prev => ({ ...prev, companyName: e.target.value }))}
                placeholder="مثال: Wodoh Tech"
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-700">رابط الموقع الإلكتروني (Dynamic URL)</label>
              <input 
                type="url"
                value={brandingSettings.websiteUrl}
                onChange={(e) => setBrandingSettings(prev => ({ ...prev, websiteUrl: e.target.value }))}
                placeholder="https://example.com"
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              disabled={isSavingBranding || userRole === 'support_tech'}
              onClick={handleSaveBranding}
              className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100"
            >
              {isSavingBranding ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save size={20} />
              )}
              <span>حفظ إعدادات العلامة التجارية</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Role Manager */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <GlobalRoleManager />
      </div>

      {/* Advanced Data Management */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-2">
          <Database className="text-rose-600" size={24} />
          إدارة البيانات المتقدمة
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block text-sm font-black text-gray-700">اختيار المشترك للمزامنة أو الحذف</label>
            <select 
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
            >
              <option value="">-- اختر مشتركاً --</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.ownerEmail})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <button
              disabled={!selectedTenantId || isDeleting || userRole === 'support_tech' || userRole === 'billing_admin'}
              onClick={() => {
                const tenant = tenants.find(t => t.id === selectedTenantId);
                if (tenant) {
                  setConfirmModal({
                    isOpen: true,
                    type: 'test',
                    tenantId: selectedTenantId,
                    tenantName: tenant.name,
                    inputValue: ''
                  });
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-amber-50 text-amber-700 rounded-2xl font-black hover:bg-amber-100 disabled:opacity-50 transition-all"
            >
              <Zap size={20} />
              <span>حذف بيانات الاختبار</span>
            </button>
            <button
              disabled={!selectedTenantId || isDeleting || userRole === 'support_tech' || userRole === 'billing_admin'}
              onClick={() => {
                const tenant = tenants.find(t => t.id === selectedTenantId);
                if (tenant) {
                  setConfirmModal({
                    isOpen: true,
                    type: 'wipe',
                    tenantId: selectedTenantId,
                    tenantName: tenant.name,
                    inputValue: ''
                  });
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-rose-50 text-rose-700 rounded-2xl font-black hover:bg-rose-100 disabled:opacity-50 transition-all"
            >
              <Ban size={20} />
              <span>مسح كافة البيانات (Factory Reset)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-rose-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900">تأكيد عملية الحذف</h3>
                    <p className="text-sm text-gray-500 font-bold">هذا الإجراء لا يمكن التراجع عنه</p>
                  </div>
                </div>
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="p-2 hover:bg-white rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                  <p className="text-rose-800 text-sm font-bold leading-relaxed">
                    {confirmModal.type === 'wipe' 
                      ? `أنت على وشك مسح كافة بيانات المشترك (${confirmModal.tenantName}) بشكل نهائي. سيتم حذف العملاء، الطلبات، المخزون، وكافة السجلات المرتبطة.`
                      : `أنت على وشك حذف كافة بيانات الاختبار للمشترك (${confirmModal.tenantName}). سيتم حذف السجلات التي تحمل علامة "بيانات اختبار" فقط.`
                    }
                  </p>
                </div>

                {confirmModal.type === 'wipe' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-black text-gray-700">
                      يرجى كتابة اسم المشترك للتأكيد: <span className="text-rose-600">({confirmModal.tenantName})</span>
                    </label>
                    <input 
                      type="text"
                      value={confirmModal.inputValue}
                      onChange={(e) => setConfirmModal(prev => ({ ...prev, inputValue: e.target.value }))}
                      placeholder="اكتب الاسم هنا..."
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black hover:bg-gray-200 transition-all"
                  >
                    إلغاء
                  </button>
                  <button 
                    onClick={confirmModal.type === 'wipe' ? confirmWipeData : confirmDeleteTestData}
                    disabled={confirmModal.type === 'wipe' && confirmModal.inputValue !== confirmModal.tenantName}
                    className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-2xl font-black hover:bg-rose-700 disabled:opacity-50 shadow-lg shadow-rose-100 transition-all"
                  >
                    تأكيد الحذف النهائي
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
