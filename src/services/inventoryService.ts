import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  addDoc, 
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { Order, Tenant, BranchInventory, InventoryItem, Staff } from '../types';

export const UNIT_CONVERSIONS: Record<string, number> = {
  'meter': 1,
  'yard': 0.9144,
  'roll': 22.86, // Average roll is 25 yards
  'bolt': 36.576, // Average bolt is 40 yards
  'piece': 1,
  'spool': 1,
  'box': 1
};

export function convertToMeters(quantity: number, unit: string): number {
  const rate = UNIT_CONVERSIONS[unit] || 1;
  return quantity * rate;
}

export async function checkStockAvailability(
  items: any[],
  branchId: string,
  tenantId: string,
  strategy: 'centralized' | 'decentralized'
): Promise<{ available: boolean; missingItems: string[] }> {
  const missingItems: string[] = [];
  
  // If centralized, we look for the main warehouse
  let targetBranchId = branchId;
  if (strategy === 'centralized') {
    const branchesQuery = query(
      collection(db, 'branches'), 
      where('tenantId', '==', tenantId), 
      where('isMain', '==', true)
    );
    const branchesSnap = await getDocs(branchesQuery);
    if (branchesSnap.empty) {
      return { available: false, missingItems: ['المستودع المركزي غير موجود'] };
    }
    targetBranchId = branchesSnap.docs[0].id;
  }

  for (const item of items) {
    // Find the inventory item by name (assuming fabric name is unique per tenant for simplicity here, 
    // or we should use itemId if available in OrderItem)
    const inventoryQuery = query(
      collection(db, 'inventory'),
      where('tenantId', '==', tenantId),
      where('name', '==', item.fabric)
    );
    const inventorySnap = await getDocs(inventoryQuery);
    
    if (inventorySnap.empty) {
      missingItems.push(item.fabric);
      continue;
    }

    const inventoryItem = inventorySnap.docs[0];
    const branchInventoryId = `${targetBranchId}_${inventoryItem.id}`;
    const branchInventoryDoc = await getDoc(doc(db, 'branch_inventory', branchInventoryId));

    const deductionAmount = item.consumedMeters || convertToMeters(item.quantity, item.selectedUnit || 'meter');

    if (!branchInventoryDoc.exists() || branchInventoryDoc.data().quantity < deductionAmount) {
      missingItems.push(item.fabric);
    }
  }

  return {
    available: missingItems.length === 0,
    missingItems
  };
}

export async function deductStock(
  order: Order,
  staff: Staff,
  strategy: 'centralized' | 'decentralized'
): Promise<void> {
  const batch = writeBatch(db);
  const tenantId = order.tenantId;

  // Determine target branch
  let targetBranchId = order.branchId || staff.branchId;
  if (strategy === 'centralized') {
    const branchesQuery = query(
      collection(db, 'branches'), 
      where('tenantId', '==', tenantId), 
      where('isMain', '==', true)
    );
    const branchesSnap = await getDocs(branchesQuery);
    if (branchesSnap.empty) throw new Error('المستودع المركزي غير موجود');
    targetBranchId = branchesSnap.docs[0].id;
  }

  if (!targetBranchId) throw new Error('لم يتم تحديد الفرع للخصم');

  for (const item of order.items) {
    const inventoryQuery = query(
      collection(db, 'inventory'),
      where('tenantId', '==', tenantId),
      where('name', '==', item.fabric)
    );
    const inventorySnap = await getDocs(inventoryQuery);
    
    if (inventorySnap.empty) continue;

    const inventoryItem = inventorySnap.docs[0];
    const branchInventoryId = `${targetBranchId}_${inventoryItem.id}`;
    const branchInventoryRef = doc(db, 'branch_inventory', branchInventoryId);

    const deductionAmount = item.consumedMeters || convertToMeters(item.quantity, item.selectedUnit || 'meter');

    batch.update(branchInventoryRef, {
      quantity: increment(-deductionAmount),
      updatedAt: new Date().toISOString()
    });

    // Add to ledger
    const ledgerRef = doc(collection(db, 'stock_ledger'));
    batch.set(ledgerRef, {
      itemId: inventoryItem.id,
      branchId: targetBranchId,
      type: 'reduction',
      previousQuantity: 0, // Simplified, would need to fetch current
      newQuantity: 0,      // Simplified
      change: -deductionAmount,
      referenceId: order.id,
      staffId: staff.id,
      staffName: staff.name,
      tenantId: tenantId,
      createdAt: new Date().toISOString()
    });
  }

  await batch.commit();
}
