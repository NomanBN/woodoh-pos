import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShoppingBag, 
  Clock, 
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Package,
  CheckCircle2,
  Bell,
  X,
  Download,
  Search,
  ArrowUpDown,
  ExternalLink,
  FileSpreadsheet,
  Store
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, writeBatch, doc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Customer, Order, InventoryItem, AppNotification, OrderStatus, Tenant, BranchInventory } from '../types';
import { STATUS_CONFIG } from './Orders';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Header from './Header';
import { useStaff } from '../contexts/StaffContext';
import { usePermissions } from '../hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import Branding from './Branding';
import { useTranslation } from 'react-i18next';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

interface DashboardProps {
  tenantId: string;
}

const DrillDownModal = ({ 
  drillDown, 
  drillSearch, 
  setDrillSearch, 
  drillSort, 
  setDrillSort, 
  setDrillDown,
  exportToExcel
}: any) => {
  const { t } = useTranslation();
  if (!drillDown) return null;

  const filteredData = drillDown.data
    .filter((item: any) => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(drillSearch.toLowerCase())
      )
    )
    .sort((a: any, b: any) => {
      const valA = a[drillSort.key];
      const valB = b[drillSort.key];
      if (drillSort.dir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setDrillDown(null)} />
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-surface w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-muted/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-brand text-white rounded-2xl shadow-lg shadow-brand/10">
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-content">{drillDown.title}</h2>
              <p className="text-xs text-content-muted font-bold uppercase tracking-widest">{t('dashboard.drill_down_title')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => exportToExcel(filteredData, drillDown.type)}
              className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 text-sm font-bold text-emerald-500 hover:bg-emerald-500/20 transition-all"
            >
              <FileSpreadsheet size={18} />
              {t('dashboard.export_excel')}
            </button>
            <button onClick={() => setDrillDown(null)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
              <X size={24} className="text-content-muted" />
            </button>
          </div>
        </div>

        <div className="p-6 bg-surface border-b border-border flex gap-4">
          <div className="flex-1 bg-surface-muted p-3 rounded-xl flex items-center gap-3 border border-transparent focus-within:border-brand/20 transition-all">
            <Search size={18} className="text-content-muted" />
            <input 
              type="text" 
              placeholder={t('dashboard.search_results')} 
              className="bg-transparent border-none focus:ring-0 text-sm w-full font-bold text-content"
              value={drillSearch}
              onChange={(e) => setDrillSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-right" dir="rtl">
              <thead className="bg-surface-muted text-[10px] font-black text-content-muted uppercase tracking-widest sticky top-0 z-10">
                <tr>
                  {Object.keys(drillDown.data[0] || {}).filter(k => k !== 'id').map((key, headIdx) => (
                    <th 
                      key={`${key}-${headIdx}`} 
                      className="px-6 py-4 cursor-pointer hover:text-brand transition-colors"
                      onClick={() => setDrillSort({ key, dir: drillSort.key === key && drillSort.dir === 'asc' ? 'desc' : 'asc' })}
                    >
                      <div className="flex items-center gap-2">
                        {key}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((row: any, i: number) => (
                  <tr key={row.id || i} className="hover:bg-brand/5 transition-colors">
                    {Object.entries(row).filter(([k]) => k !== 'id').map(([key, val], entryIdx) => (
                      <td key={`${key}-${entryIdx}`} className="px-6 py-4 text-sm font-bold text-content/80">
                        {typeof val === 'number' && (key.toLowerCase().includes('amount') || key.includes(t('common.total')) || key.includes(t('common.total'))) ? formatCurrency(val) : 
                         key === t('common.payment_methods.title', 'الطريقة') ? (
                           val === 'cash' ? t('common.payment_methods.cash') :
                           val === 'network' ? t('common.payment_methods.network') :
                           val === 'cash_on_delivery' ? t('common.payment_methods.cash_on_delivery') :
                           val === 'partial' ? t('common.payment_methods.partial') : String(val)
                         ) : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default function Dashboard({ tenantId }: DashboardProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    customers: 0,
    orders: 0,
    pending: 0,
    revenue: 0,
    lowStock: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allInventory, setAllInventory] = useState<InventoryItem[]>([]);
  const [branchInventory, setBranchInventory] = useState<BranchInventory[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [drillDown, setDrillDown] = useState<{ type: string, title: string, data: any[] } | null>(null);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillSort, setDrillSort] = useState<{ key: string, dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [revenueRange, setRevenueRange] = useState(7);
  const [growthRate, setGrowthRate] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const { currentStaff } = useStaff();
  const { hasPermission } = usePermissions(currentStaff);

  const canViewRevenue = hasPermission('dashboard.revenue');
  const canViewOrders = hasPermission('dashboard.orders');
  const canViewInventory = hasPermission('dashboard.inventory');
  const canViewCustomers = hasPermission('dashboard.customers');

  const navigate = useNavigate();

  useEffect(() => {
    if (!tenantId) return;

    const fetchTenant = async () => {
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTenant({ id: docSnap.id, ...docSnap.data() } as Tenant);
        }

        // Fetch branches
        const qBranches = query(collection(db, 'branches'), where('tenantId', '==', tenantId));
        const branchesSnap = await getDocs(qBranches);
        setBranches(branchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error fetching tenant/branches:', error);
      }
    };
    fetchTenant();

    const fetchStats = async () => {
      if (!tenantId) return;
      try {
        const qCust = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
        const qOrd = query(collection(db, 'orders'), where('tenantId', '==', tenantId));
        const qInv = query(collection(db, 'inventory'), where('tenantId', '==', tenantId));
        const qBranchInv = query(
          collection(db, 'branch_inventory'), 
          where('tenantId', '==', tenantId),
          selectedBranchId !== 'all' ? where('branchId', '==', selectedBranchId) : where('branchId', '!=', '')
        );
        
        const [customersSnap, ordersSnap, inventorySnap, branchInvSnap] = await Promise.all([
          getDocs(qCust),
          getDocs(qOrd),
          getDocs(qInv),
          getDocs(qBranchInv)
        ]);
        
        let orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        if (selectedBranchId !== 'all') {
          orders = orders.filter(o => o.branchId === selectedBranchId);
        }
        const inventory = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
        const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        const bInv = branchInvSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BranchInventory));

        setAllOrders(orders);
        setAllInventory(inventory);
        setAllCustomers(customers);
        setBranchInventory(bInv);
        
        const revenue = orders.reduce((acc, order) => acc + (order.paidAmount || 0), 0);
        const receivables = orders.reduce((acc, order) => acc + (order.remainingAmount || 0), 0);
        const pending = orders.filter(order => !['delivered', 'ready'].includes(order.status)).length;
        
        // Calculate low stock based on branch inventory
        const lowStock = inventory.filter(item => {
          const itemBranchInv = bInv.filter(bi => bi.itemId === item.id);
          const totalQty = itemBranchInv.reduce((sum, bi) => sum + bi.quantity, 0);
          return totalQty <= item.minThreshold;
        }).length;

        setStats({
          customers: customersSnap.size,
          orders: ordersSnap.size,
          pending,
          revenue,
          lowStock,
          receivables
        });

        // Calculate Growth Rate (Current Month vs Last Month)
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        const currentMonthRevenue = orders
          .filter(o => {
            const d = new Date(o.orderDate);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          })
          .reduce((acc, o) => acc + (o.paidAmount || 0), 0);

        const lastMonthRevenue = orders
          .filter(o => {
            const d = new Date(o.orderDate);
            return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
          })
          .reduce((acc, o) => acc + (o.paidAmount || 0), 0);

        if (lastMonthRevenue > 0) {
          const rate = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
          setGrowthRate(Number(rate.toFixed(1)));
        } else {
          setGrowthRate(currentMonthRevenue > 0 ? 100 : 0);
        }

        // Prepare chart data based on revenueRange
        const days = Array.from({ length: revenueRange }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
        }).reverse();

        const dailyRevenue = days.map(date => {
          const dayOrders = orders.filter(o => o.orderDate.startsWith(date));
          const dayRev = dayOrders.reduce((acc, o) => acc + (o.paidAmount || 0), 0);
          return {
            date: revenueRange > 7 
              ? new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
              : new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
            revenue: dayRev
          };
        });
        setChartData(dailyRevenue);

        // Status Distribution for Bar Chart
        const statusCounts = orders.reduce((acc: any, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {});

        const dist = [
          { id: 'pending', name: 'معلق', value: statusCounts['pending'] || 0, color: '#94a3b8' },
          { id: 'measurements_taken', name: 'قياسات', value: statusCounts['measurements_taken'] || 0, color: '#6366f1' },
          { id: 'cutting', name: 'قص', value: statusCounts['cutting'] || 0, color: '#f59e0b' },
          { id: 'sewing', name: 'خياطة', value: statusCounts['sewing'] || 0, color: '#ec4899' },
          { id: 'embroidery', name: 'تطريز', value: statusCounts['embroidery'] || 0, color: '#8b5cf6' },
          { id: 'ironing_packaging', name: 'تجهيز', value: statusCounts['ironing_packaging'] || 0, color: '#06b6d4' },
          { id: 'ready', name: 'جاهز', value: statusCounts['ready'] || 0, color: '#10b981' },
        ];
        setStatusDistribution(dist);

      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'dashboard_stats');
      }
    };

    // Real-time listeners
    let unsubOrders: (() => void) | undefined;
    let unsubNotif: (() => void) | undefined;

    if (tenantId) {
      if (hasPermission('orders.view') || hasPermission('dashboard.orders')) {
        const qOrders = query(
          collection(db, 'orders'), 
          where('tenantId', '==', tenantId),
          orderBy('orderDate', 'desc'), 
          limit(5)
        );
        unsubOrders = onSnapshot(qOrders, (snapshot) => {
          setRecentOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'recent_orders');
        });
      }

      const qNotif = query(
        collection(db, 'notifications'),
        where('tenantId', '==', tenantId),
        where('status', '==', 'unread'),
        orderBy('createdAt', 'desc'),
        limit(3)
      );
      unsubNotif = onSnapshot(qNotif, (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      });

      if (hasPermission('dashboard.view')) {
        fetchStats();
      }
    }

    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubNotif) unsubNotif();
    };
  }, [tenantId, revenueRange, currentStaff?.branchId, selectedBranchId]);

  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const exportToExcel = (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const deleteTestData = async () => {
    try {
      const collections = ['customers', 'orders', 'inventory', 'suppliers', 'staff'];
      for (const colName of collections) {
        const q = query(collection(db, colName), where('tenantId', '==', tenantId), where('isTest', '==', true));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(doc(db, colName, d.id)));
        await batch.commit();
      }
      setToast({ message: 'تم حذف البيانات التجريبية بنجاح', type: 'success' });
      setShowDeleteConfirm(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      setToast({ message: 'حدث خطأ أثناء حذف البيانات', type: 'error' });
      handleFirestoreError(error, OperationType.DELETE, 'test_data');
    }
  };

  const statCards = [
    { 
      label: t('dashboard.total_customers'), 
      value: stats.customers, 
      icon: Users, 
      color: 'bg-brand', 
      trend: '+5%',
      visible: canViewCustomers,
      onClick: () => setDrillDown({ 
        type: 'customers', 
        title: t('dashboard.total_customers'), 
        data: allCustomers.map(c => ({ id: c.id, [t('common.name')]: c.name, [t('common.phone')]: c.phone, [t('common.date')]: new Date(c.createdAt).toLocaleDateString('en-US') }))
      })
    },
    { 
      label: t('dashboard.total_revenue'), 
      value: formatCurrency(stats.revenue), 
      icon: DollarSign, 
      color: 'bg-emerald-500', 
      trend: '+12%',
      visible: canViewRevenue,
      onClick: () => setDrillDown({ 
        type: 'revenue', 
        title: t('dashboard.total_revenue'), 
        data: allOrders.map(o => ({ id: o.id, [t('common.customers')]: o.customerName, [t('common.amount')]: o.paidAmount, [t('common.date')]: new Date(o.orderDate).toLocaleDateString('en-US'), [t('common.status')]: o.status, [t('common.method')]: o.paymentMethod }))
      })
    },
    { 
      label: t('dashboard.receivables'), 
      value: formatCurrency((stats as any).receivables || 0), 
      icon: AlertTriangle, 
      color: 'bg-rose-500', 
      trend: 'تحصيل',
      visible: canViewRevenue,
      onClick: () => setDrillDown({ 
        type: 'receivables', 
        title: t('dashboard.receivables'), 
        data: allOrders.filter(o => (o.remainingAmount || 0) > 0).map(o => ({ id: o.id, [t('common.customers')]: o.customerName, [t('common.remaining')]: o.remainingAmount, [t('common.total')]: o.totalAmount, [t('common.date')]: new Date(o.orderDate).toLocaleDateString('en-US') }))
      })
    },
    { 
      label: t('dashboard.active_orders'), 
      value: stats.pending, 
      icon: Clock, 
      color: 'bg-amber-500', 
      trend: '-2',
      visible: canViewOrders,
      onClick: () => setDrillDown({ 
        type: 'pending_orders', 
        title: t('dashboard.active_orders'), 
        data: allOrders.filter(o => !['delivered', 'ready'].includes(o.status)).map(o => ({ id: o.id, [t('common.customers')]: o.customerName, [t('common.status')]: o.status, [t('common.date')]: new Date(o.orderDate).toLocaleDateString('en-US') }))
      })
    },
    { 
      label: t('dashboard.inventory_alerts'), 
      value: stats.lowStock, 
      icon: AlertTriangle, 
      color: stats.lowStock > 0 ? 'bg-red-500' : 'bg-surface-muted', 
      trend: stats.lowStock > 0 ? 'هام' : 'مستقر',
      visible: canViewInventory,
      onClick: () => setDrillDown({ 
        type: 'low_stock', 
        title: t('dashboard.inventory_alerts'), 
        data: allInventory.flatMap(i => {
          const itemBranchInv = branchInventory.filter(bi => bi.itemId === i.id);
          return itemBranchInv
            .filter(bi => bi.quantity <= i.minThreshold)
            .map(bi => ({
              id: `${bi.branchId}_${i.id}`,
              [t('common.item')]: i.name,
              [t('common.branch')]: branches.find(b => b.id === bi.branchId)?.name || 'المستودع',
              [t('common.quantity')]: bi.quantity,
              [t('common.min_threshold')]: i.minThreshold,
              [t('common.unit')]: i.unit
            }));
        })
      })
    },
  ];

  const visibleStatCards = statCards.filter(card => card.visible);

  return (
    <div className="space-y-8 text-right" dir="rtl">
      <Header 
        tenantId={tenantId} 
        title={t('dashboard.title')} 
        subtitle={t('dashboard.subtitle', { name: tenant?.name || t('common.tailor_system', 'نظام الخياط') })}
      >
        <div className="flex items-center gap-3">
          {/* Branch Filter */}
          <div className="bg-surface p-2 rounded-2xl border border-border shadow-sm flex items-center gap-2">
            <Store size={18} className="text-content-muted mr-2" />
            <select 
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-transparent border-none text-xs font-black focus:ring-0 cursor-pointer text-content appearance-none pr-8"
            >
              <option value="all" className="bg-surface text-content">جميع الفروع</option>
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-surface text-content">{b.name}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 bg-red-500/10 text-red-600 px-4 py-2 rounded-2xl font-bold text-xs hover:bg-red-500/20 transition-all border border-red-500/20"
          >
            <AlertTriangle size={16} />
            {t('dashboard.delete_test_data')}
          </button>
          <div className="bg-surface p-3 rounded-2xl border border-border flex items-center gap-3 shadow-sm">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-content-muted uppercase">{t('dashboard.growth_rate')}</p>
              <p className={cn(
                "text-sm font-black",
                growthRate >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {growthRate >= 0 ? '+' : ''}{growthRate}%
              </p>
            </div>
          </div>
          <div className="relative">
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-3 bg-surface rounded-2xl border border-border shadow-sm hover:bg-surface-muted transition-colors"
            >
              <Bell size={24} className="text-content-muted" />
              {notifications.length > 0 && (
                <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 border-2 border-surface rounded-full" />
              )}
            </button>
            
            <AnimatePresence>
              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute left-0 mt-2 w-80 bg-surface rounded-3xl shadow-2xl border border-border z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-border flex justify-between items-center bg-surface-muted/50">
                      <h4 className="text-sm font-black text-content">{t('dashboard.notifications')}</h4>
                      <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                        {notifications.length} {t('dashboard.new_notifications')}
                      </span>
                    </div>
                    <div className="max-h-96 overflow-y-auto p-2 space-y-1">
                      {notifications.length > 0 ? (
                        notifications.map(notif => (
                          <div key={notif.id} className="p-3 hover:bg-surface-muted rounded-2xl transition-colors cursor-pointer group">
                            <div className="flex gap-3">
                              <div className={cn(
                                "p-2 rounded-xl h-fit",
                                notif.type === 'low_stock' ? "bg-red-500/10 text-red-600" : "bg-brand/10 text-brand"
                              )}>
                                {notif.type === 'low_stock' ? <AlertTriangle size={16} /> : <Bell size={16} />}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-black text-content group-hover:text-brand transition-colors">{notif.title}</p>
                                <p className="text-[10px] text-content-muted mt-0.5 leading-relaxed">{notif.message}</p>
                                <p className="text-[9px] text-content-muted mt-1 font-bold">
                                  {new Date(notif.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center">
                          <CheckCircle2 size={32} className="text-content-muted/30 mx-auto mb-2" />
                          <p className="text-xs text-content-muted font-bold">{t('dashboard.no_notifications')}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Header>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setShowDeleteConfirm(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface w-full max-w-md rounded-[2rem] shadow-2xl relative z-10 p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-2xl font-black text-content mb-2">{t('dashboard.delete_test_data')}</h3>
              <p className="text-content-muted font-bold mb-8 leading-relaxed">
                {t('dashboard.delete_test_data_desc')}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={deleteTestData}
                  className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
                >
                  {t('dashboard.yes_delete')}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-surface-muted text-content-muted py-4 rounded-2xl font-black hover:bg-surface-muted/80 transition-all border border-border"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[120] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border min-w-[300px]",
              toast.type === 'success' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span className="font-black text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {visibleStatCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={stat.onClick}
            className="bg-surface p-6 rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn(stat.color, "p-4 rounded-2xl text-white shadow-lg shadow-current/20 group-hover:scale-110 transition-transform")}>
                <stat.icon size={24} />
              </div>
              <span className={cn(
                "text-xs font-black px-2 py-1 rounded-lg",
                stat.trend.startsWith('+') ? "bg-emerald-500/10 text-emerald-500" : 
                stat.trend === 'هام' ? "bg-red-500/10 text-red-500" : "bg-surface-muted text-content-muted"
              )}>
                {stat.trend}
              </span>
            </div>
            <p className="text-content-muted text-xs font-black uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-3xl font-black text-content mt-1">
              {typeof stat.value === 'number' ? stat.value.toLocaleString('en-US') : stat.value}
            </h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        {canViewRevenue && (
          <div className="lg:col-span-2 bg-surface rounded-[2.5rem] border border-border shadow-sm p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-content">{t('dashboard.revenue_analysis')}</h3>
                <p className="text-sm text-content-muted font-medium">{t('dashboard.revenue_analysis_desc', 'مقارنة الدخل خلال الفترة المختارة')}</p>
              </div>
              <select 
                value={revenueRange}
                onChange={(e) => setRevenueRange(Number(e.target.value))}
                className="bg-surface-muted border-none rounded-xl text-xs font-bold p-2 focus:ring-2 focus:ring-brand cursor-pointer text-content"
              >
                <option value={7}>{t('dashboard.last_7_days')}</option>
                <option value={30}>{t('dashboard.last_30_days')}</option>
              </select>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--content-muted)', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--content-muted)', fontSize: 12, fontWeight: 600 }}
                    tickFormatter={(value) => `${value}`}
                    dx={-10}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-surface p-4 rounded-2xl shadow-2xl border border-border animate-in fade-in zoom-in duration-200">
                            <p className="text-[10px] font-black text-content-muted uppercase mb-1">{label}</p>
                            <p className="text-lg font-black text-brand">
                              {formatCurrency(payload[0].value as number)}
                            </p>
                            <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="text-[9px] font-bold text-content-muted">نشاط مباشر</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="var(--brand)" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)"
                    activeDot={{ r: 8, strokeWidth: 0, fill: 'var(--brand)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Status Breakdown */}
        {canViewOrders && (
          <div className={cn("bg-surface rounded-[2.5rem] border border-border shadow-sm p-8", !canViewRevenue && "lg:col-span-3")}>
            <h3 className="text-xl font-black text-content mb-2">{t('dashboard.status_distribution')}</h3>
            <p className="text-sm text-content-muted font-medium mb-8">{t('dashboard.status_distribution_desc', 'مراحل العمل الحالية في المشغل')}</p>
            
            <div className="space-y-6">
              {statusDistribution.map((status, idx) => {
                const maxVal = Math.max(...statusDistribution.map(s => s.value)) || 1;
                const percentage = (status.value / maxVal) * 100;
                const config = STATUS_CONFIG[status.id as keyof typeof STATUS_CONFIG];
                const Icon = config?.icon || Clock;
                
                return (
                  <motion.div 
                    key={status.id} 
                    whileHover={{ x: -5 }}
                    className="group cursor-pointer" 
                    onClick={() => setDrillDown({ 
                      type: status.id, 
                      title: `${t('common.orders')}: ${status.name}`,
                      data: allOrders.filter(o => o.status === status.id).map(o => ({
                        id: o.id,
                        [t('common.customers')]: o.customerName,
                        [t('common.amount')]: o.totalAmount,
                        [t('common.date')]: new Date(o.orderDate).toLocaleDateString('en-US'),
                        [t('common.status')]: o.status
                      }))
                    })}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl transition-all group-hover:scale-110" style={{ backgroundColor: `${status.color}15`, color: status.color }}>
                          <Icon size={18} />
                        </div>
                        <span className="text-sm font-black text-content/80 group-hover:text-brand transition-colors">{status.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-content">{status.value.toLocaleString('en-US')}</span>
                        <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">{t('common.order')}</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-surface-muted rounded-full overflow-hidden shadow-inner relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
                        className="h-full rounded-full shadow-sm relative z-10"
                        style={{ backgroundColor: status.color }}
                      />
                      <div className="absolute inset-0 bg-content/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-8 pt-8 border-t border-border grid grid-cols-2 gap-4">
              <div className="bg-brand/5 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-brand/60 uppercase">{t('dashboard.in_progress', 'قيد التنفيذ')}</p>
                <p className="text-xl font-black text-brand">{stats.pending.toLocaleString('en-US')}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-400 uppercase">{t('dashboard.ready', 'جاهز')}</p>
                <p className="text-xl font-black text-emerald-700">{allOrders.filter(o => o.status === 'ready').length.toLocaleString('en-US')}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Orders Table */}
        {canViewOrders && (
          <div className="lg:col-span-2 bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
            <div className="p-8 border-b border-border flex justify-between items-center">
              <h3 className="text-xl font-black text-content">{t('dashboard.recent_orders')}</h3>
              <button 
                onClick={() => setDrillDown({ 
                  type: 'all_orders', 
                  title: t('dashboard.all_orders', 'جميع الطلبات'), 
                  data: allOrders.map(o => ({ id: o.id, [t('common.customers')]: o.customerName, [t('common.amount')]: o.totalAmount, [t('common.date')]: new Date(o.orderDate).toLocaleDateString('en-US'), [t('common.status')]: o.status }))
                })}
                className="text-brand text-sm font-bold hover:underline"
              >
                {t('dashboard.view_all')}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-surface-muted/50 text-content-muted text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-8 py-4">العميل</th>
                    <th className="px-8 py-4">الحالة</th>
                    <th className="px-8 py-4">المبلغ</th>
                    <th className="px-8 py-4">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr 
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        className={cn(
                          "hover:bg-brand/5 transition-all duration-200 group cursor-pointer",
                          expandedOrder === order.id && "bg-brand/5"
                        )}
                      >
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-transform group-hover:scale-110",
                              order.status === 'delivered' ? "bg-emerald-50 text-emerald-600" : "bg-brand/10 text-brand"
                            )}>
                              {order.customerName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-content group-hover:text-brand transition-colors">{order.customerName}</p>
                              <p className="text-[10px] text-content-muted font-bold">#{order.id.slice(-6).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={cn(
                            "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider",
                            order.status === 'delivered' ? "bg-emerald-100 text-emerald-700" :
                            order.status === 'ready' ? "bg-brand/10 text-brand" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {order.status === 'delivered' ? 'تم التسليم' :
                             order.status === 'ready' ? 'جاهز' : 'قيد التنفيذ'}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-sm font-black text-content">{formatCurrency(order.totalAmount)}</p>
                          <p className="text-[10px] text-emerald-600 font-bold">مدفوع: {formatCurrency(order.paidAmount)}</p>
                        </td>
                        <td className="px-8 py-5 text-sm text-content-muted font-bold">
                          <div className="flex items-center justify-between">
                            {new Date(order.orderDate).toLocaleDateString('en-US')}
                            <motion.div
                              animate={{ rotate: expandedOrder === order.id ? 180 : 0 }}
                              className="text-content-muted/30 group-hover:text-brand"
                            >
                              <ArrowUpDown size={14} />
                            </motion.div>
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedOrder === order.id && (
                          <tr>
                            <td colSpan={4} className="px-8 py-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="py-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-border">
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-content-muted uppercase">الأصناف</p>
                                    <div className="space-y-1">
                                      {order.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs font-bold text-content/70 bg-surface-muted p-2 rounded-lg">
                                          <span>{item.garmentType} ({item.fabric})</span>
                                          <span>x{item.quantity}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-content-muted uppercase">مواعيد</p>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-xs font-bold">
                                        <Clock size={14} className="text-brand/60" />
                                        <span className="text-content-muted">تاريخ الاستلام:</span>
                                        <span className="text-content/80">{new Date(order.deliveryDate).toLocaleDateString('en-US')}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs font-bold">
                                        <DollarSign size={14} className="text-emerald-400" />
                                        <span className="text-content-muted">طريقة الدفع:</span>
                                        <span className="text-content/80">
                                          {order.paymentMethod === 'cash' ? 'نقدي' :
                                           order.paymentMethod === 'network' ? 'شبكة' :
                                           order.paymentMethod === 'cash_on_delivery' ? 'عند الاستلام' : 'جزئي'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col justify-end">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/orders?id=${order.id}`);
                                      }}
                                      className="w-full bg-brand text-white py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-brand/90 shadow-lg shadow-brand/10 transition-all"
                                    >
                                      <ExternalLink size={14} />
                                      عرض كامل التفاصيل
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Notifications / Low Stock */}
        <div className="space-y-6">
          <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-content">التنبيهات</h3>
              <span className="bg-rose-100 text-rose-600 text-[10px] font-black px-2 py-1 rounded-lg">نشط</span>
            </div>
            <div className="space-y-4">
              {notifications.length > 0 ? (
                notifications.map((notif) => (
                  <div key={notif.id} className="flex gap-4 p-4 bg-surface-muted rounded-2xl border border-border">
                    <div className={cn(
                      "p-2 rounded-xl h-fit",
                      notif.type === 'low_stock' ? "bg-rose-100 text-rose-600" : "bg-brand/10 text-brand"
                    )}>
                      {notif.type === 'low_stock' ? <AlertTriangle size={18} /> : <Bell size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-content">{notif.title}</p>
                      <p className="text-xs text-content-muted mt-1 leading-relaxed">{notif.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="bg-surface-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-content-muted/30" />
                  </div>
                  <p className="text-sm font-bold text-content-muted">لا توجد تنبيهات جديدة</p>
                </div>
              )}
            </div>
          </div>

          {canViewInventory && (
            <div className="bg-brand rounded-[2.5rem] p-8 text-white shadow-xl shadow-brand/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <Package size={120} />
              </div>
              <div className="relative z-10">
                <h4 className="text-lg font-black mb-2">المخزون</h4>
                <p className="text-white/80 text-sm font-medium mb-6">هناك {stats.lowStock} مواد تحتاج لإعادة طلب</p>
                <button 
                  onClick={() => navigate('/inventory?filter=low_stock')}
                  className="bg-surface text-brand px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-black/10 hover:bg-surface-muted transition-colors"
                >
                  إدارة المخزون
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Branding className="mt-12 opacity-50" />

      <AnimatePresence>
        {drillDown && (
          <DrillDownModal 
            drillDown={drillDown}
            drillSearch={drillSearch}
            setDrillSearch={setDrillSearch}
            drillSort={drillSort}
            setDrillSort={setDrillSort}
            setDrillDown={setDrillDown}
            exportToExcel={exportToExcel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
