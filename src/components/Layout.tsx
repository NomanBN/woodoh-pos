import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  ShoppingBag, 
  Settings, 
  LogOut,
  Shield,
  Scissors,
  ChevronLeft,
  Home,
  UserCircle,
  Package,
  Briefcase,
  BarChart3,
  Lock,
  Building2,
  ArrowRightLeft,
  Globe,
  Sun,
  Moon,
  LayoutGrid,
  List,
  Monitor
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useLocation } from 'react-router-dom';

import { UserRole, Staff as StaffType, PermissionKey } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import Branding from './Branding';

interface LayoutProps {
  children: React.ReactNode;
  role?: UserRole | null;
  tenantId?: string | null;
  currentStaff?: StaffType | null;
  onLock?: () => void;
}

export default function Layout({ children, role, tenantId, currentStaff, onLock }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [tenantLogo, setTenantLogo] = React.useState<string | null>(null);
  const [tenantName, setTenantName] = React.useState<string>(t('common.tailor_system', 'نظام الخياط'));
  const [isLangOpen, setIsLangOpen] = React.useState(false);
  const [layoutMode, setLayoutMode] = React.useState<'sidebar' | 'grid'>('sidebar');

  React.useEffect(() => {
    const fetchTenant = async () => {
      if (tenantId && tenantId !== 'saas_management') {
        try {
          const docRef = doc(db, 'tenants', tenantId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setTenantLogo(data.logoUrl || null);
            setTenantName(data.name || t('common.tailor_system', 'نظام الخياط'));
            
            // Load layout preference
            const savedMode = localStorage.getItem(`layoutMode_${tenantId}_${currentStaff?.id || role}`);
            if (savedMode) {
              setLayoutMode(savedMode as 'sidebar' | 'grid');
            } else if (data.defaultLayout) {
              setLayoutMode(data.defaultLayout);
            }
          }
        } catch (error) {
          console.error('Error fetching tenant logo:', error);
        }
      }
    };
    fetchTenant();
  }, [tenantId, t, currentStaff?.id, role]);

  const toggleLayoutMode = () => {
    const newMode = layoutMode === 'sidebar' ? 'grid' : 'sidebar';
    setLayoutMode(newMode);
    if (tenantId) {
      localStorage.setItem(`layoutMode_${tenantId}_${currentStaff?.id || role}`, newMode);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const isSuperAdmin = role === 'super_admin';
  const isSupportTech = role === 'support_tech';
  const isBillingAdmin = role === 'billing_admin';
  const isSaaSStaff = isSuperAdmin || isSupportTech || isBillingAdmin;
  const isOwner = role === 'owner';
  const isCashier = role === 'cashier';
  const isTailor = role === 'tailor';

  const effectiveRole = currentStaff?.role || role;

  const { hasPermission } = usePermissions(currentStaff);

  const navItems = [
    // SaaS Level Navigation
    ...(isSaaSStaff ? [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: t('sidebar.saas_dashboard'), roles: ['super_admin', 'support_tech', 'billing_admin'] },
      { to: '/admin/tailors', icon: Users, label: t('sidebar.manage_subscribers'), roles: ['super_admin', 'support_tech'] }
    ] : []),
    
    // Tenant Level Navigation
    ...(!isSaaSStaff ? [
      { to: '/dashboard', icon: Home, label: t('common.dashboard'), permission: 'dashboard.view' },
      { to: '/sales', icon: Monitor, label: 'المبيعات', permission: 'orders.create' },
      { to: '/customers', icon: UserCircle, label: t('common.customers'), permission: 'customers.view' },
      { to: '/orders', icon: ShoppingBag, label: t('common.orders'), permission: 'orders.view' },
      { to: '/inventory', icon: Package, label: t('common.inventory'), permission: 'inventory.view' },
      { to: '/suppliers', icon: Briefcase, label: 'الموردين والمشتريات', permission: 'suppliers.manage' },
      { to: '/reports', icon: BarChart3, label: t('common.reports'), permission: 'reports.view' },
    ] : []),
    
    { to: '/settings', icon: Settings, label: t('common.settings'), permission: 'settings.view' },
  ].filter(item => {
    if (isSaaSStaff) return !item.roles || item.roles.includes(effectiveRole as string);
    if (isOwner) return true;
    if (effectiveRole === 'admin') return true; // Manager (admin) has full access to tenant items
    if (item.roles) return item.roles.includes(effectiveRole as string);
    if (item.permission) return hasPermission(item.permission as PermissionKey);
    return true;
  });

  return (
    <div className="flex h-screen bg-surface-muted font-sans overflow-hidden">
      {/* Sidebar */}
      {layoutMode === 'sidebar' && (
        <aside className={cn(
          "bg-surface border-l border-border flex flex-col transition-all duration-300 relative",
          isCollapsed ? "w-20" : "w-64"
        )}>
        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -left-3 top-10 bg-surface border border-border rounded-full p-1 shadow-sm hover:bg-surface-muted z-20"
        >
          <ChevronLeft size={16} className={cn("transition-transform duration-300", isCollapsed && "rotate-180")} />
        </button>

        <div className={cn(
          "p-6 flex items-center gap-3 border-b border-border overflow-hidden",
          isCollapsed ? "justify-center" : "justify-start"
        )}>
          {tenantLogo ? (
            <img src={tenantLogo} alt="Logo" className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm" />
          ) : (
            <div className="bg-brand p-2 rounded-lg text-white shrink-0">
              <Scissors size={24} />
            </div>
          )}
          {!isCollapsed && <h1 className="text-xl font-bold text-content truncate">{tenantName}</h1>}
        </div>

        {currentStaff && (
          <div className={cn(
            "px-4 py-4 border-b border-border bg-brand/5",
            isCollapsed ? "flex justify-center" : ""
          )}>
            <div className={cn(
              "flex items-center gap-3",
              isCollapsed ? "justify-center" : ""
            )}>
              <div className="w-10 h-10 rounded-xl bg-surface shadow-sm flex items-center justify-center text-brand shrink-0 border border-brand/10">
                <UserCircle size={24} />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-sm font-black text-content truncate">{currentStaff.name}</span>
                  <span className="text-[10px] font-bold text-brand uppercase tracking-widest">
                    {currentStaff.role === 'owner' ? 'مدير' : currentStaff.role === 'cashier' ? 'كاشير' : 'خياط'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                (isActive || (item.to === '/dashboard' && location.pathname === '/'))
                  ? "bg-brand/10 text-brand font-medium" 
                  : "text-content-muted hover:bg-surface-muted hover:text-content",
                isCollapsed && "justify-center px-0"
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={cn("shrink-0", !isActive && "group-hover:scale-110 transition-transform")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  
                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute right-full mr-2 px-2 py-1 bg-brand text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          {/* Layout Toggle */}
          <button
            onClick={toggleLayoutMode}
            className={cn(
              "flex items-center gap-3 px-4 py-3 w-full text-right text-content-muted hover:bg-surface-muted rounded-xl transition-all duration-200 group relative",
              isCollapsed && "justify-center px-0"
            )}
          >
            <LayoutGrid size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
            {!isCollapsed && (
              <span className="truncate flex-1">
                طريقة العرض
              </span>
            )}
            
            {isCollapsed && (
              <div className="absolute right-full mr-2 px-2 py-1 bg-content text-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                طريقة العرض
              </div>
            )}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 w-full text-right text-content-muted hover:bg-surface-muted rounded-xl transition-all duration-200 group relative",
              isCollapsed && "justify-center px-0"
            )}
          >
            {theme === 'dark' ? (
              <Sun size={20} className="shrink-0 text-amber-500 group-hover:scale-110 transition-transform" />
            ) : (
              <Moon size={20} className="shrink-0 text-indigo-600 group-hover:scale-110 transition-transform" />
            )}
            {!isCollapsed && (
              <span className="truncate flex-1">
                {theme === 'dark' ? t('common.light_mode', 'الوضع الفاتح') : t('common.dark_mode', 'الوضع الداكن')}
              </span>
            )}
            
            {isCollapsed && (
              <div className="absolute right-full mr-2 px-2 py-1 bg-content text-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {theme === 'dark' ? t('common.light_mode', 'الوضع الفاتح') : t('common.dark_mode', 'الوضع الداكن')}
              </div>
            )}
          </button>

          {/* Language Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsLangOpen(!isLangOpen)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 w-full text-right text-content-muted hover:bg-surface-muted rounded-xl transition-all duration-200 group relative",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Globe size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
              {!isCollapsed && (
                <span className="truncate flex-1">
                  {i18n.language === 'ar' ? 'العربية' : i18n.language === 'en' ? 'English' : 'اردو'}
                </span>
              )}
              
              {isCollapsed && (
                <div className="absolute right-full mr-2 px-2 py-1 bg-content text-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  {i18n.language === 'ar' ? 'العربية' : i18n.language === 'en' ? 'English' : 'اردو'}
                </div>
              )}
            </button>

            {isLangOpen && (
              <div className={cn(
                "absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden z-50",
                isCollapsed && "w-32 left-full ml-2 right-auto"
              )}>
                {[
                  { code: 'ar', label: 'العربية' },
                  { code: 'en', label: 'English' },
                  { code: 'ur', label: 'اردو' }
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      setIsLangOpen(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-right text-sm hover:bg-surface-muted transition-colors",
                      i18n.language === lang.code ? "text-brand font-bold bg-brand/5" : "text-content-muted"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {currentStaff && (
            <button
              onClick={onLock}
              className={cn(
                "flex items-center gap-3 px-4 py-3 w-full text-right text-brand hover:bg-brand/5 rounded-xl transition-all duration-200 group relative",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Lock size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
              {!isCollapsed && <span className="truncate">{t('common.lock')}</span>}
              
              {isCollapsed && (
                <div className="absolute right-full mr-2 px-2 py-1 bg-brand text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  {t('common.lock')}
                </div>
              )}
            </button>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 px-4 py-3 w-full text-right text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 group relative",
              isCollapsed && "justify-center px-0"
            )}
          >
            <LogOut size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
            {!isCollapsed && <span className="truncate">{t('common.logout')}</span>}
            
            {isCollapsed && (
              <div className="absolute right-full mr-2 px-2 py-1 bg-red-600 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {t('common.logout')}
              </div>
            )}
          </button>
          
          <Branding 
            collapsed={isCollapsed} 
            className={cn("mt-2", isCollapsed ? "" : "justify-start px-4")} 
          />
        </div>
      </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header for Grid Mode */}
        {layoutMode === 'grid' && (
          <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
              {tenantLogo ? (
                <img src={tenantLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
              ) : (
                <div className="bg-brand p-1.5 rounded-md text-white shrink-0">
                  <Scissors size={20} />
                </div>
              )}
              <h1 className="text-lg font-bold text-content">{tenantName}</h1>
            </div>
            
            <div className="flex items-center gap-3">
              {location.pathname !== '/' && (
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-muted hover:bg-border text-content rounded-xl transition-all font-medium text-sm"
                >
                  <LayoutGrid size={18} />
                  الرئيسية
                </button>
              )}
              <button
                onClick={toggleLayoutMode}
                className="p-2 bg-surface-muted hover:bg-border text-content rounded-xl transition-all"
                title="تبديل العرض"
              >
                <List size={20} />
              </button>
              <div className="w-px h-6 bg-border mx-1"></div>
              <button
                onClick={() => navigate('/settings')}
                className="p-2 bg-surface-muted hover:bg-border text-content rounded-xl transition-all"
                title={t('common.settings')}
              >
                <Settings size={20} />
              </button>
              {currentStaff && (
                <button
                  onClick={onLock}
                  className="p-2 bg-surface-muted hover:bg-brand/10 text-brand rounded-xl transition-all"
                  title={t('common.lock')}
                >
                  <Lock size={20} />
                </button>
              )}
              <button
                onClick={handleLogout}
                className="p-2 bg-surface-muted hover:bg-red-50 text-red-600 rounded-xl transition-all"
                title={t('common.logout')}
              >
                <LogOut size={20} />
              </button>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-auto p-8">
          {layoutMode === 'grid' && location.pathname === '/' ? (
            <div className="max-w-5xl mx-auto space-y-12 py-8">
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-black text-content" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>مرحباً بك في {tenantName}</h2>
                <p className="text-content-muted font-medium text-lg">اختر النظام الذي تود إدارته</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {navItems.filter(i => i.to !== '/' && i.to !== '/settings').map(item => (
                  <button
                    key={item.to}
                    onClick={() => navigate(item.to)}
                    className="bg-white p-8 rounded-3xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(28,143,255,0.15)] hover:-translate-y-1 active:scale-95 active:translate-y-0 active:shadow-sm transition-all duration-300 flex flex-col items-center justify-center gap-5 group border border-gray-50"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-[#1C8FFF]/5 flex items-center justify-center text-[#1C8FFF] transition-transform duration-300 group-hover:scale-110">
                      <item.icon size={40} strokeWidth={1.5} />
                    </div>
                    <span className="text-xl font-bold text-gray-800" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>{item.label}</span>
                  </button>
                ))}
              </div>
              
              <div className="pt-16 flex justify-center">
                <Branding className="opacity-60" />
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
