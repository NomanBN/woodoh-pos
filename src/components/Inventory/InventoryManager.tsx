import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import * as XLSX from 'xlsx';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  ArrowRightLeft, 
  History, 
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Warehouse,
  Store,
  Barcode,
  Tag,
  TrendingUp,
  Layers,
  MoreVertical,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  writeBatch,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { 
  InventoryItem, 
  InventoryVariant, 
  Branch, 
  BranchInventory, 
  StockTransfer, 
  StockLedger,
  PermissionKey 
} from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { useStaff } from '../../contexts/StaffContext';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '../../lib/utils';
import Branding from '../Branding';

import StockTransferWorkflow from './StockTransferWorkflow';

interface InventoryManagerProps {
  tenantId: string;
}

const InventoryManager: React.FC<InventoryManagerProps> = ({ tenantId }) => {
  const { t } = useTranslation();
  const { currentStaff } = useStaff();
  const { hasPermission } = usePermissions(currentStaff);
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchStock, setBranchStock] = useState<Record<string, BranchInventory[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedItemForAdjustment, setSelectedItemForAdjustment] = useState<{item: InventoryItem, variant: InventoryVariant, branch: Branch} | null>(null);
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'reports' | 'transfers'>('inventory');
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);

  useEffect(() => {
    const lowStock = items.filter(item => {
      const totalStock = (Object.values(branchStock).flat() as BranchInventory[])
        .filter(bi => bi.itemId === item.id)
        .reduce((sum, bi) => sum + bi.quantity, 0);
      return totalStock <= (item.minThreshold || 0);
    });
    setLowStockItems(lowStock);
  }, [items, branchStock]);
  
  // Fetch Master Catalog
  useEffect(() => {
    const q = query(
      collection(db, 'inventory'),
      where('tenantId', '==', tenantId)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    
    return () => unsub();
  }, [tenantId]);

  // Fetch Branches
  useEffect(() => {
    const q = query(
      collection(db, 'branches'),
      where('tenantId', '==', tenantId)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setBranches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'branches');
    });
    
    return () => unsub();
  }, [tenantId]);

  // Fetch Branch Stock
  useEffect(() => {
    const q = query(
      collection(db, 'branch_inventory'),
      where('tenantId', '==', tenantId)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      const stock: Record<string, BranchInventory[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as BranchInventory;
        if (!stock[data.itemId]) stock[data.itemId] = [];
        stock[data.itemId].push({ id: doc.id, ...data });
      });
      setBranchStock(stock);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'branch_inventory');
    });
    
    return () => unsub();
  }, [tenantId]);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getStockForBranch = (itemId: string, branchId: string) => {
    return branchStock[itemId]?.find(s => s.branchId === branchId)?.quantity || 0;
  };

  const getTotalStock = (itemId: string) => {
    return branchStock[itemId]?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-content flex items-center gap-3">
            <Package className="text-brand" size={32} />
            {t('inventory.title')}
          </h1>
          <p className="text-content-muted font-medium mt-1">{t('inventory.subtitle')}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {hasPermission('inventory.create') && (
            <button 
              onClick={() => setShowOpeningBalanceModal(true)}
              className="flex items-center gap-2 bg-surface border-2 border-border px-5 py-2.5 rounded-2xl font-bold text-content-muted hover:border-emerald-500/20 hover:text-emerald-500 transition-all shadow-sm"
            >
              <Download size={20} />
              {t('inventory.opening_balance')}
            </button>
          )}
          {hasPermission('inventory.transfer') && (
            <button 
              onClick={() => setShowTransferModal(true)}
              className="flex items-center gap-2 bg-surface border-2 border-border px-5 py-2.5 rounded-2xl font-bold text-content-muted hover:border-brand/20 hover:text-brand transition-all shadow-sm"
            >
              <ArrowRightLeft size={20} />
              {t('inventory.transfer_stock')}
            </button>
          )}
          {hasPermission('inventory.create') && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-brand text-brand-content px-6 py-2.5 rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10"
            >
              <Plus size={20} />
              {t('inventory.add_item')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 bg-surface p-1.5 rounded-2xl border border-border w-fit">
        <button 
          onClick={() => setActiveTab('inventory')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold transition-all",
            activeTab === 'inventory' ? "bg-brand text-brand-content shadow-lg shadow-brand/10" : "text-content-muted hover:bg-surface-muted"
          )}
        >
          {t('inventory.stock_list')}
        </button>
        <button 
          onClick={() => setActiveTab('transfers')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold transition-all",
            activeTab === 'transfers' ? "bg-brand text-brand-content shadow-lg shadow-brand/10" : "text-content-muted hover:bg-surface-muted"
          )}
        >
          تحويلات المخزون
        </button>
        <button 
          onClick={() => setActiveTab('reports')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold transition-all",
            activeTab === 'reports' ? "bg-brand text-brand-content shadow-lg shadow-brand/10" : "text-content-muted hover:bg-surface-muted"
          )}
        >
          {t('inventory.reports')}
        </button>
      </div>

      {activeTab === 'inventory' && (
        <>
          {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-[2rem] border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand/10 text-brand rounded-2xl">
              <Layers size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-muted uppercase tracking-wider">{t('inventory.total_items')}</p>
              <p className="text-2xl font-black text-content">{items.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface p-6 rounded-[2rem] border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
              <Warehouse size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-muted uppercase tracking-wider">{t('inventory.warehouses')}</p>
              <p className="text-2xl font-black text-content">{branches.filter(b => b.type === 'warehouse').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface p-6 rounded-[2rem] border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
              <Store size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-muted uppercase tracking-wider">{t('inventory.branches')}</p>
              <p className="text-2xl font-black text-content">{branches.filter(b => b.type === 'store').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface p-6 rounded-[2rem] border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-muted uppercase tracking-wider">{t('inventory.low_stock')}</p>
              <p className="text-2xl font-black text-content">
                {items.filter(item => getTotalStock(item.id) <= item.minThreshold).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface p-4 rounded-[2rem] border border-border shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
          <input 
            type="text"
            placeholder={t('inventory.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-medium text-content"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-content-muted" size={20} />
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-surface-muted border-none rounded-2xl px-6 py-3 font-bold text-content-muted focus:ring-2 focus:ring-brand cursor-pointer"
          >
            <option value="all">{t('inventory.all_categories')}</option>
            <option value="fabric">{t('inventory.category_fabric')}</option>
            <option value="thread">{t('inventory.category_thread')}</option>
            <option value="button">{t('inventory.category_button')}</option>
            <option value="lining">{t('inventory.category_lining')}</option>
            <option value="other">{t('inventory.category_other')}</option>
          </select>
        </div>
      </div>

      {/* Master Catalog Table */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="bg-red-50 border border-red-100 rounded-3xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500 text-white rounded-xl">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-red-900">تنبيه: أصناف منخفضة المخزون</h4>
                  <p className="text-xs text-red-600 font-bold">يوجد {lowStockItems.length} أصناف وصلت للحد الأدنى</p>
                </div>
              </div>
              <div className="flex -space-x-2 rtl:space-x-reverse">
                {lowStockItems.slice(0, 3).map((item, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-white border-2 border-red-50 flex items-center justify-center text-[10px] font-black text-red-600 shadow-sm">
                    {item.name.substring(0, 1)}
                  </div>
                ))}
                {lowStockItems.length > 3 && (
                  <div className="w-8 h-8 rounded-full bg-red-100 border-2 border-red-50 flex items-center justify-center text-[10px] font-black text-red-600 shadow-sm">
                    +{lowStockItems.length - 3}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-surface rounded-[2.5rem] border border-border shadow-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-muted/50">
              <th className="px-8 py-6 text-xs font-black text-content-muted uppercase tracking-widest">{t('inventory.item_name')}</th>
              <th className="px-8 py-6 text-xs font-black text-content-muted uppercase tracking-widest">{t('inventory.category')}</th>
              <th className="px-8 py-6 text-xs font-black text-content-muted uppercase tracking-widest">{t('inventory.total_stock')}</th>
              <th className="px-8 py-6 text-xs font-black text-content-muted uppercase tracking-widest">{t('inventory.status')}</th>
              <th className="px-8 py-6 text-xs font-black text-content-muted uppercase tracking-widest text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((item) => {
              const totalStock = getTotalStock(item.id);
              const isLow = totalStock <= item.minThreshold;
              const isExpanded = expandedItem === item.id;
              
              return (
                <React.Fragment key={item.id}>
                  <tr className={cn(
                    "hover:bg-surface-muted/50 transition-colors group cursor-pointer",
                    isExpanded && "bg-brand/5"
                  )} onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-surface border border-border rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                          {isExpanded ? <ChevronDown size={20} className="text-brand" /> : <ChevronRight size={20} className="text-content-muted" />}
                        </div>
                        <div>
                          <p className="font-black text-content text-lg">{item.name}</p>
                          <p className="text-xs font-bold text-content-muted uppercase tracking-tighter">SKU: {item.sku || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-4 py-1.5 bg-surface-muted text-content-muted rounded-full text-xs font-black uppercase tracking-widest">
                        {t(`inventory.category_${item.category}`)}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-content text-lg">{totalStock}</p>
                        <p className="text-xs font-bold text-content-muted uppercase">{t(`inventory.unit_${item.unit}`)}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {isLow ? (
                        <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 px-4 py-1.5 rounded-full w-fit">
                          <AlertTriangle size={14} />
                          <span className="text-xs font-black uppercase tracking-widest">{t('inventory.status_low')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-4 py-1.5 rounded-full w-fit">
                          <CheckCircle2 size={14} />
                          <span className="text-xs font-black uppercase tracking-widest">{t('inventory.status_good')}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button className="p-2 hover:bg-surface rounded-xl transition-all border border-transparent hover:border-border hover:shadow-sm">
                        <MoreVertical size={20} className="text-content-muted" />
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expanded Branch View */}
                  <AnimatePresence>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="px-8 py-0">
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="py-6 space-y-6">
                              {/* Branch Summary */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {branches.map(branch => {
                                  const stock = getStockForBranch(item.id, branch.id);
                                  return (
                                    <div key={branch.id} className="bg-surface border border-border p-5 rounded-3xl flex items-center justify-between shadow-sm">
                                      <div className="flex items-center gap-3">
                                        <div className={cn(
                                          "p-2.5 rounded-xl",
                                          branch.type === 'warehouse' ? "bg-brand/10 text-brand" : "bg-amber-500/10 text-amber-500"
                                        )}>
                                          {branch.type === 'warehouse' ? <Warehouse size={18} /> : <Store size={18} />}
                                        </div>
                                        <div>
                                          <p className="font-black text-content text-sm">{branch.name}</p>
                                          <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest">{t(`inventory.type_${branch.type}`)}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-lg font-black text-content">{stock}</p>
                                        <p className="text-[10px] font-bold text-content-muted uppercase">{t(`inventory.unit_${item.unit}`)}</p>
                                        
                                        <div className="flex items-center justify-end gap-2 mt-2">
                                          {hasPermission('inventory.create') && (
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedItemForAdjustment({ item, branch });
                                                setShowAdjustmentModal(true);
                                              }}
                                              className="text-[9px] font-black text-emerald-600 hover:underline uppercase tracking-tighter"
                                            >
                                              {t('inventory.stock_in')}
                                            </button>
                                          )}
                                          {hasPermission('inventory.reconcile') && (
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedItemForAdjustment({ item, branch });
                                                setShowAdjustmentModal(true);
                                              }}
                                              className="text-[9px] font-black text-brand hover:underline uppercase tracking-tighter"
                                            >
                                              {t('inventory.adjust')}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

        </>
      )}

      {activeTab === 'transfers' && (
        <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
          <StockTransferWorkflow tenantId={tenantId} />
        </div>
      )}

      {activeTab === 'reports' && (
        <InventoryReports tenantId={tenantId} items={items} branches={branches} branchStock={branchStock} />
      )}

      {/* Modals Placeholder */}
      <AnimatePresence>
        {showAddModal && <AddItemModal onClose={() => setShowAddModal(false)} tenantId={tenantId} branches={branches} />}
        {showOpeningBalanceModal && <OpeningBalanceModal onClose={() => setShowOpeningBalanceModal(false)} tenantId={tenantId} branches={branches} items={items} />}
        {showTransferModal && <StockTransferModal onClose={() => setShowTransferModal(false)} tenantId={tenantId} branches={branches} items={items} branchStock={branchStock} />}
        {showAdjustmentModal && selectedItemForAdjustment && (
          <StockAdjustmentModal 
            onClose={() => {
              setShowAdjustmentModal(false);
              setSelectedItemForAdjustment(null);
            }}
            tenantId={tenantId}
            {...selectedItemForAdjustment}
          />
        )}
      </AnimatePresence>

      <div className="mt-12 opacity-30">
        <Branding />
      </div>
    </div>
  );
};

const AddItemModal = ({ onClose, tenantId, branches }: any) => {
  const { t } = useTranslation();
  const { currentStaff } = useStaff();
  const [formData, setFormData] = useState({
    name: '',
    category: 'fabric',
    unit: 'meter',
    baseUnit: 'meter',
    conversionRate: 1,
    minThreshold: 10,
    pricePerUnit: 0,
    sku: '',
    barcode: '',
    initialStock: 0
  });

  const generateSKU = (name: string) => {
    const prefix = name.substring(0, 3).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${random}`;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const itemData: Omit<InventoryItem, 'id'> = {
        name: formData.name,
        category: formData.category as any,
        unit: formData.unit as any,
        baseUnit: formData.baseUnit as any,
        conversionRate: formData.conversionRate,
        minThreshold: formData.minThreshold,
        pricePerUnit: formData.pricePerUnit,
        sku: formData.sku || generateSKU(formData.name),
        barcode: formData.barcode || Math.random().toString().substring(2, 12),
        quantity: formData.initialStock,
        tenantId,
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'inventory'), itemData);
      
      // Initialize stock for all branches
      const batch = writeBatch(db);
      const mainBranch = branches.find((b: any) => b.isMain) || branches[0];
      branches.forEach((branch: Branch) => {
        const stockRef = doc(db, 'branch_inventory', `${branch.id}_${docRef.id}`);
        const initialQty = (branch.id === mainBranch?.id) ? (formData.initialStock || 0) : 0;
        
        batch.set(stockRef, {
          branchId: branch.id,
          itemId: docRef.id,
          quantity: initialQty,
          tenantId,
          updatedAt: new Date().toISOString()
        });

        if (initialQty > 0) {
          const ledgerRef = doc(collection(db, 'stock_ledger'));
          batch.set(ledgerRef, {
            itemId: docRef.id,
            branchId: branch.id,
            type: 'addition',
            previousQuantity: 0,
            newQuantity: initialQty,
            change: initialQty,
            staffId: currentStaff?.id || '',
            staffName: currentStaff?.name || 'Staff',
            tenantId,
            createdAt: new Date().toISOString()
          });
        }
      });
      await batch.commit();
      
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'inventory');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-muted/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-brand text-brand-content rounded-2xl shadow-lg shadow-brand/10">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-content">{t('inventory.add_item')}</h2>
              <p className="text-xs text-content-muted font-bold uppercase tracking-widest">{t('inventory.master_catalog')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
            <X size={24} className="text-content-muted" />
          </button>
        </div>

        <form onSubmit={handleAdd} className="p-8 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.item_name')}</label>
              <input 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.category')}</label>
              <select 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as any})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content cursor-pointer"
              >
                <option value="fabric">{t('inventory.category_fabric')}</option>
                <option value="thread">{t('inventory.category_thread')}</option>
                <option value="button">{t('inventory.category_button')}</option>
                <option value="lining">{t('inventory.category_lining')}</option>
                <option value="accessories">إكسسوارات</option>
                <option value="other">{t('inventory.category_other')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.unit')}</label>
              <select 
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value as any})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content cursor-pointer"
              >
                <option value="meter">{t('inventory.unit_meter')}</option>
                <option value="yard">{t('inventory.unit_yard')}</option>
                <option value="roll">{t('inventory.unit_roll')}</option>
                <option value="bolt">طاقة (Bolt)</option>
                <option value="piece">{t('inventory.unit_piece')}</option>
                <option value="box">صندوق (Box)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">الوحدة الأساسية (Base Unit)</label>
              <select 
                value={formData.baseUnit}
                onChange={e => setFormData({...formData, baseUnit: e.target.value as any})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content cursor-pointer"
              >
                <option value="meter">متر (Meter)</option>
                <option value="piece">قطعة (Piece)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">معامل التحويل</label>
              <input 
                type="number"
                step="0.01"
                required
                value={formData.conversionRate}
                onChange={e => setFormData({...formData, conversionRate: Number(e.target.value)})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
                placeholder="كم وحدة أساسية في الوحدة الموردة؟"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.min_threshold')}</label>
              <input 
                type="number"
                required
                value={formData.minThreshold}
                onChange={e => setFormData({...formData, minThreshold: Number(e.target.value)})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.price_per_unit')}</label>
              <input 
                type="number"
                required
                value={formData.pricePerUnit}
                onChange={e => setFormData({...formData, pricePerUnit: Number(e.target.value)})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.sku')}</label>
              <input 
                placeholder="SKU (Auto)"
                value={formData.sku}
                onChange={e => setFormData({...formData, sku: e.target.value})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.barcode')}</label>
              <input 
                placeholder="Barcode (Auto)"
                value={formData.barcode}
                onChange={e => setFormData({...formData, barcode: e.target.value})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.initial_stock')}</label>
              <input 
                type="number"
                placeholder="0"
                value={formData.initialStock}
                onChange={e => setFormData({...formData, initialStock: Number(e.target.value)})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-brand text-brand-content py-4 rounded-2xl font-black text-lg shadow-xl shadow-brand/10 hover:bg-brand/90 transition-all mt-4"
          >
            {t('inventory.save_item')}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const StockTransferModal = ({ onClose, tenantId, branches, items, branchStock }: any) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    fromBranchId: '',
    toBranchId: '',
    items: [{ itemId: '', quantity: 0 }]
  });

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const transferData: Omit<StockTransfer, 'id'> = {
        fromBranchId: formData.fromBranchId,
        toBranchId: formData.toBranchId,
        items: formData.items.map(i => {
          const item = items.find((it: any) => it.id === i.itemId);
          return {
            itemId: i.itemId,
            itemName: item?.name || '',
            requestedQuantity: i.quantity
          };
        }),
        status: 'pending',
        requestedBy: auth.currentUser?.uid || '',
        requestedByName: auth.currentUser?.displayName || 'Staff',
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'stock_transfers'), transferData);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stock_transfers');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-muted/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-brand text-brand-content rounded-2xl shadow-lg shadow-brand/10">
              <ArrowRightLeft size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-content">{t('inventory.transfer_stock')}</h2>
              <p className="text-xs text-content-muted font-bold uppercase tracking-widest">{t('inventory.transfer_workflow')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors shadow-sm">
            <X size={24} className="text-content-muted" />
          </button>
        </div>

        <form onSubmit={handleCreateTransfer} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.from_location')}</label>
              <select 
                required
                value={formData.fromBranchId}
                onChange={e => setFormData({...formData, fromBranchId: e.target.value})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content cursor-pointer"
              >
                <option value="" className="bg-surface text-content">{t('common.select')}</option>
                {branches.map((b: Branch) => (
                  <option key={b.id} value={b.id} className="bg-surface text-content">{b.name} ({t(`inventory.type_${b.type}`)})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.to_location')}</label>
              <select 
                required
                value={formData.toBranchId}
                onChange={e => setFormData({...formData, toBranchId: e.target.value})}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content cursor-pointer"
              >
                <option value="" className="bg-surface text-content">{t('common.select')}</option>
                {branches.map((b: Branch) => (
                  <option key={b.id} value={b.id} className="bg-surface text-content">{b.name} ({t(`inventory.type_${b.type}`)})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-content uppercase tracking-widest">{t('inventory.transfer_items')}</h3>
              <button 
                type="button"
                onClick={() => setFormData({...formData, items: [...formData.items, { itemId: '', quantity: 0 }]})}
                className="text-xs font-black text-brand hover:text-brand/80 uppercase tracking-widest"
              >
                + {t('inventory.add_item')}
              </button>
            </div>

            {formData.items.map((item, idx) => (
              <div key={idx} className="p-4 bg-surface-muted rounded-2xl grid grid-cols-12 gap-4 items-end">
                <div className="col-span-9 space-y-1">
                  <label className="text-[10px] font-black text-content-muted uppercase tracking-widest">{t('inventory.item')}</label>
                  <select 
                    required
                    value={item.itemId}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx].itemId = e.target.value;
                      setFormData({...formData, items: newItems});
                    }}
                    className="w-full px-3 py-2 bg-surface border-none rounded-xl focus:ring-2 focus:ring-brand font-bold text-sm text-content cursor-pointer"
                  >
                    <option value="" className="bg-surface text-content">{t('common.select')}</option>
                    {items.map((it: InventoryItem) => (
                      <option key={it.id} value={it.id} className="bg-surface text-content">{it.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-content-muted uppercase tracking-widest">{t('inventory.qty')}</label>
                  <input 
                    type="number"
                    required
                    value={item.quantity}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx].quantity = Number(e.target.value);
                      setFormData({...formData, items: newItems});
                    }}
                    className="w-full px-3 py-2 bg-surface border-none rounded-xl focus:ring-2 focus:ring-brand font-bold text-sm text-content"
                  />
                </div>
                <div className="col-span-1 flex justify-center pb-2">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, items: formData.items.filter((_, i) => i !== idx)})}
                    className="text-rose-400 hover:text-rose-500"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button 
            type="submit"
            className="w-full bg-brand text-brand-content py-4 rounded-2xl font-black text-lg shadow-xl shadow-brand/10 hover:bg-brand/90 transition-all mt-4"
          >
            {t('inventory.create_transfer_request')}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const StockAdjustmentModal = ({ onClose, tenantId, item, branch }: any) => {
  const { t } = useTranslation();
  const { currentStaff } = useStaff();
  const [newQuantity, setNewQuantity] = useState(0);
  const [addQuantity, setAddQuantity] = useState(0);
  const [mode, setMode] = useState<'set' | 'add'>('add');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch current quantity to pre-fill
    const fetchCurrent = async () => {
      const stockRef = doc(db, 'branch_inventory', `${branch.id}_${item.id}`);
      const snap = await getDocs(query(collection(db, 'branch_inventory'), where('__name__', '==', stockRef.id)));
      if (!snap.empty) {
        setNewQuantity(snap.docs[0].data().quantity);
      }
    };
    fetchCurrent();
  }, [branch.id, item.id]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const stockRef = doc(db, 'branch_inventory', `${branch.id}_${item.id}`);
      const batch = writeBatch(db);

      // Get current quantity for ledger
      const snap = await getDocs(query(collection(db, 'branch_inventory'), where('__name__', '==', stockRef.id)));
      const currentQty = snap.empty ? 0 : snap.docs[0].data().quantity;

      const finalQuantity = mode === 'add' ? currentQty + addQuantity : newQuantity;

      // Update Stock
      batch.set(stockRef, {
        branchId: branch.id,
        itemId: item.id,
        quantity: finalQuantity,
        tenantId,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Create Ledger Entry
      const ledgerRef = doc(collection(db, 'stock_ledger'));
      const ledgerEntry: Omit<StockLedger, 'id'> = {
        itemId: item.id,
        branchId: branch.id,
        type: mode === 'add' ? 'addition' : 'adjustment',
        previousQuantity: currentQty,
        newQuantity: finalQuantity,
        change: finalQuantity - currentQty,
        staffId: currentStaff?.id || '',
        staffName: currentStaff?.name || 'Staff',
        tenantId,
        createdAt: new Date().toISOString()
      };
      batch.set(ledgerRef, ledgerEntry);

      await batch.commit();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'branch_inventory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="p-6 border-b border-border flex justify-between items-center bg-surface-muted/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500 text-white rounded-xl">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-content">{t('inventory.adjust_stock')}</h2>
              <p className="text-[10px] text-content-muted font-bold uppercase tracking-widest">{branch.name} • {item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X size={20} className="text-content-muted" />
          </button>
        </div>

        <form onSubmit={handleAdjust} className="p-6 space-y-6">
          <div className="flex p-1 bg-surface-muted rounded-2xl">
            <button 
              type="button"
              onClick={() => setMode('add')}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-black transition-all",
                mode === 'add' ? "bg-surface text-emerald-600 shadow-sm" : "text-content-muted"
              )}
            >
              {t('inventory.add_stock')}
            </button>
            <button 
              type="button"
              onClick={() => setMode('set')}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-black transition-all",
                mode === 'set' ? "bg-surface text-brand shadow-sm" : "text-content-muted"
              )}
            >
              {t('inventory.set_total')}
            </button>
          </div>

          {mode === 'add' ? (
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.quantity_to_add')}</label>
              <input 
                type="number"
                required
                autoFocus
                value={addQuantity}
                onChange={e => setAddQuantity(Number(e.target.value))}
                className="w-full px-4 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-black text-xl text-content"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.new_total_stock')}</label>
              <input 
                type="number"
                required
                autoFocus
                value={newQuantity}
                onChange={e => setNewQuantity(Number(e.target.value))}
                className="w-full px-4 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-black text-xl text-content"
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.adjustment_reason')}</label>
            <textarea 
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Damaged stock, Correction..."
              className="w-full px-4 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-sm text-content min-h-[100px]"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-brand-content py-4 rounded-2xl font-black text-lg shadow-xl shadow-brand/10 hover:bg-brand/90 transition-all disabled:opacity-50"
          >
            {loading ? t('common.saving') : t('common.save')}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const OpeningBalanceModal = ({ onClose, tenantId, branches, items }: any) => {
  const { t } = useTranslation();
  const { currentStaff } = useStaff();
  const [selectedBranch, setSelectedBranch] = useState('');
  const [stockEntries, setStockEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Map Excel data to stock entries
      // Expecting columns: SKU, Quantity
      const entries = data.map((row: any) => {
        const item = items.find((it: any) => it.sku === row.SKU);
        return {
          itemId: item?.id,
          sku: row.SKU,
          name: item?.name,
          quantity: Number(row.Quantity) || 0
        };
      }).filter(e => e.itemId);
      
      setStockEntries(entries);
    };
    reader.readAsBinaryString(file);
  };

  const handleSave = async () => {
    if (!selectedBranch) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      for (const entry of stockEntries) {
        const stockRef = doc(db, 'branch_inventory', `${selectedBranch}_${entry.itemId}`);
        batch.set(stockRef, {
          branchId: selectedBranch,
          itemId: entry.itemId,
          quantity: entry.quantity,
          tenantId,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Ledger entry
        const ledgerRef = doc(collection(db, 'stock_ledger'));
        batch.set(ledgerRef, {
          itemId: entry.itemId,
          branchId: selectedBranch,
          type: 'addition',
          previousQuantity: 0,
          newQuantity: entry.quantity,
          change: entry.quantity,
          staffId: currentStaff?.id || '',
          staffName: currentStaff?.name || 'Staff',
          tenantId,
          createdAt: new Date().toISOString()
        });
      }
      await batch.commit();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'branch_inventory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-muted/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/10">
              <Download size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-content">{t('inventory.opening_balance')}</h2>
              <p className="text-xs text-content-muted font-bold uppercase tracking-widest">{t('inventory.initial_stock_setup')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X size={24} className="text-content-muted" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.target_branch')}</label>
              <select 
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="w-full px-5 py-3 bg-surface-muted border-none rounded-2xl focus:ring-2 focus:ring-brand font-bold text-content"
              >
                <option value="">{t('common.select')}</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-content-muted uppercase tracking-widest ml-1">{t('inventory.import_excel')}</label>
              <div className="relative">
                <input 
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-full px-5 py-3 bg-brand/5 border-2 border-dashed border-brand/20 rounded-2xl flex items-center justify-center gap-2 text-brand font-bold">
                  <Download size={20} />
                  {t('inventory.choose_file')}
                </div>
              </div>
            </div>
          </div>

          {stockEntries.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-content uppercase tracking-widest">{t('inventory.preview_entries')} ({stockEntries.length})</h3>
              <div className="border border-border rounded-3xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-content-muted uppercase tracking-widest">{t('inventory.item')}</th>
                      <th className="px-6 py-4 text-[10px] font-black text-content-muted uppercase tracking-widest">{t('inventory.sku')}</th>
                      <th className="px-6 py-4 text-[10px] font-black text-content-muted uppercase tracking-widest">{t('inventory.qty')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stockEntries.slice(0, 10).map((entry, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4 text-sm font-bold text-content">{entry.name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-content-muted">{entry.sku}</td>
                        <td className="px-6 py-4 text-sm font-black text-content">{entry.quantity}</td>
                      </tr>
                    ))}
                    {stockEntries.length > 10 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-xs font-bold text-content-muted">
                          + {stockEntries.length - 10} {t('common.more_items')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button 
            onClick={handleSave}
            disabled={loading || !selectedBranch || stockEntries.length === 0}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-500/10 hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {loading ? t('common.saving') : t('inventory.confirm_opening_balance')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const InventoryReports = ({ tenantId, items, branches, branchStock }: any) => {
  const { t } = useTranslation();
  
  const categoryData = [
    { name: t('inventory.category_fabric'), value: items.filter((i: any) => i.category === 'fabric').length },
    { name: t('inventory.category_thread'), value: items.filter((i: any) => i.category === 'thread').length },
    { name: t('inventory.category_button'), value: items.filter((i: any) => i.category === 'button').length },
    { name: t('inventory.category_lining'), value: items.filter((i: any) => i.category === 'lining').length },
  ];

  const stockByBranch = branches.map((b: any) => ({
    name: b.name,
    stock: Object.values(branchStock).flat().filter((s: any) => s.branchId === b.id).reduce((sum: number, s: any) => sum + s.quantity, 0)
  }));

  const COLORS = ['#1C8FFF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="space-y-8">
      {/* Stock Movement Trend */}
      <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
        <h3 className="text-xl font-black text-content mb-8 flex items-center gap-3">
          <TrendingUp className="text-brand" />
          حركة المخزون (آخر 30 يوم)
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[
              { date: '2024-01-01', change: 10 },
              { date: '2024-01-02', change: -5 },
              { date: '2024-01-03', change: 15 },
              { date: '2024-01-04', change: -2 },
              { date: '2024-01-05', change: 8 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="change" stroke="#1C8FFF" strokeWidth={4} dot={{ r: 6, fill: '#1C8FFF' }} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stock by Category */}
        <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <h3 className="text-xl font-black text-content mb-8 flex items-center gap-3">
            <Tag className="text-brand" />
            {t('inventory.stock_by_category')}
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {categoryData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-xs font-bold text-content-muted">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stock by Branch */}
        <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
          <h3 className="text-xl font-black text-content mb-8 flex items-center gap-3">
            <Warehouse className="text-brand" />
            {t('inventory.stock_by_location')}
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockByBranch}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: 'rgba(28, 143, 255, 0.05)' }}
                />
                <Bar dataKey="stock" fill="#1C8FFF" radius={[8, 8, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Audit Trail Placeholder */}
      <div className="bg-surface p-8 rounded-[2.5rem] border border-border shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black text-content flex items-center gap-3">
            <History className="text-brand" />
            {t('inventory.audit_trail')}
          </h3>
          <button className="text-xs font-black text-brand hover:underline uppercase tracking-widest">
            {t('common.view_all')}
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-content-muted font-medium text-center py-12 bg-surface-muted rounded-3xl border-2 border-dashed border-border">
            {t('inventory.audit_trail_coming_soon')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default InventoryManager;
