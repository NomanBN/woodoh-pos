import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum SaaSUserRole {
  SUPER_ADMIN = 'super_admin',
  SUPPORT = 'support_tech',
  BILLING = 'billing_admin'
}

export interface SaaSSecurityLog {
  userId: string;
  userEmail: string;
  action: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  timestamp: any;
}

export const logSaaSSecurityEvent = async (action: string, details: string) => {
  try {
    // In a real app, we'd get the IP from a cloud function or server-side
    // Here we simulate it
    const ipResponse = await fetch('https://api.ipify.org?format=json').catch(() => ({ json: () => Promise.resolve({ ip: 'unknown' }) }));
    const { ip } = await (ipResponse as any).json();

    await addDoc(collection(db, 'saas_security_logs'), {
      userId: auth.currentUser?.uid,
      userEmail: auth.currentUser?.email,
      action,
      details,
      ipAddress: ip,
      userAgent: navigator.userAgent,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging SaaS security event:', error);
  }
};

export const verifySaaSStaff = async (email: string): Promise<boolean> => {
  // Only official company emails allowed
  const officialDomains = ['wodohtech.com', 'gmail.com']; // gmail.com added for dev/demo purposes as per user email
  const domain = email.split('@')[1];
  return officialDomains.includes(domain);
};

export const getSaaSUserRole = async (uid: string): Promise<SaaSUserRole | null> => {
  const docRef = doc(db, 'saas_users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().role as SaaSUserRole;
  }
  return null;
};
