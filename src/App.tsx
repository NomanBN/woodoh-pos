import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, query, collection, where, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Orders from './components/Orders';
import Settings from './components/Settings';
import Sales from './components/Sales';
import Login from './components/Login';
import InventoryManager from './components/Inventory/InventoryManager';
import { PermissionGuard } from './components/PermissionGuard';
import Reports from './components/Reports';
import AdminTailors from './components/AdminTailors';
import Onboarding from './components/Onboarding';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import PinLogin from './components/PinLogin';
import ForcePinSetup from './components/ForcePinSetup';
import StaffPinSetup from './components/StaffPinSetup';
import ErrorBoundary from './components/ErrorBoundary';
import { UserRole, Staff as StaffType } from './types';
import { autoSeed } from './services/seedService';
import { seedGlobalRoles } from './services/permissionService';
import { Tailor } from './types';
import { StaffProvider, useStaff } from './contexts/StaffContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { analytics, AnalyticsEvent } from './services/analyticsService';
import { useTranslation } from 'react-i18next';

import SaaSLogin from './components/SaaSLogin';
import SaaSLayout from './components/SaaSLayout';
import SaaSReports from './components/SaaSReports';
import SaaSAuditLogs from './components/SaaSAuditLogs';
import SaaSSystemSettings from './components/SaaSSystemSettings';

