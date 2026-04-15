import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  try {
    // Try to initialize with service account if available in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    } else {
      // Fallback to default initialization (works in some environments with GOOGLE_APPLICATION_CREDENTIALS)
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    // Last resort: initialize with just project ID (limited functionality)
    if (process.env.VITE_FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID
      });
    }
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
