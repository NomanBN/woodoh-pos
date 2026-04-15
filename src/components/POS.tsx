import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  ShoppingCart, 
  Trash2, 
  CreditCard, 
  User, 
  Scissors,
  Package,
  Barcode,
  X,
  CheckCircle2,
  Ruler,
  Zap
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { InventoryItem, Customer, OrderItem, Order, PaymentMethod, OrderStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { useStaff } from '../contexts/StaffContext';
import VisualMeasurements from './VisualMeasurements';
import ThobeMeasurementSelector from './ThobeMeasurementSelector';
import Branding from './Branding';

export default function POS({ tenantId, shiftId }: { tenantId: string, shiftId?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isCustomOrderModalOpen, setIsCustomOrderModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const { currentStaff } = useStaff();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersSnap, inventorySnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), where('tenantId', '==', tenantId))),
          getDocs(query(collection(db, 'inventory'), where('tenantId', '==', tenantId)))
        ]);

        setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        setInventory(inventorySnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
      } catch (error) {
        console.error('Error fetching POS data:', error);
      }
    };
    fetchData();
  }, [tenantId]);

  const filteredInventory = inventory.filter(item => 
    item.category !== 'fabric' && // Assuming ready-made are not fabric. Or maybe we need a specific category?
    (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     item.barcode?.includes(searchQuery) || 
     item.sku?.includes(searchQuery))
  );

  const addToCart = (item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.type === 'ready_made' && i.itemId === item.id);
      if (existing) {
        return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        type: 'ready_made',
        itemId: item.id,
        name: item.name,
        price: item.pricePerUnit,
        quantity: 1
      }];
    });
  };

  const [customItemForm, setCustomItemForm] = useState<Partial<OrderItem>>({
    garmentType: 'ثوب سعودي',
    price: 0,
    quantity: 1,
    fabric: '',
    fabricId: ''
  });
  
  const [customMeasurements, setCustomMeasurements] = useState<any>({});

  const handleAddCustomItem = () => {
    if (!customItemForm.garmentType || !customItemForm.price || customItemForm.price <= 0) {
      alert('الرجاء إدخال نوع الثوب والسعر');
      return;
    }

    setCart(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      ...customItemForm,
      ...customMeasurements,
      type: 'custom',
      status: 'measurements_taken'
    } as OrderItem]);
    setIsCustomOrderModalOpen(false);
    
    // Reset form
    setCustomItemForm({
      garmentType: 'ثوب سعودي',
      price: 0,
      quantity: 1,
      fabric: '',
      fabricId: ''
    });
    setCustomMeasurements({});
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQuantity = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQuantity };
      }
      return i;
    }));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (!selectedCustomer) {
      alert('الرجاء اختيار عميل');
      return;
    }
    if (cart.length === 0) {
      alert('السلة فارغة');
      return;
    }

    setLoading(true);
    try {
      const hasCustom = cart.some(i => i.type === 'custom');
      const hasReadyMade = cart.some(i => i.type === 'ready_made');
      
      let orderStatus: OrderStatus | 'partial_delivered' = 'delivered';
      if (hasCustom && hasReadyMade) {
        orderStatus = 'partial_delivered';
      } else if (hasCustom) {
        orderStatus = 'measurements_taken';
      }

      const orderData: Omit<Order, 'id'> = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        tenantId,
        shiftId,
        items: cart,
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
        paymentMethod,
        status: orderStatus,
        orderDate: new Date().toISOString(),
        deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
        createdBy: currentStaff?.name || 'System',
        history: [{
          status: orderStatus as OrderStatus,
          updatedAt: new Date().toISOString(),
          updatedBy: currentStaff?.name || 'System',
          updatedByUid: currentStaff?.id
        }]
      };

      await addDoc(collection(db, 'orders'), {
        ...orderData,
        createdAt: serverTimestamp()
      });

      // Deduct inventory for ready-made items and reserved fabric
      for (const item of cart) {
        if (item.type === 'ready_made' && item.itemId) {
          const itemRef = doc(db, 'inventory', item.itemId);
          await updateDoc(itemRef, {
            quantity: increment(-item.quantity)
          });
        } else if (item.type === 'custom' && item.fabricId && item.consumedMeters) {
          const fabricRef = doc(db, 'inventory', item.fabricId);
          await updateDoc(fabricRef, {
            quantity: increment(-item.consumedMeters)
          });
        }
      }

      setCart([]);
      setSelectedCustomer(null);
      setIsPaymentModalOpen(false);
      setPaidAmount(0);
      alert('تم إتمام الطلب بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
      alert('حدث خطأ أثناء إتمام الطلب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 font-sans p-6">
      {/* Left Side: Products & Search */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
            <input
              type="text"
              placeholder="ابحث عن منتج جاهز أو امسح الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
            />
            <button className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-brand transition-colors">
              <Barcode size={20} />
            </button>
          </div>
          <button
            onClick={() => setIsCustomOrderModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl hover:bg-brand/90 transition-colors font-medium shadow-sm"
          >
            <Scissors size={20} />
            تفصيل جديد
          </button>
        </div>

        <div className="flex-1 bg-surface border border-border rounded-2xl p-6 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredInventory.map(item => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="flex flex-col items-center p-4 border border-border rounded-xl hover:border-brand hover:shadow-md transition-all group"
              >
                <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Package size={32} className="text-content-muted group-hover:text-brand" />
                </div>
                <span className="font-medium text-content text-center line-clamp-2 mb-1">{item.name}</span>
                <span className="text-brand font-bold">{formatCurrency(item.pricePerUnit)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side: Cart */}
      <div className="w-full md:w-96 bg-surface border border-border rounded-2xl flex flex-col shadow-sm">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-content flex items-center gap-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            <ShoppingCart size={24} className="text-brand" />
            سلة المشتريات
          </h2>
        </div>

        <div className="p-4 border-b border-border">
          <select
            className="w-full p-3 bg-surface-muted border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand"
            value={selectedCustomer?.id || ''}
            onChange={(e) => {
              const customer = customers.find(c => c.id === e.target.value);
              setSelectedCustomer(customer || null);
            }}
          >
            <option value="">اختر العميل...</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {focusedItemId && (
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
              onClick={() => setFocusedItemId(null)}
            />
          )}
          {cart.map(item => (
            <div 
              key={item.id} 
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                setFocusedItemId(focusedItemId === item.id ? null : item.id!);
              }}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                focusedItemId === item.id 
                  ? "border-brand ring-2 ring-brand shadow-2xl z-50 relative bg-white scale-[1.02]" 
                  : "bg-surface-muted border-border hover:border-brand/50",
                focusedItemId && focusedItemId !== item.id ? "opacity-40" : ""
              )}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {item.type === 'custom' ? (
                    <span className="px-2 py-0.5 bg-[#1C8FFF]/10 text-[#1C8FFF] text-xs font-bold rounded-md flex items-center gap-1">
                      <Scissors size={12} />
                      تفصيل
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#6B7280]/10 text-[#6B7280] text-xs font-bold rounded-md flex items-center gap-1">
                      <Package size={12} />
                      جاهز
                    </span>
                  )}
                  <span className="font-medium text-content line-clamp-1" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                    {item.type === 'custom' ? item.garmentType : item.name}
                  </span>
                </div>
                <div className="text-brand font-bold">{formatCurrency(item.price)}</div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-surface border border-border rounded-lg p-1">
                  <button onClick={() => updateQuantity(item.id!, -1)} className="w-6 h-6 flex items-center justify-center hover:bg-surface-muted rounded">-</button>
                  <span className="w-6 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id!, 1)} className="w-6 h-6 flex items-center justify-center hover:bg-surface-muted rounded">+</button>
                </div>
                <button onClick={() => removeFromCart(item.id!)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-content-muted space-y-2">
              <ShoppingCart size={48} className="opacity-20" />
              <p>السلة فارغة</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border bg-surface-muted/50 rounded-b-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-content-muted font-medium">الإجمالي</span>
            <span className="text-2xl font-bold text-content">{formatCurrency(totalAmount)}</span>
          </div>
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={cart.length === 0 || !selectedCustomer}
            className="w-full py-4 bg-brand text-white rounded-xl font-bold text-lg hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
          >
            <CreditCard size={24} />
            الدفع وإتمام الطلب
          </button>
          
          <div className="mt-4 flex justify-center">
            <Branding className="opacity-60 scale-90" />
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-surface rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-content">إتمام الدفع</h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-surface-muted rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-content mb-2">طريقة الدفع</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'cash', label: 'كاش', icon: CreditCard },
                    { id: 'network', label: 'شبكة', icon: CreditCard },
                    { id: 'partial', label: 'عربون', icon: CreditCard }
                  ].map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                      className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                        paymentMethod === method.id
                          ? "border-brand bg-brand/5 text-brand font-medium"
                          : "border-border hover:border-brand/50 text-content-muted"
                      )}
                    >
                      <method.icon size={18} />
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-2">المبلغ المدفوع</label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  className="w-full p-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>

              <div className="flex justify-between items-center p-4 bg-surface-muted rounded-xl">
                <span className="font-medium text-content">المتبقي:</span>
                <span className="font-bold text-red-600">{formatCurrency(totalAmount - paidAmount)}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'جاري التنفيذ...' : (
                  <>
                    <CheckCircle2 size={20} />
                    تأكيد الطلب
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Order Modal */}
      {isCustomOrderModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-surface rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-content flex items-center gap-2">
                <Scissors size={24} className="text-brand" />
                تفصيل جديد
              </h2>
              <button onClick={() => setIsCustomOrderModalOpen(false)} className="p-2 hover:bg-surface-muted rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content mb-2">نوع الثوب</label>
                  <input 
                    type="text" 
                    value={customItemForm.garmentType}
                    onChange={(e) => setCustomItemForm({...customItemForm, garmentType: e.target.value})}
                    className="w-full p-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content mb-2">السعر</label>
                  <input 
                    type="number" 
                    value={customItemForm.price}
                    onChange={(e) => setCustomItemForm({...customItemForm, price: Number(e.target.value)})}
                    className="w-full p-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content mb-2">القماش</label>
                  <select 
                    value={customItemForm.fabricId}
                    onChange={(e) => {
                      const fabric = inventory.find(i => i.id === e.target.value);
                      setCustomItemForm({
                        ...customItemForm, 
                        fabricId: e.target.value,
                        fabric: fabric?.name || ''
                      });
                    }}
                    className="w-full p-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand"
                  >
                    <option value="">اختر قماش...</option>
                    {inventory.filter(i => i.category === 'fabric').map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>
                    ))}
                    <option value="custom">قماش خارجي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content mb-2">الكمية</label>
                  <input 
                    type="number" 
                    value={customItemForm.quantity}
                    onChange={(e) => setCustomItemForm({...customItemForm, quantity: Number(e.target.value)})}
                    className="w-full p-3 bg-surface border border-border rounded-xl focus:ring-2 focus:ring-brand focus:border-brand" 
                    min="1"
                  />
                </div>
              </div>

              {selectedCustomer && (
                <div className="bg-brand/5 p-4 rounded-xl border border-brand/10 space-y-4">
                  <div className="flex items-center gap-2 text-brand mb-2">
                    <Ruler size={18} />
                    <h4 className="font-bold text-sm">مقاسات العميل المحددة</h4>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'الطول', value: selectedCustomer.measurements?.length },
                      { label: 'الكتف', value: selectedCustomer.measurements?.shoulder },
                      { label: 'الصدر', value: selectedCustomer.measurements?.chest },
                      { label: 'الكم', value: selectedCustomer.measurements?.sleeve },
                    ].map((m) => (
                      <div key={m.label} className="bg-surface p-2 rounded-lg border border-brand/10 text-center">
                        <p className="text-[10px] text-content-muted">{m.label}</p>
                        <p className="text-sm font-bold text-brand">{m.value || '-'}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-content-muted mt-2 flex items-center gap-1">
                    <Zap size={12} />
                    سيتم إرفاق المقاسات الحالية للعميل مع هذا الطلب تلقائياً.
                  </p>
                </div>
              )}

              <div className="space-y-4 border-t border-border pt-6">
                <h4 className="text-sm font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
                  <Zap size={16} />
                  التفاصيل البصرية والمقاسات التفاعلية
                </h4>
                <VisualMeasurements 
                  values={customMeasurements} 
                  onChange={(field, val) => setCustomMeasurements({...customMeasurements, [field]: val})} 
                />
                
                <div className="mt-8 pt-8 border-t border-border">
                  <h3 className="text-sm font-black text-content flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-brand rounded-full" />
                    مُحدد المقاسات البصري التفاعلي
                  </h3>
                  <ThobeMeasurementSelector 
                    values={customMeasurements.thobeMeasurements || {
                      collar: 0,
                      chest: 0,
                      shoulders: 0,
                      sleeves: 0,
                      length: 0,
                      bottomWidth: 0
                    }}
                    onChange={(newMeasurements) => setCustomMeasurements({...customMeasurements, thobeMeasurements: newMeasurements})}
                  />
                </div>
              </div>

              <button
                onClick={handleAddCustomItem}
                className="w-full py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand/90 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                إضافة للسلة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
