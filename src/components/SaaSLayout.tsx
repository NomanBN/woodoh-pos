import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Search, 
  Bell, 
  User,
  LayoutDashboard,
  Database,
  Zap,
  Globe,
  AlertCircle,
  X,
  ExternalLink
} from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '../lib/utils';
import { logSaaSSecurityEvent } from '../services/saasSecurityService';

interface SaaSLayoutProps {
  children: React.ReactNode;
  userRole: string | null;
}

const SAAS_MENU_ITEMS = [
  { id: 'overview', label: 'لوحة التحكم', icon: LayoutDashboard, path: '/admin/dashboard' },
  { id: 'tenants', label: 'إدارة المشتركين', icon: Users, path: '/admin/tailors' },
  { id: 'reports', label: 'التقارير المالية', icon: BarChart3, path: '/admin/reports' },
  { id: 'audit', label: 'سجل التدقيق', icon: Shield, path: '/admin/audit' },
  { id: 'system', label: 'إعدادات النظام', icon: Settings, path: '/admin/system' },
];

export default function SaaSLayout({ children, userRole }: SaaSLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(null);
  const [impersonatedTenantName, setImpersonatedTenantName] = useState<string | null>(null);

  // 1. Session Timeout Logic (Idle Timeout)
  const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  const [lastActivity, setLastActivity] = useState(Date.now());

  const handleLogout = useCallback(async () => {
    await logSaaSSecurityEvent('saas_logout', 'User logged out or session timed out');
    sessionStorage.removeItem('saas_2fa_verified');
    localStorage.removeItem('impersonatedTenantId');
    await signOut(auth);
    navigate('/saas/login');
  }, [navigate]);

  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        handleLogout();
      }
    }, 60000); // Check every minute

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(interval);
    };
  }, [lastActivity, handleLogout]);

  // 2. 2FA Verification Check
  useEffect(() => {
    const is2FAVerified = sessionStorage.getItem('saas_2fa_verified');
    if (!is2FAVerified && location.pathname !== '/saas/login') {
      navigate('/saas/login');
    }
  }, [navigate, location.pathname]);

  // 3. Impersonation Check
  useEffect(() => {
    const tenantId = localStorage.getItem('impersonatedTenantId');
    if (tenantId) {
      setImpersonatedTenantId(tenantId);
      // Fetch tenant name for the banner
      // Simulation: set a dummy name
      setImpersonatedTenantName('متجر الخياط التجريبي');
    }
  }, []);

  const stopImpersonation = () => {
    localStorage.removeItem('impersonatedTenantId');
    setImpersonatedTenantId(null);
    setImpersonatedTenantName(null);
    window.location.href = '/admin/dashboard';
  };

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case 'super_admin': return 'المدير العام';
      case 'support_tech': return 'فريق الدعم الفني';
      case 'billing_admin': return 'فريق المبيعات والمحاسبة';
      default: return 'موظف SaaS';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans" dir="rtl">
      {/* Impersonation Banner */}
      <AnimatePresence>
        {impersonatedTenantId && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 left-0 right-0 z-[200] bg-amber-600 text-white py-2 px-4 flex items-center justify-center gap-4 shadow-xl"
          >
            <div className="flex items-center gap-2 font-black text-sm">
              <AlertCircle size={18} />
              <span>أنت الآن في وضع الدعم الفني (Impersonation Mode)</span>
            </div>
            <div className="h-4 w-px bg-white/30 mx-2" />
            <span className="text-xs font-bold">المشترك الحالي: {impersonatedTenantName || impersonatedTenantId}</span>
            <button 
              onClick={stopImpersonation}
              className="bg-white text-amber-600 px-4 py-1 rounded-full text-xs font-black hover:bg-amber-50 transition-all ml-4"
            >
              إنهاء الجلسة والعودة للوحة SaaS
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-white border-l border-gray-100 shadow-2xl shadow-gray-200/50 relative z-[100] flex flex-col"
      >
        {/* Sidebar Header */}
        <div className="p-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
            <Shield className="text-white" size={24} />
          </div>
          {isSidebarOpen && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-lg font-black text-gray-900">Wodoh Tech</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">SaaS Management</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {SAAS_MENU_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            const isRestricted = userRole === 'support_tech' && (item.id === 'reports' || item.id === 'system');
            
            if (isRestricted) return null;

            return (
              <Link 
                key={item.id}
                to={item.path}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl transition-all group relative",
                  isActive ? "bg-indigo-600 text-white shadow-xl shadow-indigo-100" : "text-gray-400 hover:bg-gray-50 hover:text-indigo-600"
                )}
              >
                <item.icon size={24} className={cn("shrink-0", isActive ? "text-white" : "group-hover:scale-110 transition-transform")} />
                {isSidebarOpen && <span className="font-bold text-sm">{item.label}</span>}
                {!isSidebarOpen && isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-600 rounded-l-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-50">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 p-4 rounded-2xl text-rose-600 hover:bg-rose-50 transition-all font-bold text-sm"
          >
            <LogOut size={24} className="shrink-0" />
            {isSidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-gray-100 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400"
            >
              <ChevronRight size={24} className={cn("transition-transform", !isSidebarOpen && "rotate-180")} />
            </button>
            <div className="h-8 w-px bg-gray-100 mx-2" />
            <div className="flex flex-col">
              <span className="text-sm font-black text-gray-900">أهلاً، {auth.currentUser?.displayName || 'مهندس الدعم'}</span>
              <span className="text-[10px] font-bold text-indigo-600">{getRoleLabel(userRole)}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="بحث سريع..."
                className="bg-gray-50 border-none rounded-2xl py-2 pr-12 pl-4 text-sm font-bold w-64 focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <button className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 transition-all relative">
              <Bell size={20} />
              <span className="absolute top-3 left-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            </button>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black shadow-sm">
              {auth.currentUser?.displayName?.charAt(0) || 'A'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className={cn("max-w-7xl mx-auto", impersonatedTenantId && "mt-12")}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
