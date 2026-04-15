import { collection, query, where, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Role, PermissionsMap, Staff, PermissionKey } from '../types';
import { SYSTEM_PERMISSIONS } from '../constants/permissions';

const createPermissions = (allowedIds: string[] = []): PermissionsMap => {
  const map: any = {};
  SYSTEM_PERMISSIONS.forEach(p => {
    map[p.id] = allowedIds.includes(p.id);
  });
  return map as PermissionsMap;
};

export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: PermissionsMap }> = {
  owner: {
    name: 'صاحب العمل (Owner)',
    description: 'وصول كامل ومطلق لجميع وحدات النظام مع صلاحيات حصرية للإدارة العليا',
    permissions: createPermissions(SYSTEM_PERMISSIONS.map(p => p.id))
  },
  manager: {
    name: 'المدير (Manager)',
    description: 'إدارة المبيعات والمخزون والموظفين والتقارير المالية المتقدمة',
    permissions: createPermissions(SYSTEM_PERMISSIONS.filter(p => p.id !== 'system.delete' && p.id !== 'settings.billing').map(p => p.id))
  },
  accountant: {
    name: 'المحاسب (Accountant)',
    description: 'إدارة التقارير المالية والضرائب والمصروفات',
    permissions: createPermissions([
      'orders.view', 'invoices.view',
      'reports.view', 'reports.financial', 'reports.tax',
      'payments.view_prices', 'dashboard.view', 'dashboard.revenue'
    ])
  },
  cashier: {
    name: 'الكاشير (Cashier)',
    description: 'إضافة العملاء والطلبات وتحصيل المدفوعات وإدارة الورديات',
    permissions: createPermissions([
      'orders.create', 'orders.view', 'orders.view_details',
      'payments.collect', 'shifts.manage', 'action.discount',
      'inventory.view', 'customers.create', 'customers.view',
      'dashboard.view', 'dashboard.orders', 'dashboard.customers'
    ])
  },
  tailor: {
    name: 'الخياط / الفني (Tailor)',
    description: 'عرض الطلبات المحالة وتفاصيل المقاسات وتحديث حالة الإنتاج',
    permissions: createPermissions([
      'orders.view', 'orders.view_details', 'orders.update_status'
    ])
  }
};

export const seedGlobalRoles = async () => {
  console.log('Starting seedGlobalRoles...');
  const rolesRef = collection(db, 'roles');
  const q = query(rolesRef, where('tenantId', '==', 'system'));
  const snap = await getDocs(q);
  console.log(`Found ${snap.size} existing system roles.`);
  
  const existingRoles = new Map(snap.docs.map(doc => [doc.data().roleKey, { id: doc.id, ...doc.data() } as any]));
  
  const promises = Object.entries(DEFAULT_ROLES).map(async ([key, roleData]) => {
    const existing = existingRoles.get(key) as any;
    if (!existing) {
      console.log(`Seeding new role: ${key}`);
      return addDoc(rolesRef, {
        ...roleData,
        tenantId: 'system',
        isDefault: true,
        roleKey: key,
        createdAt: new Date().toISOString()
      });
    } else {
      console.log(`Updating existing role: ${key}`);
      // Update permissions and description to match latest system defaults
      return updateDoc(doc(db, 'roles', existing.id), {
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        updatedAt: serverTimestamp()
      });
    }
  });
  
  await Promise.all(promises);
  console.log('seedGlobalRoles completed successfully.');
  return true;
};

export const initializeTenantRoles = async (tenantId: string) => {
  // We no longer copy all roles to tenant. 
  // Tenants use system roles by default.
  // We only assign the owner role to the first user.
  return true;
};

