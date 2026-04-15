import React, { useState } from 'react';
import { Plus, Package, CheckCircle2, Clock, Trash2, X } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier, PurchaseOrder, InventoryItem, PurchaseOrderItem } from '../types';
import { cn } from '../lib/utils';

export default function PurchaseOrders({ 
  tenantId, 
  suppliers, 
  purchaseOrders, 
  inventory 
}: { 
  tenantId: string, 
  suppliers: Supplier[], 
  purchaseOrders: PurchaseOrder[],
  inventory: InventoryItem[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState(0);
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

  const handleCreatePO = async () => {
    if (!selectedSupplier || items.length === 0) return;
    setIsSubmitting(true);
    try {
      const supplier = suppliers.find(s => s.id === selectedSupplier);
      const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

      await addDoc(collection(db, 'purchaseOrders'), {
        supplierId: selectedSupplier,
        supplierName: supplier?.name || '',
        tenantId,
        branchId: 'main', // Assuming main warehouse for now
        items,
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        status: 'draft',
        orderDate: new Date().toISOString(),
        createdBy: 'system', // Replace with actual user
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setIsModalOpen(false);
      setItems([]);
      setSelectedSupplier('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchaseOrders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReceivePO = async (po: PurchaseOrder) => {
    if (!confirm('هل أنت متأكد من استلام هذا الطلب؟ سيتم تحديث المخزون وحساب التكلفة تلقائياً.')) return;
    
    try {
      // 1. Update PO status
      await updateDoc(doc(db, 'purchaseOrders', po.id), {
        status: 'received',
        receivedDate: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      // 2. Update Supplier Balance
      await updateDoc(doc(db, 'suppliers', po.supplierId), {
        balance: increment(po.totalAmount)
      });

      // 3. Update Inventory & Moving Average Cost
      for (const item of po.items) {
        const invItem = inventory.find(i => i.id === item.itemId);
        if (invItem) {
          const oldTotalCost = invItem.quantity * invItem.pricePerUnit;
          const newTotalCost = item.total;
          const newQuantity = invItem.quantity + item.baseQuantity;
          const newAverageCost = (oldTotalCost + newTotalCost) / newQuantity;

          await updateDoc(doc(db, 'inventory', item.itemId), {
            quantity: increment(item.baseQuantity),
            pricePerUnit: newAverageCost,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'purchaseOrders');
    }
  };

  return (
    <div className="space-y-6 font-sans" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">أوامر الشراء</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1C8FFF] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-[#1C8FFF]/90 transition-colors"
        >
          <Plus size={20} />
          <span>إنشاء أمر شراء</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {purchaseOrders.map(po => (
          <div key={po.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold text-lg text-gray-800">{po.supplierName}</span>
                <span className={cn(
                  "px-2 py-1 rounded-md text-xs font-bold",
                  po.status === 'received' ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-amber-500/10 text-amber-600"
                )}>
                  {po.status === 'received' ? 'تم الاستلام' : 'مسودة / قيد الانتظار'}
                </span>
              </div>
              <p className="text-sm text-gray-500">التاريخ: {new Date(po.orderDate).toLocaleDateString('ar-SA')}</p>
              <p className="text-sm text-gray-500">الإجمالي: <span className="font-bold text-[#1C8FFF]">{po.totalAmount.toLocaleString()} ﷼</span></p>
            </div>
            
            {po.status !== 'received' && (
              <button 
                onClick={() => handleReceivePO(po)}
                className="bg-[#22C55E] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-[#22C55E]/90 transition-colors"
              >
                <CheckCircle2 size={20} />
                <span>تأكيد الاستلام</span>
              </button>
            )}
          </div>
        ))}
        {purchaseOrders.length === 0 && (
          <div className="p-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <Package className="mx-auto mb-4 opacity-20" size={48} />
            <p>لا توجد أوامر شراء</p>
          </div>
        )}
      </div>

      {/* Create PO Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">إنشاء أمر شراء جديد</h2>
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
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-700">إضافة أصناف</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <select 
                      value={selectedItem}
                      onChange={(e) => setSelectedItem(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                    >
                      <option value="">اختر الصنف...</option>
                      {inventory.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input 
                      type="number" 
                      placeholder="الكمية"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                    />
                  </div>
                  <div>
                    <input 
                      type="number" 
                      placeholder="السعر للوحدة"
                      value={pricePerUnit || ''}
                      onChange={(e) => setPricePerUnit(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1C8FFF] outline-none"
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
                          <td className="p-3 font-bold text-[#1C8FFF]">{item.total} ﷼</td>
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
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="text-lg font-bold text-gray-800">
                الإجمالي: <span className="text-[#1C8FFF]">{items.reduce((sum, item) => sum + item.total, 0).toLocaleString()} ﷼</span>
              </div>
              <button 
                onClick={handleCreatePO}
                disabled={isSubmitting || items.length === 0 || !selectedSupplier}
                className="bg-[#1C8FFF] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#1C8FFF]/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ أمر الشراء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
