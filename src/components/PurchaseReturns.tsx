import React, { useState } from 'react';
import { Plus, ExternalLink, Trash2, X } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier, PurchaseReturn, InventoryItem, PurchaseOrderItem } from '../types';
import { cn } from '../lib/utils';

export default function PurchaseReturns({ 
  tenantId, 
  suppliers, 
  purchaseReturns, 
  inventory 
}: { 
  tenantId: string, 
  suppliers: Supplier[], 
  purchaseReturns: PurchaseReturn[],
  inventory: InventoryItem[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState(0);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddItem = () => {
    const invItem = inventory.find(i => i.id === selectedItem);
    if (!invItem) return;

    const newItem: PurchaseOrderItem = {
      itemId: invItem.id,
      name: invItem.name,
      quantity,
      unit: invItem.unit,
      conversionRate: invItem.conversionRate,
      baseQuantity: quantity * invItem.conversionRate,
      pricePerUnit,
      total: quantity * pricePerUnit
    };

    setItems([...items, newItem]);
    setSelectedItem('');
    setQuantity(1);
    setPricePerUnit(0);
  };

  const handleCreateReturn = async () => {
    if (!selectedSupplier || items.length === 0) return;
    setIsSubmitting(true);
    try {
      const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

      // 1. Create Return Record
      await addDoc(collection(db, 'purchaseReturns'), {
        purchaseOrderId: 'manual', // Can be linked to specific PO later
        supplierId: selectedSupplier,
        tenantId,
        branchId: 'main',
        items,
        totalAmount,
        reason,
        returnDate: new Date().toISOString(),
        createdBy: 'system',
        createdAt: serverTimestamp()
      });

      // 2. Reduce Supplier Balance (Debt)
      await updateDoc(doc(db, 'suppliers', selectedSupplier), {
        balance: increment(-totalAmount)
      });

      // 3. Deduct Inventory
      for (const item of items) {
        await updateDoc(doc(db, 'inventory', item.itemId), {
          quantity: increment(-item.baseQuantity),
          updatedAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      setItems([]);
      setSelectedSupplier('');
      setReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchaseReturns');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">مرتجعات المشتريات</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1C8FFF] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-[#1C8FFF]/90 transition-colors"
        >
          <Plus size={20} />
          <span>إرجاع بضاعة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {purchaseReturns.map(ret => {
          const supplier = suppliers.find(s => s.id === ret.supplierId);
          return (
            <div key={ret.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold text-lg text-gray-800">{supplier?.name || 'مورد غير معروف'}</span>
                  <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-500/10 text-red-600">
                    مرتجع
                  </span>
                </div>
                <p className="text-sm text-gray-500">التاريخ: {new Date(ret.returnDate).toLocaleDateString('ar-SA')}</p>
                <p className="text-sm text-gray-500">السبب: {ret.reason}</p>
                <p className="text-sm text-gray-500 mt-2">قيمة المرتجع: <span className="font-bold text-red-600">{ret.totalAmount.toLocaleString()} ﷼</span></p>
              </div>
            </div>
          );
        })}
        {purchaseReturns.length === 0 && (
          <div className="p-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <ExternalLink className="mx-auto mb-4 opacity-20" size={48} />
            <p>لا توجد مرتجعات</p>
          </div>
        )}
      </div>

      {/* Create Return Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">إرجاع بضاعة لمورد</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">المورد</label>
                <select 
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-700">إضافة أصناف للإرجاع</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <select 
                      value={selectedItem}
                      onChange={(e) => setSelectedItem(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    >
                      <option value="">اختر الصنف...</option>
                      {inventory.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.unit}) - متاح: {i.quantity}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input 
                      type="number" 
                      placeholder="الكمية"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div>
                    <input 
                      type="number" 
                      placeholder="السعر للوحدة"
                      value={pricePerUnit || ''}
                      onChange={(e) => setPricePerUnit(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleAddItem}
                  disabled={!selectedItem || quantity <= 0 || pricePerUnit <= 0}
                  className="w-full bg-gray-200 text-gray-700 py-2 rounded-xl font-bold hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  إضافة للقائمة
                </button>
              </div>

              {items.length > 0 && (
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="p-3 font-medium">الصنف</th>
                        <th className="p-3 font-medium">الكمية</th>
                        <th className="p-3 font-medium">السعر</th>
                        <th className="p-3 font-medium">الإجمالي</th>
                        <th className="p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3">{item.name}</td>
                          <td className="p-3">{item.quantity} {item.unit}</td>
                          <td className="p-3">{item.pricePerUnit} ﷼</td>
                          <td className="p-3 font-bold text-red-600">{item.total} ﷼</td>
                          <td className="p-3 text-left">
                            <button 
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:bg-red-50 p-1 rounded-md"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">سبب الإرجاع</label>
                <textarea 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none h-24 resize-none"
                  placeholder="مثال: قماش تالف، عيوب مصنعية..."
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="text-lg font-bold text-gray-800">
                إجمالي المرتجع: <span className="text-red-600">{items.reduce((sum, item) => sum + item.total, 0).toLocaleString()} ﷼</span>
              </div>
              <button 
                onClick={handleCreateReturn}
                disabled={isSubmitting || items.length === 0 || !selectedSupplier}
                className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'تأكيد الإرجاع'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