export const getEffectivePermissions = async (staff: Staff): Promise<PermissionsMap> => {
  // 1. SUPER_USER_ACCESS: Owners and Super Admins bypass all individual checks
  if (staff.role === 'owner' || staff.role === 'super_admin') {
    return DEFAULT_ROLES.owner.permissions;
  }

  const rolesRef = collection(db, 'roles');
  
  // Search for role in tenant roles first (customized/forked roles)
  const qTenant = query(rolesRef, where('tenantId', '==', staff.tenantId), where('roleKey', '==', staff.role));
  const tenantRoleSnap = await getDocs(qTenant);
  
  let permissions: PermissionsMap = { ...DEFAULT_ROLES.tailor.permissions }; // Fallback
  
  if (!tenantRoleSnap.empty) {
    permissions = tenantRoleSnap.docs[0].data().permissions as PermissionsMap;
  } else {
    // Check system roles (defaults)
    const qSystem = query(rolesRef, where('tenantId', '==', 'system'), where('roleKey', '==', staff.role));
    const systemRoleSnap = await getDocs(qSystem);
    if (!systemRoleSnap.empty) {
      permissions = systemRoleSnap.docs[0].data().permissions as PermissionsMap;
    }
  }

  // 2. Get User Overrides
  const overrideRef = doc(db, 'user_permission_overrides', staff.id);
  const overrideSnap = await getDoc(overrideRef);
  
  if (overrideSnap.exists()) {
    const overrides = overrideSnap.data().overrides as Partial<PermissionsMap>;
    permissions = { ...permissions, ...overrides };
  }

  return permissions;
};

