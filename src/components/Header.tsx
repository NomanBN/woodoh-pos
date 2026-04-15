import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Tenant } from '../types';

interface HeaderProps {
  tenantId: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export default function Header({ tenantId, title, subtitle, children }: HeaderProps) {
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (!tenantId || tenantId === 'saas_management') return;
    const fetchTenant = async () => {
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTenant({ id: docSnap.id, ...docSnap.data() } as Tenant);
        }
      } catch (error) {
        console.error('Error fetching tenant:', error);
      }
    };
    fetchTenant();
  }, [tenantId]);

  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <div className="flex items-center gap-4">
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt="Shop Logo" className="w-16 h-16 rounded-2xl object-cover shadow-md border border-border" />
        )}
        <div>
          <h2 className="text-4xl font-black text-content tracking-tight">{title}</h2>
          <p className="text-content-muted mt-1 font-medium">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {children}
      </div>
    </header>
  );
}
