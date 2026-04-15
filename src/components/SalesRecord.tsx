import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { FileText, Eye } from 'lucide-react';

export default function SalesRecord({ tenantId, shiftId }: { tenantId: string, shiftId?: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('tenantId', '==', tenantId),
          ...(shiftId ? [where('shiftId', '==', shiftId)] : [])
          // orderBy('createdAt', 'desc') // Requires index, skipping for now
        );
        const snap = await getDocs(q);
        const ordersData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
        // Sort manually if index is missing
        ordersData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
        setOrders(ordersData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1C8FFF]"></div>
      </div>
    );
  }

  return (
    <div className="p-6 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
            <tr>
              <th className="p-4 font-medium">رقم الفاتورة</th>
              <th className="p-4 font-medium">العميل</th>
              <th className="p-4 font-medium">التاريخ</th>
              <th className="p-4 font-medium">الإجمالي</th>
              <th className="p-4 font-medium">الحالة</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map(order => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium text-gray-800">#{order.id.slice(-6).toUpperCase()}</td>
                <td className="p-4 text-gray-600">{order.customerName}</td>
                <td className="p-4 text-gray-600" dir="ltr">{new Date(order.orderDate).toLocaleString('ar-SA')}</td>
                <td className="p-4 font-bold text-[#1C8FFF]">{formatCurrency(order.totalAmount)}</td>
                <td className="p-4">
                  <span className={cn(
                    "px-2 py-1 rounded-md text-xs font-bold",
                    order.status === 'delivered' ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-blue-500/10 text-blue-600"
                  )}>
                    {order.status === 'delivered' ? 'مكتمل' : 'قيد التنفيذ'}
                  </span>
                </td>
                <td className="p-4 text-left">
                  <button className="p-2 text-gray-400 hover:text-[#1C8FFF] hover:bg-blue-50 rounded-lg transition-colors">
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-500">
                  <FileText className="mx-auto mb-4 opacity-20" size={48} />
                  <p>لا توجد مبيعات مسجلة</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
