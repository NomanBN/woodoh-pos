import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  UserCheck,
  UserX,
  Mail,
  Phone,
  Users,
  ShoppingBag,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { TailorRequest, Tenant } from '../types';
import { motion } from 'motion/react';
import { formatCurrency } from '../lib/utils';
import { autoSeed } from '../services/seedService';

export default function AdminTailors() {
  const [requests, setRequests] = useState<TailorRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [platformStats, setPlatformStats] = useState({
    totalTenants: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingRequests: 0
  });

  useEffect(() => {
    const qReq = query(collection(db, 'tailorRequests'));
    const unsubscribeReq = onSnapshot(qReq, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TailorRequest));
      setRequests(reqs);
      setPlatformStats(prev => ({ ...prev, pendingRequests: reqs.filter(r => r.status === 'pending').length }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tailorRequests');
    });

    const qTenants = query(collection(db, 'tenants'));
    const unsubscribeTenants = onSnapshot(qTenants, (snapshot) => {
      const ts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
      setTenants(ts);
      setPlatformStats(prev => ({ ...prev, totalTenants: ts.length }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    });

    // Global Stats Fetch
    const fetchGlobalStats = async () => {
      try {
        const ordersSnap = await getDocs(collection(db, 'orders'));
        const orders = ordersSnap.docs.map(doc => doc.data());
        const revenue = orders.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
        
        setPlatformStats(prev => ({
          ...prev,
          totalOrders: ordersSnap.size,
          totalRevenue: revenue
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders_global');
      }
    };

    fetchGlobalStats();

    return () => {
      unsubscribeReq();
      unsubscribeTenants();
    };
  }, []);

  const handleApprove = async (request: TailorRequest) => {
    try {
      // 1. Update Request Status
      await updateDoc(doc(db, 'tailorRequests', request.id), { status: 'approved' });
      
      // 2. Activate Tenant Workspace
      // Use Customer ID as the primary identifier if available, otherwise fallback to uid
      const tenantId = request.customerId || request.uid;
      
      await setDoc(doc(db, 'tenants', tenantId), {
        status: 'active',
        customerId: request.customerId,
        uid: request.uid,
        name: request.shopName || request.name,
        phone: request.shopPhone || request.phone,
        ownerEmail: request.email,
        planId: 'basic',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert('تمت الموافقة على الخياط وتفعيل مساحة العمل بنجاح');
    } catch (error: any) {
      console.error('Error approving tailor:', error);
      alert('حدث خطأ أثناء الموافقة: ' + (error.message || 'خطأ في الصلاحيات'));
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === 'active' ? 'inactive' : 'active';
    if (confirm(`هل أنت متأكد من ${newStatus === 'active' ? 'تفعيل' : 'تعطيل'} هذا الحساب؟`)) {
      await updateDoc(doc(db, 'tenants', tenant.id), { status: newStatus });
    }
  };

  const handleManualSeed = async () => {
    if (!confirm('هل تريد إضافة بيانات تجريبية؟ سيتم إضافة خطط ومحلات وطلبات وهمية لتجربة النظام.')) return;
    setLoading(true);
    const success = await autoSeed();
    setLoading(false);
    if (success) {
      alert('تمت إضافة البيانات التجريبية بنجاح! يرجى تحديث الصفحة لرؤية التغييرات.');
      window.location.reload();
    } else {
      alert('تمت إضافة البيانات بالفعل أو حدث خطأ أثناء الإضافة.');
    }
  };

  const statsCards = [
    { label: 'إجمالي المحلات', value: platformStats.totalTenants, icon: Users, color: 'bg-blue-500' },
    { label: 'إجمالي الطلبات', value: platformStats.totalOrders, icon: ShoppingBag, color: 'bg-indigo-500' },
    { label: 'إجمالي المبيعات', value: formatCurrency(platformStats.totalRevenue), icon: DollarSign, color: 'bg-emerald-500' },
    { label: 'طلبات معلقة', value: platformStats.pendingRequests, icon: Clock, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-content">إدارة المنصة</h2>
          <p className="text-content-muted mt-1">نظرة شاملة على جميع الخياطين والمحلات المشتركة</p>
        </div>
        <button 
          onClick={handleManualSeed}
          className="bg-brand text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10 flex items-center gap-2"
        >
          <Activity size={20} />
          إضافة بيانات تجريبية
        </button>
      </header>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat) => (
          <div key={stat.label} className="bg-surface p-6 rounded-3xl border border-border shadow-sm">
            <div className={`${stat.color} w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4`}>
              <stat.icon size={24} />
            </div>
            <p className="text-content-muted text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold text-content mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Pending Requests */}
        <div className="xl:col-span-1 space-y-4">
          <h3 className="text-xl font-bold text-content flex items-center gap-2">
            <Activity className="text-amber-500" size={20} />
            طلبات جديدة
          </h3>
          <div className="space-y-4">
            {requests.filter(r => r.status === 'pending').map((req) => (
              <motion.div 
                key={req.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-surface p-5 rounded-3xl border border-border shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-content">{req.name}</h4>
                    <p className="text-xs text-content-muted mt-1">{req.email}</p>
                    <p className="text-xs text-brand font-medium mt-1">{req.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleApprove(req)}
                      className="bg-emerald-500/10 text-emerald-600 p-2 rounded-xl hover:bg-emerald-500/20 transition-colors"
                    >
                      <UserCheck size={18} />
                    </button>
                    <button 
                      onClick={() => updateDoc(doc(db, 'tailorRequests', req.id), { status: 'rejected' })}
                      className="bg-red-500/10 text-red-600 p-2 rounded-xl hover:bg-red-500/20 transition-colors"
                    >
                      <UserX size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            {requests.filter(r => r.status === 'pending').length === 0 && (
              <div className="bg-surface-muted p-8 rounded-3xl text-center border border-dashed border-border">
                <p className="text-content-muted text-sm">لا توجد طلبات جديدة</p>
              </div>
            )}
          </div>
        </div>

        {/* Tailors List */}
        <div className="xl:col-span-2 space-y-4">
          <h3 className="text-xl font-bold text-content flex items-center gap-2">
            <ShieldCheck className="text-brand" size={20} />
            المحلات المعتمدة
          </h3>
          <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-surface-muted text-content-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">كود العميل</th>
                  <th className="px-6 py-4 font-medium">المحل / المالك</th>
                  <th className="px-6 py-4 font-medium">التواصل</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-xs font-black bg-surface-muted px-2 py-1 rounded-lg text-content-muted">
                        {tenant.customerId || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-content">{tenant.name}</div>
                      <div className="text-xs text-content-muted">{tenant.ownerEmail === "nomansa2566512@gmail.com" ? 'مسؤول المنصة' : 'محل مشترك'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-content-muted">{tenant.ownerEmail}</div>
                      <div className="text-xs text-content-muted">{tenant.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        tenant.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                      }`}>
                        {tenant.status === 'active' ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {tenant.ownerEmail !== "nomansa2566512@gmail.com" && (
                        <button 
                          onClick={() => handleToggleStatus(tenant)}
                          className={`p-2 rounded-xl transition-colors ${
                            tenant.status === 'active' ? 'text-red-400 hover:bg-red-500/10 hover:text-red-600' : 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-600'
                          }`}
                          title={tenant.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        >
                          {tenant.status === 'active' ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
