import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Shift } from '../types';
import { cn } from '../lib/utils';
import { FileText, Calendar, Search, Download, Printer } from 'lucide-react';
import Branding from './Branding';

interface ShiftHistoryProps {
  tenantId: string;
  staffId: string;
  isManager: boolean;
}

export default function ShiftHistory({ tenantId, staffId, isManager }: ShiftHistoryProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  useEffect(() => {
    const fetchShifts = async () => {
      try {
        let q = query(
          collection(db, 'shifts'),
          where('tenantId', '==', tenantId),
          orderBy('startTime', 'desc')
        );

        const snap = await getDocs(q);
        let data = snap.docs.map(d => d.data() as Shift);

        if (!isManager) {
          data = data.filter(s => s.staffId === staffId);
        }

        setShifts(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'shifts');
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [tenantId, staffId, isManager]);

  const filteredShifts = shifts.filter(s => {
    const matchesSearch = s.staffName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !dateFilter || s.startTime.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  });

  const handlePrintZReport = (shift: Shift) => {
    setSelectedShift(shift);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C8FFF]"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-content">سجل الورديات</h2>
          <p className="text-content-muted mt-1">مراجعة الورديات السابقة وتقارير Z</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
            <input 
              type="text" 
              placeholder="بحث باسم الموظف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none text-sm font-bold"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pr-10 pl-4 py-2 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none text-sm font-bold"
            />
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-surface-muted border-b border-border">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">الموظف</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">وقت البداية</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">وقت النهاية</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">الحالة</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">المتوقع</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">الفعلي</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">الفارق</th>
                <th className="px-6 py-4 text-xs font-black text-[#6B7280] uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredShifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-content">{shift.staffName}</td>
                  <td className="px-6 py-4 text-sm text-content-muted">{new Date(shift.startTime).toLocaleString('ar-SA')}</td>
                  <td className="px-6 py-4 text-sm text-content-muted">{shift.endTime ? new Date(shift.endTime).toLocaleString('ar-SA') : '-'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold",
                      shift.status === 'open' ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                    )}>
                      {shift.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-content">{shift.expectedCash?.toFixed(2) || '-'}</td>
                  <td className="px-6 py-4 font-bold text-content">{shift.actualCash?.toFixed(2) || '-'}</td>
                  <td className="px-6 py-4">
                    {shift.discrepancy !== undefined ? (
                      <span className={cn(
                        "font-bold",
                        shift.discrepancy === 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                      )}>
                        {shift.discrepancy > 0 ? '+' : ''}{shift.discrepancy.toFixed(2)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {shift.status === 'closed' && (
                      <button 
                        onClick={() => handlePrintZReport(shift)}
                        className="p-2 text-[#1C8FFF] hover:bg-[#1C8FFF]/10 rounded-lg transition-colors"
                        title="طباعة تقرير Z"
                      >
                        <Printer size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredShifts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-content-muted font-bold">
                    لا توجد ورديات مطابقة للبحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Z-Report */}
      {selectedShift && (
        <div className="hidden print:block fixed inset-0 bg-white z-[200] p-8 text-black" dir="rtl" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6 border-b border-dashed border-gray-400 pb-4">
              <h1 className="text-2xl font-black mb-2">تقرير الوردية (Z-Report)</h1>
              <p className="text-sm">الموظف: {selectedShift.staffName}</p>
              <p className="text-sm">البداية: {new Date(selectedShift.startTime).toLocaleString('ar-SA')}</p>
              <p className="text-sm">النهاية: {selectedShift.endTime ? new Date(selectedShift.endTime).toLocaleString('ar-SA') : '-'}</p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between font-bold">
                <span>رصيد الافتتاح:</span>
                <span>{selectedShift.openingBalance.toFixed(2)} ر.س</span>
              </div>
              
              <div className="border-t border-gray-200 pt-2">
                <h3 className="font-black mb-2">المبيعات حسب طريقة الدفع</h3>
                <div className="flex justify-between text-sm">
                  <span>نقدي:</span>
                  <span>{selectedShift.totals?.cash.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>شبكة/بطاقة:</span>
                  <span>{selectedShift.totals?.card.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>تحويل بنكي:</span>
                  <span>{selectedShift.totals?.bank_transfer.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>آجل/أخرى:</span>
                  <span>{selectedShift.totals?.credit.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-200">
                  <span>إجمالي المبيعات:</span>
                  <span>{selectedShift.totals?.totalSales.toFixed(2) || 0} ر.س</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between text-sm text-[#EF4444]">
                  <span>إجمالي المرتجعات:</span>
                  <span>-{selectedShift.totals?.totalReturns?.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between text-sm text-[#EF4444]">
                  <span>المرتجعات النقدية:</span>
                  <span>-{selectedShift.totals?.cashReturns?.toFixed(2) || (selectedShift.totals as any)?.returns?.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between text-sm text-[#EF4444]">
                  <span>المصروفات (سحب نقدي):</span>
                  <span>-{selectedShift.totals?.expenses.toFixed(2) || 0} ر.س</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between text-sm">
                  <span>الضرائب المحصلة:</span>
                  <span>{selectedShift.totals?.taxes.toFixed(2) || 0} ر.س</span>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4 mt-4">
                <div className="flex justify-between font-black text-lg">
                  <span>المبلغ المتوقع في الدرج:</span>
                  <span>{selectedShift.expectedCash?.toFixed(2) || 0} ر.س</span>
                </div>
                <div className="flex justify-between font-black text-lg mt-2">
                  <span>المبلغ الفعلي (المدخل):</span>
                  <span>{selectedShift.actualCash?.toFixed(2) || 0} ر.س</span>
                </div>
                <div className={cn(
                  "flex justify-between font-black mt-2 pt-2 border-t border-dashed border-gray-400",
                  selectedShift.discrepancy === 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                )}>
                  <span>الفارق:</span>
                  <span>{selectedShift.discrepancy !== undefined ? (selectedShift.discrepancy > 0 ? '+' : '') + selectedShift.discrepancy.toFixed(2) : 0} ر.س</span>
                </div>
                {selectedShift.discrepancyReason && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-bold">السبب: </span>
                    {selectedShift.discrepancyReason}
                  </div>
                )}
              </div>
            </div>

            {selectedShift.payouts && selectedShift.payouts.length > 0 && (
              <div className="border-t border-gray-800 pt-4 mb-6">
                <h3 className="font-black mb-2">تفاصيل المصروفات</h3>
                {selectedShift.payouts.map(p => (
                  <div key={p.id} className="flex justify-between text-sm mb-1">
                    <span>{p.reason}</span>
                    <span>{p.amount.toFixed(2)} ر.س</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center mt-8 pt-4 border-t border-gray-400">
              <Branding className="scale-75 origin-center" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
