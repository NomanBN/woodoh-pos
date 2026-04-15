import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order, Customer, InventoryItem, Staff, OrderStatus } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { 
  Download, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  DollarSign,
  Filter,
  Search,
  ArrowUpDown,
  FileSpreadsheet,
  FileText,
  ChevronRight,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  X
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import Header from './Header';
import Branding from './Branding';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

import { useStaff } from '../contexts/StaffContext';
import { usePermissions } from '../hooks/usePermissions';

const COLORS = ['#1C8FFF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

type ReportTab = 'general' | 'financial' | 'orders' | 'inventory' | 'staff';

interface DrillDownData {
  title: string;
  data: any[];
  columns: { key: string; label: string; type?: 'currency' | 'date' | 'status' }[];
}

export default function Reports({ tenantId }: { tenantId: string }) {
  const { currentStaff } = useStaff();
  const { hasPermission, loading: permsLoading } = usePermissions(currentStaff);
  
  const canViewReports = hasPermission('reports.view');
  const canExportReports = hasPermission('reports.export');

  const [activeTab, setActiveTab] = useState<ReportTab>('general');
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedStaff, setSelectedStaff] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Drill-down
  const [drillDown, setDrillDown] = useState<DrillDownData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const [ordersSnap, customersSnap, inventorySnap, staffSnap] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('tenantId', '==', tenantId), orderBy('orderDate', 'desc'))),
          getDocs(query(collection(db, 'customers'), where('tenantId', '==', tenantId))),
          getDocs(query(collection(db, 'inventory'), where('tenantId', '==', tenantId))),
          getDocs(query(collection(db, 'staff'), where('tenantId', '==', tenantId)))
        ]);
        
        setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
        setCustomers(customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
        setInventory(inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
        setStaff(staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
      } catch (error) {
        console.error('Error fetching report data:', error);
        handleFirestoreError(error, OperationType.LIST, 'reports');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  // Filtered Data
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const dateMatch = (!dateRange.start || order.orderDate >= dateRange.start) && 
                        (!dateRange.end || order.orderDate <= dateRange.end);
      const staffMatch = selectedStaff === 'all' || order.createdBy === selectedStaff;
      const paymentMatch = paymentStatus === 'all' || 
                          (paymentStatus === 'paid' && order.remainingAmount === 0) ||
                          (paymentStatus === 'partial' && order.remainingAmount > 0 && order.paidAmount > 0) ||
                          (paymentStatus === 'unpaid' && order.paidAmount === 0);
      const searchMatch = !searchTerm || 
                         order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      return dateMatch && staffMatch && paymentMatch && searchMatch;
    });
  }, [orders, dateRange, selectedStaff, paymentStatus, searchTerm]);

  // Financial Calculations
  const financialStats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalTax = filteredOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0);
    const netProfit = totalRevenue - totalTax; // Simplified profit calculation

    // Sales by Payment Method
    const paymentMethods = filteredOrders.reduce((acc: any, o) => {
      const method = o.paymentMethod === 'cash' ? 'نقدي' : 
                    o.paymentMethod === 'network' ? 'شبكة' : 
                    o.paymentMethod === 'cash_on_delivery' ? 'عند الاستلام' : 'أخرى';
      acc[method] = (acc[method] || 0) + (o.paidAmount || 0);
      return acc;
    }, {});

    const paymentChartData = Object.entries(paymentMethods).map(([name, value]) => ({ name, value }));

    // Revenue Trend
    const trendData = filteredOrders.reduce((acc: any, o) => {
      const date = o.orderDate.split('T')[0];
      if (!acc[date]) acc[date] = { date, revenue: 0, sales: 0 };
      acc[date].revenue += (o.paidAmount || 0);
      acc[date].sales += (o.totalAmount || 0);
      return acc;
    }, {});

    const trendChartData = Object.values(trendData).sort((a: any, b: any) => a.date.localeCompare(b.date));

    return { totalRevenue, totalSales, totalTax, netProfit, paymentChartData, trendChartData };
  }, [filteredOrders]);

  // Order Stats
  const orderStats = useMemo(() => {
    const statusCounts = filteredOrders.reduce((acc: any, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    const statusChartData = [
      { name: 'قيد الانتظار', value: statusCounts['pending'] || 0, key: 'pending' },
      { name: 'في المشغل', value: (statusCounts['cutting'] || 0) + (statusCounts['sewing'] || 0), key: 'processing' },
      { name: 'جاهز', value: statusCounts['ready'] || 0, key: 'ready' },
      { name: 'تم التسليم', value: statusCounts['delivered'] || 0, key: 'delivered' },
    ];

    // Delayed Orders (Simplified: orders older than 7 days and not delivered)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const delayedOrders = filteredOrders.filter(o => 
      !['delivered', 'cancelled'].includes(o.status) && 
      new Date(o.orderDate) < sevenDaysAgo
    );

    // Average Completion Time
    const completedOrders = filteredOrders.filter(o => o.status === 'delivered');
    let totalDays = 0;
    completedOrders.forEach(o => {
      const start = new Date(o.orderDate);
      const end = new Date(o.history.find(h => h.status === 'delivered')?.updatedAt || o.orderDate);
      totalDays += (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    });
    const avgTime = completedOrders.length > 0 ? (totalDays / completedOrders.length).toFixed(1) : '0';

    return { statusChartData, delayedCount: delayedOrders.length, delayedOrders, avgTime };
  }, [filteredOrders]);

  // Inventory Stats
  const inventoryStats = useMemo(() => {
    const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
    const topItems = [...inventory].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    
    return { lowStockItems, topItems };
  }, [inventory]);

  // Staff Performance
  const staffStats = useMemo(() => {
    const performance = staff.map(s => {
      const staffOrders = filteredOrders.filter(o => o.createdBy === s.id);
      const totalSales = staffOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const completedItems = staffOrders.filter(o => o.status === 'delivered').length;
      
      return {
        name: s.name,
        sales: totalSales,
        completed: completedItems,
        role: s.role
      };
    }).sort((a, b) => b.sales - a.sales);

    return { performance };
  }, [staff, filteredOrders]);

  const exportToExcel = (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  if (loading || permsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-muted">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-right" dir="rtl">
        <div className="p-6 bg-rose-500/10 text-rose-600 rounded-[2.5rem] mb-6">
          <AlertTriangle size={48} />
        </div>
        <h2 className="text-2xl font-black text-content mb-2">عذراً، لا تملك صلاحية الوصول</h2>
        <p className="text-content-muted font-bold">يرجى التواصل مع مدير النظام للحصول على صلاحيات عرض التقارير.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-right pb-20" dir="rtl">
      <Header 
        tenantId={tenantId} 
        title="مركز التقارير الشامل" 
        subtitle="تحليلات دقيقة لأداء متجرك المالي والتشغيلي"
      >
        <div className="flex gap-3">
          <button 
            onClick={() => canExportReports && exportToExcel(filteredOrders, `orders_report_${activeTab}`)}
            disabled={!canExportReports}
            className={cn(
              "flex items-center gap-2 px-6 py-3 bg-surface border border-border rounded-2xl text-content-muted hover:bg-surface-muted font-black text-sm transition-all shadow-sm",
              !canExportReports && "opacity-50 cursor-not-allowed"
            )}
          >
            <FileSpreadsheet size={20} className="text-emerald-600" />
            <span>تصدير Excel</span>
          </button>
          <button 
            onClick={() => canExportReports && window.print()}
            disabled={!canExportReports}
            className={cn(
              "flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-2xl hover:bg-brand/90 font-black text-sm transition-all shadow-lg shadow-brand/10",
              !canExportReports && "opacity-50 cursor-not-allowed"
            )}
          >
            <Download size={20} />
            <span>تصدير PDF</span>
          </button>
        </div>
      </Header>

      {/* Filters Bar */}
      <div className="bg-surface p-6 rounded-[2.5rem] border border-border shadow-sm flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
          <input 
            type="text" 
            placeholder="بحث برقم الطلب أو اسم العميل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-12 pl-4 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-sm text-content"
          />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-muted px-4 py-2 rounded-2xl border border-border">
            <CalendarIcon size={16} className="text-content-muted" />
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="bg-transparent border-none focus:ring-0 text-xs font-bold text-content"
            />
            <span className="text-content-muted/30">إلى</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="bg-transparent border-none focus:ring-0 text-xs font-bold text-content"
            />
          </div>

          <select 
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="bg-surface-muted border-none rounded-2xl text-xs font-bold p-3 focus:ring-2 focus:ring-brand cursor-pointer text-content"
          >
            <option value="all">جميع الموظفين</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select 
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="bg-surface-muted border-none rounded-2xl text-xs font-bold p-3 focus:ring-2 focus:ring-brand cursor-pointer text-content"
          >
            <option value="all">جميع حالات الدفع</option>
            <option value="paid">مدفوع بالكامل</option>
            <option value="partial">دفع جزئي</option>
            <option value="unpaid">غير مدفوع</option>
          </select>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 bg-surface p-2 rounded-[2rem] border border-border shadow-sm w-fit">
        {[
          { id: 'general', label: 'اللوحة العامة', icon: TrendingUp },
          { id: 'financial', label: 'التقارير المالية', icon: DollarSign },
          { id: 'orders', label: 'تقارير الطلبات', icon: ShoppingBag },
          { id: 'inventory', label: 'تقارير المخزون', icon: Package },
          { id: 'staff', label: 'الموظفين والعملاء', icon: Users },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ReportTab)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all",
              activeTab === tab.id 
                ? "bg-brand text-white shadow-lg shadow-brand/10" 
                : "text-content-muted hover:bg-surface-muted"
            )}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'إجمالي الإيرادات', value: financialStats.totalRevenue, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
                { label: 'إجمالي المبيعات', value: financialStats.totalSales, icon: TrendingUp, color: 'text-brand', bg: 'bg-brand/10' },
                { label: 'عدد الطلبات', value: filteredOrders.length, icon: ShoppingBag, color: 'text-amber-600', bg: 'bg-amber-500/10' },
                { label: 'الطلبات المتأخرة', value: orderStats.delayedCount, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-500/10' },
              ].map((stat, i) => (
                <div key={i} className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm flex items-center gap-6">
                  <div className={cn("p-5 rounded-2xl", stat.bg, stat.color)}>
                    <stat.icon size={28} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-content-muted uppercase tracking-widest">{stat.label}</p>
                    <h3 className="text-2xl font-black text-content mt-1">
                      {typeof stat.value === 'number' && stat.label.includes('إيرادات') || stat.label.includes('مبيعات') 
                        ? formatCurrency(stat.value) 
                        : stat.value.toLocaleString()}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Revenue vs Sales Trend */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-lg font-black text-content">مقارنة الإيرادات والمبيعات</h3>
                  <div className="flex gap-4 text-xs font-bold">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-brand rounded-full" /><span>المبيعات</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full" /><span>الإيرادات</span></div>
                  </div>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={financialStats.trendChartData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1C8FFF" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#1C8FFF" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22C55E" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, backgroundColor: 'var(--color-surface)', color: 'var(--color-content)' }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Area type="monotone" dataKey="sales" stroke="#1C8FFF" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                      <Area type="monotone" dataKey="revenue" stroke="#22C55E" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-lg font-black text-content mb-8">توزيع المبيعات حسب طرق الدفع</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={financialStats.paymentChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {financialStats.paymentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, backgroundColor: 'var(--color-surface)', color: 'var(--color-content)' }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tax & Profit Cards */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                  <p className="text-xs font-black text-content-muted uppercase tracking-widest">إجمالي الضريبة</p>
                  <h3 className="text-2xl font-black text-rose-600 mt-2">{formatCurrency(financialStats.totalTax)}</h3>
                  <p className="text-[10px] text-content-muted mt-1 font-bold">ضريبة القيمة المضافة (15%)</p>
                </div>
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                  <p className="text-xs font-black text-content-muted uppercase tracking-widest">صافي الأرباح</p>
                  <h3 className="text-2xl font-black text-emerald-600 mt-2">{formatCurrency(financialStats.netProfit)}</h3>
                  <p className="text-[10px] text-content-muted mt-1 font-bold">بعد خصم الضرائب</p>
                </div>
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                  <p className="text-xs font-black text-content-muted uppercase tracking-widest">متوسط قيمة الطلب</p>
                  <h3 className="text-2xl font-black text-brand mt-2">
                    {formatCurrency(filteredOrders.length > 0 ? financialStats.totalSales / filteredOrders.length : 0)}
                  </h3>
                  <p className="text-[10px] text-content-muted mt-1 font-bold">بناءً على {filteredOrders.length} طلب</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Order Status Bar Chart */}
              <div className="lg:col-span-2 bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-lg font-black text-content mb-8">حالات الطلبات الحالية</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={orderStats.statusChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <Tooltip 
                        cursor={{ fill: 'var(--color-surface-muted)' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, backgroundColor: 'var(--color-surface)', color: 'var(--color-content)' }}
                      />
                      <Bar 
                        dataKey="value" 
                        fill="#1C8FFF" 
                        radius={[10, 10, 0, 0]} 
                        onClick={(data) => setDrillDown({
                          title: `تفاصيل طلبات: ${data.name}`,
                          data: filteredOrders.filter(o => {
                            if (data.key === 'processing') return ['cutting', 'sewing'].includes(o.status);
                            return o.status === data.key;
                          }),
                          columns: [
                            { key: 'id', label: 'رقم الطلب' },
                            { key: 'customerName', label: 'العميل' },
                            { key: 'totalAmount', label: 'المبلغ', type: 'currency' },
                            { key: 'orderDate', label: 'التاريخ', type: 'date' },
                            { key: 'status', label: 'الحالة', type: 'status' }
                          ]
                        })}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* KPIs */}
              <div className="space-y-6">
                <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl"><Clock size={24} /></div>
                    <h4 className="font-black text-content">متوسط وقت الإنجاز</h4>
                  </div>
                  <h3 className="text-3xl font-black text-content">{orderStats.avgTime} يوم</h3>
                  <p className="text-xs text-content-muted font-bold mt-2">من استلام الطلب حتى التسليم</p>
                </div>

                <div 
                  className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm cursor-pointer hover:border-rose-500/30 transition-all"
                  onClick={() => setDrillDown({
                    title: 'الطلبات المتأخرة عن موعد التسليم',
                    data: orderStats.delayedOrders,
                    columns: [
                      { key: 'id', label: 'رقم الطلب' },
                      { key: 'customerName', label: 'العميل' },
                      { key: 'orderDate', label: 'تاريخ الطلب', type: 'date' },
                      { key: 'status', label: 'الحالة الحالية', type: 'status' }
                    ]
                  })}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-rose-500/10 text-rose-600 rounded-xl"><AlertTriangle size={24} /></div>
                    <h4 className="font-black text-content">الطلبات المتأخرة</h4>
                  </div>
                  <h3 className="text-3xl font-black text-rose-600">{orderStats.delayedCount}</h3>
                  <p className="text-xs text-content-muted font-bold mt-2">تجاوزت 7 أيام عمل</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Low Stock Alerts */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-black text-content flex items-center gap-2">
                    <AlertTriangle className="text-rose-500" size={20} />
                    تنبيهات المخزون المنخفض
                  </h3>
                  <span className="px-3 py-1 bg-rose-500/10 text-rose-600 rounded-full text-xs font-black">
                    {inventoryStats.lowStockItems.length} أصناف
                  </span>
                </div>
                <div className="space-y-4">
                  {inventoryStats.lowStockItems.length > 0 ? (
                    inventoryStats.lowStockItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-surface-muted rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center text-rose-500 shadow-sm">
                            <Package size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-content">{item.name}</p>
                            <p className="text-[10px] text-content-muted font-bold">الحد الأدنى: {item.minThreshold} {item.unit}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-rose-600">{item.quantity} {item.unit}</p>
                          <p className="text-[10px] text-content-muted font-bold">الكمية الحالية</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <CheckCircle2 size={48} className="text-emerald-500/20 mx-auto mb-4" />
                      <p className="text-content-muted font-bold">المخزون في حالة ممتازة</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Consumed Items */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-lg font-black text-content mb-8">الأصناف الأكثر توفراً</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={inventoryStats.topItems} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" width={80} />
                      <Tooltip 
                        cursor={{ fill: 'var(--color-surface-muted)' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, backgroundColor: 'var(--color-surface)', color: 'var(--color-content)' }}
                      />
                      <Bar dataKey="quantity" fill="#1C8FFF" radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Staff Productivity */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-lg font-black text-content mb-8">إنتاجية الموظفين (الطلبات المكتملة)</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={staffStats.performance}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: 'currentColor' }} className="text-content-muted" />
                      <Tooltip 
                        cursor={{ fill: 'var(--color-surface-muted)' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, backgroundColor: 'var(--color-surface)', color: 'var(--color-content)' }}
                      />
                      <Bar dataKey="completed" fill="#22C55E" radius={[10, 10, 0, 0]} name="الطلبات المسلمة" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Staff Sales */}
              <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-lg font-black text-content mb-8">إجمالي مبيعات الكاشير</h3>
                <div className="space-y-6">
                  {staffStats.performance.filter(s => s.role === 'cashier' || s.role === 'owner' || s.role === 'admin').map((s, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-surface-muted rounded-2xl flex items-center justify-center text-content-muted">
                        <User size={24} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-black text-content">{s.name}</span>
                          <span className="text-sm font-black text-brand">{formatCurrency(s.sales)}</span>
                        </div>
                        <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(s.sales / Math.max(...staffStats.performance.map(x => x.sales), 1)) * 100}%` }}
                            className="h-full bg-brand rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Drill-down Modal */}
      <AnimatePresence>
        {drillDown && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setDrillDown(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] border border-border"
            >
              <div className="p-8 border-b border-border flex justify-between items-center bg-surface-muted/50">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-brand text-white rounded-2xl shadow-lg shadow-brand/10">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-content">{drillDown.title}</h2>
                    <p className="text-xs text-content-muted font-bold uppercase tracking-widest">عرض البيانات التفصيلية</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => exportToExcel(drillDown.data, drillDown.title)}
                    className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 text-sm font-bold text-emerald-600 hover:bg-emerald-500/20 transition-all"
                  >
                    <FileSpreadsheet size={18} />
                    تصدير Excel
                  </button>
                  <button onClick={() => setDrillDown(null)} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
                    <X size={24} className="text-content-muted" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-8">
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <table className="w-full text-right">
                    <thead className="bg-surface-muted text-[10px] font-black text-content-muted uppercase tracking-widest">
                      <tr>
                        {drillDown.columns.map((col, idx) => (
                          <th key={idx} className="px-6 py-4">{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {drillDown.data.map((row, i) => (
                        <tr key={i} className="hover:bg-brand/5 transition-colors">
                          {drillDown.columns.map((col, idx) => (
                            <td key={idx} className="px-6 py-4 text-sm font-bold text-content">
                              {col.type === 'currency' ? formatCurrency(row[col.key]) :
                               col.type === 'date' ? new Date(row[col.key]).toLocaleDateString('ar-SA') :
                               col.type === 'status' ? (
                                 <span className="px-2 py-1 bg-surface-muted rounded-lg text-[10px] text-content-muted">
                                   {row[col.key]}
                                 </span>
                               ) : row[col.key]}
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
        )}
      </AnimatePresence>

      <Branding className="mt-12 opacity-50" />
    </div>
  );
}
