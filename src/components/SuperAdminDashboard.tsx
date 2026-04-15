import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  query,
  orderBy,
  limit,
  where
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Tenant, Order, TailorRequest } from '../types';
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  Activity, 
  AlertCircle, 
  Shield,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TailorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tenantsSnap, ordersSnap, saasUserSnap, requestsSnap] = await Promise.all([
          getDocs(collection(db, 'tenants')),
          getDocs(query(collection(db, 'orders'), orderBy('orderDate', 'desc'), limit(50))),
          getDoc(doc(db, 'saas_users', auth.currentUser?.uid || '')),
          getDocs(query(collection(db, 'tailorRequests'), where('status', '==', 'pending')))
        ]);

        const tenantsData = tenantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
        const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        setTenants(tenantsData);
        setOrders(ordersData);
        setPendingRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TailorRequest)));
        
        if (saasUserSnap.exists()) {
          setUserRole(saasUserSnap.data().role);
          setUserName(saasUserSnap.data().name || auth.currentUser?.email?.split('@')[0] || '');
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalPlatformRevenue = orders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const platformCommission = totalPlatformRevenue * 0.05;

  const stats = [
    { 
      label: 'إجمالي المشتركين', 
      value: tenants.length, 
      icon: Users, 
      color: 'text-brand', 
      bg: 'bg-brand/10',
      trend: '+12%',
      isPositive: true
    },
    { 
      label: 'إجمالي الطلبات', 
      value: orders.length, 
      icon: ShoppingBag, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-500/10',
      trend: '+8%',
      isPositive: true
    },
    { 
      label: 'إيرادات المنصة (5%)', 
      value: `${platformCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`, 
      icon: DollarSign, 
      color: 'text-amber-600', 
      bg: 'bg-amber-500/10',
      trend: '+15%',
      isPositive: true
    },
    { 
      label: 'طلبات الانضمام المعلقة', 
      value: pendingRequests.length, 
      icon: Clock, 
      color: 'text-rose-600', 
      bg: 'bg-rose-500/10',
      trend: pendingRequests.length > 5 ? 'عالي' : 'طبيعي',
      isPositive: pendingRequests.length <= 5
    },
  ];

  // Prepare chart data (mocking daily revenue for now as we don't have full history in the query)
  const chartData = [
    { name: 'السبت', value: 400 },
    { name: 'الأحد', value: 300 },
    { name: 'الاثنين', value: 600 },
    { name: 'الثلاثاء', value: 800 },
    { name: 'الأربعاء', value: 500 },
    { name: 'الخميس', value: 900 },
    { name: 'الجمعة', value: 1100 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans" dir="rtl">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-content">أهلاً بك، {userName} 👋</h2>
          <p className="text-content-muted font-bold mt-1">نظرة عامة على أداء منصة الخياط الذكي اليوم</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-6 py-3 bg-surface border border-border rounded-2xl shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-black text-content-muted uppercase tracking-widest">النظام يعمل بشكل ممتاز</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm hover:shadow-xl hover:shadow-brand/5 transition-all group relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-6">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", stat.bg, stat.color)}>
                <stat.icon size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black",
                stat.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stat.isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {stat.trend}
              </div>
            </div>
            <div className="text-3xl font-black text-content mb-1">{stat.value}</div>
            <div className="text-sm font-bold text-content-muted">{stat.label}</div>
            
            {/* Background Decoration */}
            <div className={cn("absolute -right-4 -bottom-4 w-24 h-24 opacity-5 transition-transform group-hover:scale-125", stat.color)}>
              <stat.icon size={96} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-content flex items-center gap-2">
              <TrendingUp className="text-brand" size={24} />
              نمو الإيرادات (العمولة 5%)
            </h3>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-brand text-white rounded-xl text-xs font-bold shadow-lg shadow-brand/10">الإيرادات</button>
              <button className="px-4 py-2 bg-surface-muted text-content-muted rounded-xl text-xs font-bold hover:bg-surface transition-colors">المشتركين</button>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-border)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 900, color: 'var(--bg-brand)' }}
                  labelStyle={{ color: 'var(--text-content)', fontWeight: 700 }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--bg-brand)" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <h3 className="text-xl font-black text-content mb-8 flex items-center gap-2">
            <Activity className="text-brand" size={24} />
            آخر النشاطات
          </h3>
          <div className="space-y-6">
            {[
              { type: 'new_tenant', user: 'خياط النخبة', action: 'اشترك في الخطة الاحترافية', time: 'منذ 5 دقائق' },
              { type: 'payment', user: 'خياط الموضة', action: 'تم تجديد الاشتراك السنوي', time: 'منذ 12 دقيقة' },
              { type: 'alert', user: 'النظام', action: 'محاولة دخول مشبوهة من IP غير معروف', time: 'منذ 45 دقيقة' },
              { type: 'update', user: 'المشرف', action: 'تحديث أسعار الخطط الأساسية', time: 'منذ ساعتين' },
            ].map((activity, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className={cn(
                  "p-2.5 rounded-xl",
                  activity.type === 'new_tenant' ? "bg-emerald-500/10 text-emerald-600" :
                  activity.type === 'payment' ? "bg-blue-500/10 text-blue-600" :
                  activity.type === 'alert' ? "bg-rose-500/10 text-rose-600" : "bg-surface-muted text-content-muted"
                )}>
                  {activity.type === 'new_tenant' ? <Users size={18} /> :
                   activity.type === 'payment' ? <DollarSign size={18} /> :
                   activity.type === 'alert' ? <Shield size={18} /> : <Activity size={18} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-content">
                    <span className="text-brand">{activity.user}</span> {activity.action}
                  </div>
                  <div className="text-[10px] text-content-muted mt-1 font-black uppercase tracking-widest">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-4 bg-surface-muted text-content-muted text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-surface transition-all border border-border">
            عرض كافة النشاطات
          </button>
        </div>
      </div>

      {/* Latest Orders Table */}
      <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
        <div className="p-8 border-b border-border flex items-center justify-between">
          <h3 className="text-xl font-black text-content flex items-center gap-2">
            <ShoppingBag className="text-brand" size={24} />
            أحدث الطلبات عبر المنصة
          </h3>
          <button className="text-brand text-sm font-black hover:underline">عرض كافة الطلبات</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-surface-muted/50">
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">رقم الطلب</th>
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">العميل</th>
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">المشغل (Tenant)</th>
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">المبلغ</th>
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">الحالة</th>
                <th className="px-8 py-4 text-xs font-black text-content-muted uppercase tracking-widest">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="hover:bg-surface-muted/50 transition-colors group">
                  <td className="px-8 py-6">
                    <span className="text-sm font-black text-content group-hover:text-brand transition-colors">#{order.id.slice(-6).toUpperCase()}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-sm font-bold text-content">{order.customerName}</div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-sm font-bold text-brand">{tenants.find(t => t.id === order.tenantId)?.name || 'غير معروف'}</div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-sm font-black text-content">{order.totalAmount.toLocaleString()} ر.س</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      order.status === 'delivered' ? "bg-emerald-500/10 text-emerald-600" :
                      order.status === 'ready' ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
                    )}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-sm font-bold text-content-muted">
                    {new Date(order.orderDate).toLocaleDateString('ar-SA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Newest Subscribers */}
        <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <h3 className="text-xl font-black text-content mb-8 flex items-center gap-2">
            <Users className="text-brand" size={24} />
            أحدث المشتركين
          </h3>
          <div className="space-y-6">
            {tenants.slice(0, 4).map((tenant) => (
              <div key={tenant.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface-muted transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-black text-lg">
                    {tenant.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-black text-content">{tenant.name}</div>
                    <div className="text-xs text-content-muted font-bold">{tenant.ownerEmail}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-1">{tenant.planId || 'الخطة الأساسية'}</div>
                  <div className="text-[10px] text-content-muted font-bold">{new Date(tenant.createdAt).toLocaleDateString('ar-SA')}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-4 bg-brand/10 text-brand text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-brand/20 transition-all">
            إدارة كافة المشتركين
          </button>
        </div>

        {/* Pending Approval Requests */}
        <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <h3 className="text-xl font-black text-content mb-8 flex items-center gap-2">
            <Clock className="text-rose-600" size={24} />
            طلبات انتظار المراجعة
          </h3>
          {pendingRequests.length > 0 ? (
            <div className="space-y-6">
              {pendingRequests.slice(0, 4).map((req) => (
                <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                      <Users size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-black text-content">{req.shopName || req.name}</div>
                      <div className="text-xs text-content-muted font-bold">{req.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-100">
                      <CheckCircle2 size={18} />
                    </button>
                    <button className="p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors shadow-lg shadow-rose-100">
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
              <CheckCircle2 size={48} className="text-emerald-500 mb-4 opacity-20" />
              <p className="font-bold">لا توجد طلبات معلقة حالياً</p>
            </div>
          )}
          <button className="w-full mt-8 py-4 bg-surface-muted text-content-muted text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-surface transition-all border border-border">
            عرض كافة الطلبات
          </button>
        </div>
      </div>

      {/* Onboarding Rules Reminder */}
      <div className="bg-amber-500/5 p-8 rounded-[2.5rem] border border-amber-500/10 flex flex-col md:flex-row items-center gap-8">
        <div className="w-20 h-20 bg-amber-500/10 text-amber-600 rounded-[2rem] flex items-center justify-center shrink-0 shadow-inner">
          <AlertCircle size={40} />
        </div>
        <div className="flex-1 text-center md:text-right">
          <h3 className="text-xl font-black text-amber-600 mb-2">قواعد تكامل البيانات الصارمة</h3>
          <p className="text-amber-600/80 font-medium leading-relaxed">
            تذكير: عند إضافة مشترك جديد أو مزامنة بياناته، يجب الالتزام بقواعد التحقق من صحة البيانات (Data Validation) لضمان عدم حدوث تداخل بين قواعد بيانات المشتركين. يمنع منعاً باتاً استخدام بيانات وهمية في بيئة الإنتاج.
          </p>
        </div>
        <button className="px-8 py-4 bg-amber-600 text-white rounded-2xl font-black hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 shrink-0">
          مراجعة دليل الأمان
        </button>
      </div>
    </div>
  );
}
