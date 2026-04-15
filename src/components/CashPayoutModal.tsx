import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, DollarSign, FileText } from 'lucide-react';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Shift } from '../types';

interface CashPayoutModalProps {
  shift: Shift;
  onClose: () => void;
}

export default function CashPayoutModal({ shift, onClose }: CashPayoutModalProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !reason) return;

    setIsSubmitting(true);
    try {
      const payout = {
        id: crypto.randomUUID(),
        amount: Number(amount),
        reason,
        time: new Date().toISOString()
      };

      await updateDoc(doc(db, 'shifts', shift.id), {
        payouts: arrayUnion(payout),
        updatedAt: serverTimestamp()
      });

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'shifts');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden text-right"
        dir="rtl"
        style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand/10 text-brand rounded-2xl">
              <DollarSign size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">سحب نقدي (مصروفات)</h2>
              <p className="text-xs text-gray-500 font-bold mt-1">تسجيل المبالغ المسحوبة من الدرج</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">المبلغ المسحوب</label>
            <div className="relative">
              <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pr-12 pl-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-lg"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">سبب السحب</label>
            <div className="relative">
              <FileText className="absolute right-4 top-4 text-gray-400" size={20} />
              <textarea 
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full pr-12 pl-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold resize-none h-24"
                placeholder="مثال: دفع لمورد، مصروفات نثرية..."
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand text-white py-4 rounded-2xl font-black text-lg hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50"
          >
            {isSubmitting ? 'جاري التسجيل...' : 'تسجيل السحب'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
