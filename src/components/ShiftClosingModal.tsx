import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Calculator, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Shift, Order } from '../types';
import { cn } from '../lib/utils';

interface ShiftClosingModalProps {
  shift: Shift;
  tenantId: string;
  onClose: () => void;
  onClosed: () => void;
}

export default function ShiftClosingModal({ shift, tenantId, onClose, onClosed }: ShiftClosingModalProps) {
  const [actualCash, setActualCash] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [totals, setTotals] = useState({
    cash: 0,
    card: 0,
    bank_transfer: 0,
    credit: 0,
    cashReturns: 0,
    totalReturns: 0,
    expenses: 0,
    taxes: 0,
    totalSales: 0
  });

  useEffect(() => {
    const fetchShiftData = async () => {
      try {
        // Fetch orders for this shift
        const ordersQuery = query(
          collection(db, 'orders'),
          where('tenantId', '==', tenantId),
          where('shiftId', '==', shift.id)
        );
        const ordersSnap = await getDocs(ordersQuery);
        const orders = ordersSnap.docs.map(d => d.data() as Order);

        let cash = 0;
        let card = 0;
        let bank_transfer = 0;
        let credit = 0;
        let cashReturns = 0;
        let totalReturns = 0;
        let taxes = 0;
        let totalSales = 0;

        orders.forEach(order => {
          if (order.status === 'returned') {
            totalReturns += (order.totalAmount || 0);
            if (order.paymentMethod === 'cash') cashReturns += (order.paidAmount || 0);
          } else {
            totalSales += (order.totalAmount || 0);
            taxes += (order.taxAmount || 0);
            
            if (order.paymentMethod === 'cash') cash += (order.paidAmount || 0);
            else if (order.paymentMethod === 'network') card += (order.paidAmount || 0);
            else if (order.paymentMethod === 'transfer') bank_transfer += (order.paidAmount || 0);
            else credit += (order.paidAmount || 0); // Assuming other methods are credit
          }
        });

        const expenses = shift.payouts?.reduce((sum, p) => sum + p.amount, 0) || 0;

        setTotals({
          cash,
          card,
          bank_transfer,
          credit,
          cashReturns,
          totalReturns,
          expenses,
          taxes,
          totalSales
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'orders');
      } finally {
        setLoading(false);
      }
    };

    fetchShiftData();
  }, [shift.id, tenantId]);

  const expectedCash = shift.openingBalance + totals.cash - totals.cashReturns - totals.expenses;
  const discrepancy = actualCash ? Number(actualCash) - expectedCash : 0;
  const hasDiscrepancy = actualCash !== '' && discrepancy !== 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualCash) return;
    if (hasDiscrepancy && !reason) {
      alert('يرجى إدخال سبب العجز/الزيادة');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'shifts', shift.id), {
        status: 'closed',
        endTime: new Date().toISOString(),
        actualCash: Number(actualCash),
        expectedCash,
        discrepancy,
        discrepancyReason: hasDiscrepancy ? reason : '',
        totals,
        updatedAt: serverTimestamp()
      });
      onClosed();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'shifts');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden text-right"
        dir="rtl"
        style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand/10 text-brand rounded-2xl">
              <Calculator size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">إغلاق الوردية</h2>
              <p className="text-xs text-gray-500 font-bold mt-1">تسوية الصندوق وإصدار التقرير</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-surface-muted p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-sm font-bold text-content-muted">
              <span>رصيد الافتتاح:</span>
              <span>{shift.openingBalance.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-content-muted">
              <span>مبيعات نقدية:</span>
              <span className="text-[#22C55E]">+{totals.cash.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-content-muted">
              <span>مرتجعات نقدية:</span>
              <span className="text-[#EF4444]">-{totals.cashReturns.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-content-muted">
              <span>مصروفات (سحب):</span>
              <span className="text-[#EF4444]">-{totals.expenses.toFixed(2)} ر.س</span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-lg font-black text-content">
              <span>المبلغ المتوقع في الدرج:</span>
              <span>{expectedCash.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">المبلغ الفعلي في الدرج (Blind Close)</label>
            <input 
              type="number"
              required
              min="0"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-xl text-center"
              placeholder="0.00"
            />
          </div>

          {actualCash !== '' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={cn(
                "p-4 rounded-2xl border-2 flex flex-col gap-3",
                discrepancy === 0 ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#EF4444] bg-[#EF4444]/10"
              )}
            >
              <div className="flex items-center gap-2">
                {discrepancy === 0 ? (
                  <CheckCircle2 className="text-[#22C55E]" size={20} />
                ) : (
                  <AlertTriangle className="text-[#EF4444]" size={20} />
                )}
                <span className={cn(
                  "font-black",
                  discrepancy === 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                )}>
                  {discrepancy === 0 ? 'المبلغ مطابق' : discrepancy > 0 ? `زيادة بقيمة ${Math.abs(discrepancy).toFixed(2)} ر.س` : `عجز بقيمة ${Math.abs(discrepancy).toFixed(2)} ر.س`}
                </span>
              </div>
              
              {hasDiscrepancy && (
                <textarea 
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-red-500 font-bold text-sm resize-none"
                  placeholder="يرجى توضيح سبب العجز أو الزيادة..."
                  rows={2}
                />
              )}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={isSubmitting || !actualCash || (hasDiscrepancy && !reason)}
            className="w-full bg-brand text-white py-4 rounded-2xl font-black text-lg hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50"
          >
            {isSubmitting ? 'جاري الإغلاق...' : 'تأكيد وإغلاق الوردية'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
