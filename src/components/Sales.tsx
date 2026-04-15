import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import POS from './POS';
import SalesRecord from './SalesRecord';
import SalesReturns from './SalesReturns';
import ShiftManager from './ShiftManager';
import ShiftClosingModal from './ShiftClosingModal';
import CashPayoutModal from './CashPayoutModal';
import ShiftHistory from './ShiftHistory';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Shift } from '../types';
import { Monitor, FileText, RotateCcw, DollarSign, History } from 'lucide-react';
import { useStaff } from '../contexts/StaffContext';

export default function Sales({ tenantId }: { tenantId: string }) {
  const { currentStaff } = useStaff();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeTab, setActiveTab] = useState<'pos' | 'records' | 'returns' | 'history'>('pos');
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);

  // Listen to active shift changes (like payouts)
  useEffect(() => {
    if (!activeShift?.id) return;
    const unsub = onSnapshot(doc(db, 'shifts', activeShift.id), (doc) => {
      if (doc.exists()) {
        setActiveShift({ id: doc.id, ...doc.data() } as Shift);
      }
    });
    return () => unsub();
  }, [activeShift?.id]);

  const handleCloseShift = () => {
    setIsClosingModalOpen(true);
  };

  const handleShiftClosed = () => {
    setIsClosingModalOpen(false);
    setActiveShift(null);
  };

  if (!activeShift) {
    return (
      <div className="flex flex-col h-full font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
        <div className="bg-white border-b border-gray-200 shrink-0 px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">المبيعات والورديات</h1>
          <button
            onClick={() => setActiveTab(activeTab === 'history' ? 'pos' : 'history')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2",
              activeTab === 'history' ? "bg-brand text-white" : "bg-surface-muted text-content hover:bg-border"
            )}
          >
            <History size={18} />
            سجل الورديات
          </button>
        </div>
        {activeTab === 'history' ? (
          <div className="flex-1 overflow-auto bg-gray-50">
            <ShiftHistory 
              tenantId={tenantId} 
              staffId={currentStaff?.id || ''} 
              isManager={currentStaff?.role === 'owner' || currentStaff?.role === 'admin' || currentStaff?.role === 'super_admin'} 
            />
          </div>
        ) : (
          <ShiftManager tenantId={tenantId} onShiftOpen={setActiveShift} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      {/* Sales Header & Tabs */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">المبيعات</h1>
            <p className="text-sm text-gray-500 mt-1">
              وردية نشطة: {activeShift.staffName} | البداية: {new Date(activeShift.startTime).toLocaleTimeString('ar-SA')}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsPayoutModalOpen(true)}
              className="text-gray-600 hover:bg-gray-100 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
            >
              <DollarSign size={18} />
              سحب نقدي
            </button>
            <button 
              onClick={handleCloseShift}
              className="bg-[#1C8FFF] text-white hover:bg-blue-600 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              إغلاق الوردية
            </button>
          </div>
        </div>
        
        <div className="flex px-6 gap-6">
          <button
            onClick={() => setActiveTab('pos')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === 'pos' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-[#6B7280] hover:text-gray-900"
            )}
          >
            <Monitor size={18} />
            نقطة البيع
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === 'records' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-[#6B7280] hover:text-gray-900"
            )}
          >
            <FileText size={18} />
            سجل المبيعات
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === 'returns' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-[#6B7280] hover:text-gray-900"
            )}
          >
            <RotateCcw size={18} />
            المرتجعات
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === 'history' ? "border-[#1C8FFF] text-[#1C8FFF]" : "border-transparent text-[#6B7280] hover:text-gray-900"
            )}
          >
            <History size={18} />
            سجل الورديات
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {activeTab === 'pos' && <POS tenantId={tenantId} shiftId={activeShift.id} />}
        {activeTab === 'records' && <SalesRecord tenantId={tenantId} shiftId={activeShift.id} />}
        {activeTab === 'returns' && <SalesReturns tenantId={tenantId} shiftId={activeShift.id} />}
        {activeTab === 'history' && (
          <ShiftHistory 
            tenantId={tenantId} 
            staffId={currentStaff?.id || ''} 
            isManager={currentStaff?.role === 'owner' || currentStaff?.role === 'admin' || currentStaff?.role === 'super_admin'} 
          />
        )}
      </div>

      {isClosingModalOpen && (
        <ShiftClosingModal 
          shift={activeShift} 
          tenantId={tenantId} 
          onClose={() => setIsClosingModalOpen(false)} 
          onClosed={handleShiftClosed} 
        />
      )}

      {isPayoutModalOpen && (
        <CashPayoutModal 
          shift={activeShift} 
          onClose={() => setIsPayoutModalOpen(false)} 
        />
      )}

      {/* Footer Branding */}
      <div className="bg-white border-t border-gray-200 py-3 flex justify-center shrink-0">
        <a href="https://wodohtech.com" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#6B7280] hover:text-[#1C8FFF] transition-colors">
          Powered By Wodoh Tech
        </a>
      </div>
    </div>
  );
}
