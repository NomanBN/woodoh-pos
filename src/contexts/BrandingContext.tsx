import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface BrandingSettings {
  websiteUrl: string;
  companyName: string;
}

interface BrandingContextType {
  settings: BrandingSettings;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BrandingSettings>({
    websiteUrl: 'https://wodoh.tech',
    companyName: 'Wodoh Tech'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'saas_settings', 'branding'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings({
          websiteUrl: data.websiteUrl || 'https://wodoh.tech',
          companyName: data.companyName || 'Wodoh Tech'
        });
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching branding settings:', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <BrandingContext.Provider value={{ settings, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}