export const logUnauthorizedAccess = async (staff: Staff, permission: string, module: string) => {
  try {
    await addDoc(collection(db, 'security_logs'), {
      tenantId: staff.tenantId,
      staffId: staff.id,
      staffName: staff.name,
      staffEmail: staff.email,
      attemptedPermission: permission,
      module,
      timestamp: new Date().toISOString(),
      message: `محاولة وصول غير مصرح بها لـ ${permission} في موديول ${module}`
    });
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

export const createCustomRole = async (tenantId: string, name: string, description: string, permissions: PermissionsMap, performedBy: string, performedByEmail: string) => {
  const rolesRef = collection(db, 'roles');
  const roleKey = `custom_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  
  const docRef = await addDoc(rolesRef, {
    name,
    description,
    permissions,
    tenantId,
    isDefault: false,
    roleKey,
    createdAt: new Date().toISOString()
  });

  // Audit Log
  await addDoc(collection(db, 'audit_logs'), {
    action: 'إنشاء مهنة مخصصة',
    performedBy,
    performedByEmail,
    targetTenantId: tenantId,
    details: `تم إنشاء مهنة مخصصة جديدة: ${name}`,
    timestamp: new Date().toISOString(),
    type: 'security'
  });

  return docRef.id;
};

export const updateRolePermissions = async (roleId: string, permissions: PermissionsMap, performedBy: string, performedByEmail: string, tenantId: string) => {
  const roleRef = doc(db, 'roles', roleId);
  const roleSnap = await getDoc(roleRef);
  if (!roleSnap.exists()) return;

  const roleData = roleSnap.data();

  // FORKING LOGIC: If it's a system role, clone it for the tenant
  if (roleData.tenantId === 'system') {
    const newRoleKey = roleData.roleKey; // Use the same roleKey so staff assignments still work
    const rolesRef = collection(db, 'roles');
    
    // Check if a custom version already exists for this tenant
    const q = query(rolesRef, where('tenantId', '==', tenantId), where('roleKey', '==', newRoleKey));
    const existingSnap = await getDocs(q);
    
    if (existingSnap.empty) {
      await addDoc(rolesRef, {
        name: roleData.name,
        description: roleData.description,
        permissions,
        tenantId,
        isDefault: false,
        roleKey: newRoleKey,
        createdAt: new Date().toISOString()
      });
    } else {
      await updateDoc(doc(db, 'roles', existingSnap.docs[0].id), {
        permissions,
        updatedAt: serverTimestamp()
      });
    }
  } else {
    // Normal update for custom roles
    await updateDoc(roleRef, { permissions, updatedAt: serverTimestamp() });
  }

  // Audit Log
  await addDoc(collection(db, 'audit_logs'), {
    action: 'تحديث صلاحيات المهنة',
    performedBy,
    performedByEmail,
    targetTenantId: tenantId,
    details: `تم تحديث صلاحيات المهنة: ${roleData.name}`,
    timestamp: new Date().toISOString(),
    type: 'security'
  });
};

export const updateUserOverrides = async (staffId: string, tenantId: string, overrides: Partial<PermissionsMap>, performedBy: string, performedByEmail: string) => {
  const overrideRef = doc(db, 'user_permission_overrides', staffId);
  await setDoc(overrideRef, {
    tenantId,
    overrides,
    updatedAt: serverTimestamp()
  });

  // Audit Log
  await addDoc(collection(db, 'audit_logs'), {
    action: 'تحديث استثناءات صلاحيات المستخدم',
    performedBy,
    performedByEmail,
    targetTenantId: tenantId,
    details: `تم تحديث الاستثناءات الفردية للموظف ذو المعرف: ${staffId}`,
    timestamp: new Date().toISOString(),
    type: 'security'
  });
};

export interface PermissionDetail {
  id: string;
  name: string;
  description: string;
  category: string;
  baseValue: boolean;
  overrideValue?: boolean;
  effectiveValue: boolean;
  isOverridden: boolean;
}

export const getStaffPermissionDetails = async (staff: Staff): Promise<PermissionDetail[]> => {
  const rolesRef = collection(db, 'roles');
  
  // Search for role in tenant roles first (customized/forked roles)
  const qTenant = query(rolesRef, where('tenantId', '==', staff.tenantId), where('roleKey', '==', staff.role));
  const tenantRoleSnap = await getDocs(qTenant);
  
  let basePermissions: PermissionsMap = { ...DEFAULT_ROLES.tailor.permissions }; // Fallback
  
  if (!tenantRoleSnap.empty) {
    basePermissions = tenantRoleSnap.docs[0].data().permissions as PermissionsMap;
  } else {
    // Check system roles (defaults)
    const qSystem = query(rolesRef, where('tenantId', '==', 'system'), where('roleKey', '==', staff.role));
    const systemRoleSnap = await getDocs(qSystem);
    if (!systemRoleSnap.empty) {
      basePermissions = systemRoleSnap.docs[0].data().permissions as PermissionsMap;
    }
  }

  // Get User Overrides
  const overrideRef = doc(db, 'user_permission_overrides', staff.id);
  const overrideSnap = await getDoc(overrideRef);
  
  let overrides: Partial<PermissionsMap> = {};
  if (overrideSnap.exists()) {
    overrides = overrideSnap.data().overrides as Partial<PermissionsMap>;
  }

  return SYSTEM_PERMISSIONS.map(perm => {
    const baseValue = basePermissions[perm.id as PermissionKey] ?? false;
    const overrideValue = overrides[perm.id as PermissionKey];
    const effectiveValue = overrideValue !== undefined ? overrideValue : baseValue;
    const isOverridden = overrideValue !== undefined;

    return {
      ...perm,
      baseValue,
      overrideValue,
      effectiveValue,
      isOverridden
    };
  });
};

export const bulkUpdateRolePermissions = async (
  roleIds: string[],
  permissions: PermissionsMap,
  performedBy: string,
  performedByEmail: string,
  tenantId: string
) => {
  const batch = writeBatch(db);
  const auditLogs: any[] = [];

  for (const roleId of roleIds) {
    const roleRef = doc(db, 'roles', roleId);
    const roleSnap = await getDoc(roleRef);
    if (!roleSnap.exists()) continue;

    const roleData = roleSnap.data();

    // FORKING LOGIC: If it's a system role, clone it for the tenant
    if (roleData.tenantId === 'system') {
      const newRoleKey = roleData.roleKey;
      const rolesRef = collection(db, 'roles');
      
      const q = query(rolesRef, where('tenantId', '==', tenantId), where('roleKey', '==', newRoleKey));
      const existingSnap = await getDocs(q);
      
      if (existingSnap.empty) {
        const newRoleRef = doc(collection(db, 'roles'));
        batch.set(newRoleRef, {
          name: roleData.name,
          description: roleData.description,
          permissions,
          tenantId,
          isDefault: false,
          roleKey: newRoleKey,
          createdAt: new Date().toISOString()
        });
      } else {
        batch.update(doc(db, 'roles', existingSnap.docs[0].id), {
          permissions,
          updatedAt: serverTimestamp()
        });
      }
    } else {
      batch.update(roleRef, { permissions, updatedAt: serverTimestamp() });
    }

    auditLogs.push({
      action: 'تحديث جماعي لصلاحيات المهنة',
      performedBy,
      performedByEmail,
      targetTenantId: tenantId,
      details: `تم تحديث صلاحيات المهنة: ${roleData.name} بشكل جماعي`,
      timestamp: new Date().toISOString(),
      type: 'security'
    });
  }

  await batch.commit();

  // Audit Logs
  const auditBatch = writeBatch(db);
  auditLogs.forEach(log => {
    const logRef = doc(collection(db, 'audit_logs'));
    auditBatch.set(logRef, log);
  });
  await auditBatch.commit();
};
