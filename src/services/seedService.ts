import { collection, getDocs, setDoc, doc, addDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { seedGlobalRoles } from './permissionService';

import { SaaSUserRole } from './saasSecurityService';

export const seedSaaSUsers = async () => {
  const saasUsersRef = collection(db, 'saas_users');
  const q = query(saasUsersRef, where('email', '==', 'nomansa2566512@gmail.com'));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    // We can't know the UID until they login, but we can pre-assign roles by email
    // or wait for first login to create the record.
    // For this demo, we'll assume the UID will be linked on first login or exists.
    // Let's just ensure the collection exists and has a schema.
  }
};

export const autoSeed = async () => {
  try {
    // Seed Global Roles
    await seedGlobalRoles();

    const plansSnap = await getDocs(collection(db, 'plans'));
    if (plansSnap.empty) {
      console.log('Seeding initial data...');
      // 1. Seed Plans
      const plans = [
        { id: 'basic', name: 'الخطة الأساسية', price: 99, features: ['إدارة العملاء', 'إدارة الطلبات', 'موظف واحد'], maxStaff: 1, maxOrders: 100 },
        { id: 'pro', name: 'الخطة الاحترافية', price: 299, features: ['إدارة المخزون', 'تقارير متقدمة', '5 موظفين'], maxStaff: 5, maxOrders: 500 },
        { id: 'enterprise', name: 'خطة الشركات', price: 999, features: ['دعم فني 24/7', 'عدد غير محدود', 'تخصيص كامل'], maxStaff: 100, maxOrders: 10000 }
      ];
      for (const plan of plans) {
        await setDoc(doc(db, 'plans', plan.id), plan);
      }

      // 2. Seed Sample Requests
      const sampleRequests = [
        { name: 'أحمد محمد', email: 'ahmed@test.com', phone: '0501234567', shopName: 'خياط الأناقة', status: 'pending', uid: 'sample_uid_1', createdAt: new Date().toISOString() },
        { name: 'سارة علي', email: 'sara@test.com', phone: '0559876543', shopName: 'مشغل سارة', status: 'pending', uid: 'sample_uid_2', createdAt: new Date().toISOString() }
      ];
      for (const req of sampleRequests) {
        await setDoc(doc(collection(db, 'tailorRequests')), req);
      }

      // 3. Seed a Sample Active Tenant
      const sampleTenantId = 'sample_tenant_123';
      await setDoc(doc(db, 'tenants', sampleTenantId), {
        id: sampleTenantId,
        name: 'خياط التجربة المثالي',
        ownerEmail: 'demo@tailor.com',
        phone: '0540000000',
        status: 'active',
        planId: 'pro',
        createdAt: new Date().toISOString()
      });

      // 4. Seed Data for the Sample Tenant
      const sampleStaff = [
        { name: 'خالد الموظف', email: 'khaled@demo.com', phone: '0561112223', role: 'tailor', status: 'active', tenantId: sampleTenantId, createdAt: new Date().toISOString() },
        { name: 'عمر المحاسب', email: 'omar@demo.com', phone: '0564445556', role: 'cashier', status: 'active', tenantId: sampleTenantId, createdAt: new Date().toISOString() }
      ];
      for (const s of sampleStaff) {
        await setDoc(doc(collection(db, 'staff')), s);
      }

      const sampleCustomers = [
        { name: 'محمد العتيبي', phone: '0599999999', tenantId: sampleTenantId, measurements: { length: 150, shoulder: 45, chest: 100 }, createdAt: new Date().toISOString() },
        { name: 'فهد الشمري', phone: '0588888888', tenantId: sampleTenantId, measurements: { length: 155, shoulder: 48, chest: 110 }, createdAt: new Date().toISOString() },
        { name: 'عبدالله القحطاني', phone: '0577777777', tenantId: sampleTenantId, measurements: { length: 148, shoulder: 42, chest: 95 }, createdAt: new Date().toISOString() }
      ];
      const customerIds = [];
      for (const c of sampleCustomers) {
        const ref = doc(collection(db, 'customers'));
        await setDoc(ref, c);
        customerIds.push({ id: ref.id, name: c.name });
      }

      const sampleOrders = [
        { customerId: customerIds[0].id, customerName: customerIds[0].name, tenantId: sampleTenantId, items: [{ garmentType: 'ثوب', fabric: 'قطن ياباني', quantity: 1, price: 250 }], totalAmount: 250, paidAmount: 250, status: 'delivered', orderDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), deliveryDate: new Date().toISOString() },
        { customerId: customerIds[1].id, customerName: customerIds[1].name, tenantId: sampleTenantId, items: [{ garmentType: 'ثوب شتوي', fabric: 'صوف', quantity: 1, price: 450 }], totalAmount: 450, paidAmount: 200, status: 'in-progress', orderDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
        { customerId: customerIds[2].id, customerName: customerIds[2].name, tenantId: sampleTenantId, items: [{ garmentType: 'بشت', fabric: 'يدوي', quantity: 1, price: 1200 }], totalAmount: 1200, paidAmount: 500, status: 'pending', orderDate: new Date().toISOString(), deliveryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }
      ];
      for (const o of sampleOrders) {
        await setDoc(doc(collection(db, 'orders')), o);
      }

      // 5. Seed Inventory
      const sampleInventory = [
        { name: 'قماش قطن أبيض', category: 'أقمشة', quantity: 50, unit: 'متر', minThreshold: 10, pricePerUnit: 45, tenantId: sampleTenantId, updatedAt: new Date().toISOString() },
        { name: 'خيوط ملونة', category: 'مستلزمات', quantity: 100, unit: 'حبة', minThreshold: 20, pricePerUnit: 5, tenantId: sampleTenantId, updatedAt: new Date().toISOString() },
        { name: 'أزرار صدف', category: 'مستلزمات', quantity: 500, unit: 'حبة', minThreshold: 50, pricePerUnit: 2, tenantId: sampleTenantId, updatedAt: new Date().toISOString() }
      ];
      for (const i of sampleInventory) {
        await setDoc(doc(collection(db, 'inventory')), i);
      }
      return true;
    }
  } catch (error) {
    console.error('Seeding error:', error);
    return false;
  }
  return false;
};
