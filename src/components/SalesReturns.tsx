import React, { useState } from 'react';
import { Search, RotateCcw, CheckCircle2 } from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order } from '../types';
import { formatCurrency } from '../lib/utils';

export default function SalesReturns({ tenantId, shiftId }: { tenantId: string, shiftId?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      // Assuming searchQuery is the order ID for simplicity
      const q = query(collection(db, 'orders'), where('tenantId', '==', tenantId));
      const snap = await getDocs(q);
      const found = snap.docs.find(d => d.id.includes(searchQuery) || d.id.slice(-6).toUpperCase() === searchQuery.toUpperCase());
      
      if (found) {
        setOrder({ id: found.id, ...found.data() } as Order);
      } else {
        alert('لم يتم العثور على الفاتورة');
        setOrder(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!order) return;
    if (!confirm('هل أنت متأكد من إرجاع هذه الفاتورة؟')) return;
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'cancelled',
        returnReason,
        returnedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      alert('تم إرجاع الفاتورة بنجاح');
      setOrder(null);
      setSearchQuery('');
      setReturnReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">إرجاع فاتورة مبيعات</h2>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text"
                placeholder="أدخل رقم الفاتورة للبحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none"
              />
            </div>
            <button 
              onClick={handleSearch}
              disabled={loading || !searchQuery}
              className="bg-[#1C8FFF] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#1C8FFF]/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'جاري البحث...' : 'بحث'}
            </button>
          </div>
        </div>

        {order && (
          <div className="border-t border-gray-100 pt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">رقم الفاتورة</p>
                <p className="font-bold text-gray-800">#{order.id.slice(-6).toUpperCase()}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">العميل</p>
                <p className="font-bold text-gray-800">{order.customerName}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">التاريخ</p>
                <p className="font-bold text-gray-800" dir="ltr">{new Date(order.orderDate).toLocaleDateString('ar-SA')}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">الإجمالي</p>
                <p className="font-bold text-[#1C8FFF]">{formatCurrency(order.totalAmount)}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">سبب الإرجاع</label>
              <textarea 
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none h-24 resize-none"
                placeholder="اكتب سبب الإرجاع هنا..."
              />
            </div>

            <button 
              onClick={handleReturn}
              disabled={isSubmitting || order.status === 'cancelled'}
              className="w-full bg-red-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} />
              {order.status === 'cancelled' ? 'الفاتورة مرتجعة مسبقاً' : 'تأكيد الإرجاع'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
