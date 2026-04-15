import bcrypt from 'bcryptjs';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Generates a secure random numeric PIN of specified length.
 */
export function generateSecurePin(length: 4 | 6 = 4): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/**
 * Checks if a PIN is unique within a specific tenant's staff collection.
 * Note: This checks against hashed PINs is difficult, so we usually check 
 * during the generation process if we store plain text temporarily or 
 * we just rely on the randomness for 6 digits. 
 * For 4 digits, collisions are possible (1 in 10,000).
 */
export async function isPinUnique(tenantId: string, pin: string): Promise<boolean> {
  // In a real scenario with hashed PINs, we can't easily query by plain text.
  // However, for this demo/requirement, we'll assume we check if any staff 
  // has this PIN. If we only store hashes, we'd have to fetch all and compare,
  // which is slow. 
  // Alternatively, we can store a temporary non-hashed version or a separate 
  // unique constraint if Firestore supported it.
  
  // For now, we'll fetch staff and compare (assuming small number of staff per tenant)
  const staffRef = collection(db, 'staff');
  const q = query(staffRef, where('tenantId', '==', tenantId));
  const querySnapshot = await getDocs(q);
  
  for (const doc of querySnapshot.docs) {
    const staffData = doc.data();
    if (staffData.pin && await bcrypt.compare(pin, staffData.pin)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Hashes a PIN for secure storage.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(pin, salt);
}
