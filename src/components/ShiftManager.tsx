import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Shift } from '../types';
import { useStaff } from '../contexts/StaffContext';
import { Clock, DollarSign, User } from 'lucide-react';
import { cn } from '../lib/utils';

interface ShiftManagerProps {
  tenantId: string;
  onShiftOpen: (shift: Shift) => void;
}

export default function ShiftManager({ tenantId, onShiftOpen }: ShiftManagerProps) {
  const { currentStaff } = useStaff();
  const [loading, setLoading] = useState(true);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkActiveShift = async () => {
      if (!currentStaff) return;
      try {
        const q = query(
          collection(db, 'shifts'),
          where('tenantId', '==', tenantId),
          where('staffId', '==', currentStaff.id),
          where('status', '==', 'open')
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          onShiftOpen({ id: snap.docs[0].id, ...snap.docs[0].data() } as Shift);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'shifts');
      } finally {
        setLoading(false);
      }
    };
    checkActiveShift();
  }, [tenantId, currentStaff, onShiftOpen]);

  const handleOpenShift = async () => {
    if (!currentStaff) return;
    setIsSubmitting(true);
    try {
      const newShift = {
        tenantId,
        staffId: currentStaff.id,
        staffName: currentStaff.name,
        openingBalance,
        startTime: new Date().toISOString(),
        status: 'open' as const,
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'shifts'), newShift);
      onShiftOpen({ id: docRef.id, ...newShift } as Shift);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shifts');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C8FFF]"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="p-6 border-b border-gray-100 bg-gray-50 text-center">
          <h2 className="text-2xl font-bold text-gray-800">فتح وردية جديدة</h2>
          <p className="text-gray-500 mt-1">يجب فتح الوردية للبدء في المبيعات</p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-gray-50 p-4 rounded-2xl space-y-3 border border-gray-100">
            <div className="flex items-center gap-3 text-gray-600">
              <User size={18} className="text-[#1C8FFF]" />
              <span className="font-medium">الموظف:</span>
              <span className="font-bold text-gray-800">{currentStaff?.name}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Clock size={18} className="text-[#1C8FFF]" />
              <span className="font-medium">الوقت:</span>
              <span className="font-bold text-gray-800" dir="ltr">
                {new Date().toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">رصيد الصندوق الافتتاحي (كاش)</label>
            <div className="relative">
              <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="number" 
                value={openingBalance || ''}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
                className="w-full pr-12 pl-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none text-lg font-bold text-gray-800"
                placeholder="0.00"
                min="0"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">﷼</span>
            </div>
          </div>

          <button 
            onClick={handleOpenShift}
            disabled={isSubmitting || openingBalance < 0}
            className="w-full bg-[#1C8FFF] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#1C8FFF]/90 transition-colors disabled:opacity-50 shadow-lg shadow-[#1C8FFF]/20"
          >
            {isSubmitting ? 'جاري فتح الوردية...' : 'تأكيد وفتح الوردية'}
          </button>
        </div>
      </div>
    </div>
  );
}