import Suppliers from './components/Suppliers';

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [tailorProfile, setTailorProfile] = useState<Tailor | null>(null);
  const { currentStaff, setCurrentStaff } = useStaff();
  const [currentUserStaff, setCurrentUserStaff] = useState<StaffType | null>(null);
  const [loading, setLoading] = useState(true);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'super_admin' | 'tenant_admin' | 'staff' | 'support_tech' | 'billing_admin' | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [hasStaffWithPin, setHasStaffWithPin] = useState<boolean | null>(null);
  const { i18n } = useTranslation();

  useEffect(() => {
    const dir = i18n.language === 'en' ? 'ltr' : 'rtl';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          // 0. Check for Impersonation (SaaS Support)
          const impersonatedId = localStorage.getItem('impersonatedTenantId');
          if (impersonatedId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', impersonatedId));
            if (tenantDoc.exists()) {
              const tenantData = tenantDoc.data();
              setTenantId(impersonatedId);
              setUserRole('super_admin'); // Grant full access during impersonation
              setTailorProfile({
                id: user.uid,
                name: tenantData.name,
                email: user.email!,
                role: 'super_admin',
                isApproved: true,
                phone: ''
              });
              setLoading(false);
              return;
            }
          }

          // 1. Check SaaS Users first
          const saasUserDoc = await getDoc(doc(db, 'saas_users', user.uid));
          if (saasUserDoc.exists()) {
            const saasData = saasUserDoc.data();
            setUserRole(saasData.role as any);
            setTailorProfile({
              id: user.uid,
              name: saasData.name,
              email: user.email!,
              role: saasData.role as any,
              isApproved: true,
              phone: saasData.phone || ''
            });
            setTenantId('saas_management'); // Special ID for SaaS staff
            setLoading(false);
            return;
          }

          // 2. Fallback for the hardcoded Super Admin
          if (user.email === "nomansa2566512@gmail.com") {
            setUserRole('super_admin');
            setTailorProfile({ 
              id: user.uid, 
              name: 'المسؤول الرئيسي', 
              email: user.email!, 
              role: 'super_admin', 
              isApproved: true,
              phone: ''
            });
            setTenantId('saas_management');
            
            autoSeed().then(seeded => {
              if (seeded) console.log('Initial data seeded successfully');
            });

            setLoading(false);
            return;
          }

          // 3. Check if Tenant Owner (by UID or Email)
          let tenantDoc: any = null;
          try {
            const qTenant = query(collection(db, 'tenants'), where('uid', '==', user.uid));
            const tenantSnap = await getDocs(qTenant);
            if (!tenantSnap.empty) {
              tenantDoc = tenantSnap.docs[0];
            } else {
              const qTenantEmail = query(collection(db, 'tenants'), where('ownerEmail', '==', user.email));
              const tenantEmailSnap = await getDocs(qTenantEmail);
              if (!tenantEmailSnap.empty) {
                tenantDoc = tenantEmailSnap.docs[0];
              }
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.LIST, 'tenants_lookup');
          }
          
          if (tenantDoc) {
            const tenantData = tenantDoc.data();
            setTenantId(tenantDoc.id);
            setUserRole('owner');
            setTailorProfile({ 
              id: user.uid, 
              name: tenantData.name, 
              email: user.email!, 
              role: 'owner', 
              isApproved: tenantData.status === 'active',
              phone: ''
            });

            // Initialize Analytics for Tenant Owner
            analytics.init({
              tenant_id: tenantDoc.id,
              tenant_name: tenantData.name,
              plan_type: tenantData.planId || 'basic',
              category: tenantData.category || 'tailor',
              user_id: user.uid,
              user_role: 'owner',
              user_email: user.email
            });

            // Check if tenant has any staff with PINs
            const qStaffCheck = query(collection(db, 'staff'), where('tenantId', '==', tenantDoc.id));
            const staffCheckSnap = await getDocs(qStaffCheck);
            const hasPin = staffCheckSnap.docs.some(doc => doc.data().pin);
            setHasStaffWithPin(hasPin);

            // Also find current user's staff record
            const currentUserStaffDoc = staffCheckSnap.docs.find(doc => doc.data().email === user.email || doc.id === user.uid);
            if (currentUserStaffDoc) {
              setCurrentUserStaff({ id: currentUserStaffDoc.id, ...currentUserStaffDoc.data() } as StaffType);
            }
          } else {
            // 4. Check if Tenant Staff (by UID or Email)
            let staffDoc: any = null;
            try {
              const directStaffDoc = await getDoc(doc(db, 'staff', user.uid));
              if (directStaffDoc.exists()) {
                staffDoc = directStaffDoc;
              } else {
                const qStaff = query(collection(db, 'staff'), where('email', '==', user.email));
                const staffSnap = await getDocs(qStaff);
                if (!staffSnap.empty) {
                  staffDoc = staffSnap.docs[0];
                }
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.GET, 'staff_lookup');
            }
            
            if (staffDoc) {
              const staffData = staffDoc.data() as StaffType;
              
              // Migration: If staff record is not indexed by UID, migrate it
              if (staffDoc.id !== user.uid) {
                console.log('Migrating staff record to UID-indexed document...');
                try {
                  await setDoc(doc(db, 'staff', user.uid), {
                    ...staffData,
                    uid: user.uid,
                    updatedAt: serverTimestamp()
                  });
                  await deleteDoc(doc(db, 'staff', staffDoc.id));
                  console.log('Staff migration successful');
                } catch (migrationError) {
                  console.error('Staff migration failed:', migrationError);
                  // Continue with the old record if migration fails
                }
              }

              setCurrentUserStaff({ id: user.uid, ...staffData });
              setTenantId(staffData.tenantId);
              setUserRole(staffData.role as UserRole);
              setTailorProfile({
                id: user.uid,
                name: staffData.name,
                email: user.email!,
                role: staffData.role as UserRole,
                isApproved: staffData.status === 'active',
                phone: staffData.phone || ''
              });

              // Fetch tenant info for analytics
              const tenantRef = doc(db, 'tenants', staffData.tenantId);
              const tenantDoc = await getDoc(tenantRef);
              if (tenantDoc.exists()) {
                const tenantData = tenantDoc.data();
                analytics.init({
                  tenant_id: staffData.tenantId,
                  tenant_name: tenantData.name,
                  plan_type: tenantData.planId || 'basic',
                  category: tenantData.category || 'tailor',
                  user_id: user.uid,
                  user_role: staffData.role as UserRole,
                  user_email: user.email
                });
              }
            } else {
              // 5. Check if pending request
              const qReq = query(collection(db, 'tailorRequests'), where('uid', '==', user.uid));
              const reqSnap = await getDocs(qReq);
              if (!reqSnap.empty) {
                const reqData = reqSnap.docs[0].data();
                setOnboardingStep(reqData.onboardingStep || 1);
              } else {
                setTailorProfile(null);
                setTenantId(null);
                setUserRole(null);
                setOnboardingStep(null);
              }
            }
          }
          } catch (error) {
            console.error('Auth check failed for user:', user.email, error);
            // Error is already logged by handleFirestoreError in the specific calls above
          }
      } else {
        setTailorProfile(null);
        setTenantId(null);
        setUserRole(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('onAuthStateChanged error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const isSaaSStaff = userRole === 'super_admin' || userRole === 'support_tech' || userRole === 'billing_admin';
  const isApproved = tailorProfile?.isApproved || isSaaSStaff;
  const needsOnboarding = user && !isApproved && onboardingStep === 1;
  const isSuperAdmin = userRole === 'super_admin';
  const isTenantOwner = userRole === 'owner' || userRole === 'manager' || isSuperAdmin;
  const needsPinSetup = user && isApproved && currentUserStaff && !currentUserStaff.pin;
  const showPinLogin = user && isApproved && !isSaaSStaff && !currentStaff && hasStaffWithPin && !needsPinSetup;
  const showForcePinSetup = user && isApproved && isTenantOwner && hasStaffWithPin === false;

  // 2FA Check for SaaS Staff
  const is2FAVerified = sessionStorage.getItem('saas_2fa_verified') === 'true';
  const needsSaaS2FA = isSaaSStaff && !is2FAVerified;

  return (
    <AnimatePresence mode="wait">
      {needsPinSetup ? (
        <StaffPinSetup 
          staff={currentUserStaff!} 
          onSuccess={(updated) => {
            setCurrentUserStaff(updated);
            setHasStaffWithPin(true);
            setCurrentStaff(updated);
          }} 
        />
      ) : showPinLogin ? (
        <PinLogin 
          tenantId={tenantId!} 
          onLogin={(staff) => setCurrentStaff(staff)} 
        />
      ) : showForcePinSetup ? (
        <ForcePinSetup 
          tenantId={tenantId!} 
          onSuccess={() => setHasStaffWithPin(true)} 
        />
      ) : (
        <Routes>
          <Route path="/login" element={(!user || (!isApproved && onboardingStep !== 1)) ? <Login /> : <Navigate to={onboardingStep === 1 ? "/onboarding" : "/"} />} />
          <Route path="/saas/login" element={<SaaSLogin />} />
          <Route path="/onboarding" element={needsOnboarding ? <Onboarding /> : <Navigate to="/" />} />
          
          {/* SaaS Admin Routes */}
          <Route 
            path="/admin/*" 
            element={
              (user && isSaaSStaff && is2FAVerified) ? (
                <SaaSLayout userRole={userRole}>
                  <Routes>
                    <Route path="/dashboard" element={<SuperAdminDashboard />} />
                    <Route path="/tailors" element={<AdminTailors />} />
                    <Route path="/reports" element={<SaaSReports />} />
                    <Route path="/audit" element={<SaaSAuditLogs />} />
                    <Route path="/system" element={<SaaSSystemSettings />} />
                    <Route path="*" element={<Navigate to="/admin/dashboard" />} />
                  </Routes>
                </SaaSLayout>
              ) : (
                <Navigate to="/saas/login" />
              )
            } 
          />

          <Route
            path="/*"
            element={
              (user && isApproved) ? (
                <Layout 
                  role={userRole} 
                  tenantId={tenantId} 
                  currentStaff={currentStaff}
                  onLock={() => setCurrentStaff(null)}
                >
                  <Routes>
                    <Route path="/" element={<Dashboard tenantId={tenantId!} />} />
                    <Route path="/dashboard" element={<Dashboard tenantId={tenantId!} />} />
                    <Route path="/sales" element={<Sales tenantId={tenantId!} />} />
                    <Route path="/customers" element={<Customers tenantId={tenantId!} />} />
                    <Route path="/orders" element={<Orders tenantId={tenantId!} />} />
                    <Route path="/inventory" element={<InventoryManager tenantId={tenantId!} />} />
                    <Route path="/suppliers" element={<Suppliers tenantId={tenantId!} />} />
                    <Route path="/branches" element={<Navigate to="/settings" />} />
                    <Route path="/reports" element={<Reports tenantId={tenantId!} />} />
                    {isSuperAdmin && <Route path="/admin/dashboard" element={<Navigate to="/admin/dashboard" />} />}
                    {isTenantOwner && (
                      <Route 
                        path="/staff" 
                        element={<Navigate to="/settings" />}
                      />
                    )}
                    <Route path="/settings" element={<Settings tenantId={tenantId!} />} />
                    {isSuperAdmin && <Route path="/admin/tailors" element={<Navigate to="/admin/tailors" />} />}
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </Layout>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <BrandingProvider>
            <StaffProvider>
              <AppContent />
            </StaffProvider>
          </BrandingProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
