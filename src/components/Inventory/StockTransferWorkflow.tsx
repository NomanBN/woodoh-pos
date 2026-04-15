import React, { useState, useEffect } from 'react';
import { 
  ArrowRightLeft, 
  Clock, 
  Truck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronRight,
  User,
  Calendar,
  Package,
  ArrowRight,
  MoreVertical,
  Search,
  Filter,
  Check,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  writeBatch,
  getDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { StockTransfer, Branch, BranchInventory, StockLedger, InventoryItem } from '../../types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import Branding from '../Branding';

interface StockTransferWorkflowProps {
  tenantId: string;
}

const StockTransferWorkflow: React.FC<StockTransferWorkflowProps> = ({ tenantId }) => {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const q = query(
      collection(db, 'stock_transfers'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransfer)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stock_transfers');
    });

    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    const q = query(collection(db, 'branches'), where('tenantId', '==', tenantId));
    const unsub = onSnapshot(q, (snapshot) => {
      setBranches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch)));
    });
    return () => unsub();
  }, [tenantId]);

  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  const handleShip = async (transfer: StockTransfer) => {
    try {
      const batch = writeBatch(db);
      
      // 1. Deduct from source branch inventory
      for (const item of transfer.items) {
        const stockRef = doc(db, 'branch_inventory', `${transfer.fromBranchId}_${item.itemId}`);
        const stockSnap = await getDoc(stockRef);
        
        if (stockSnap.exists()) {
          const currentQty = stockSnap.data().quantity;
          batch.update(stockRef, {
            quantity: currentQty - item.requestedQuantity,
            updatedAt: new Date().toISOString()
          });

          // 2. Add to Stock Ledger (Reduction)
          const ledgerRef = doc(collection(db, 'stock_ledger'));
          batch.set(ledgerRef, {
            itemId: item.itemId,
            branchId: transfer.fromBranchId,
            type: 'transfer_out',
            previousQuantity: currentQty,
            newQuantity: currentQty - item.requestedQuantity,
            change: -item.requestedQuantity,
            referenceId: transfer.id,
            staffId: auth.currentUser?.uid,
            staffName: auth.currentUser?.displayName || 'Staff',
            tenantId,
            createdAt: new Date().toISOString()
          });
        }
      }

      // 3. Update transfer status to in_transit
      batch.update(doc(db, 'stock_transfers', transfer.id), {
        status: 'in_transit',
        shippedBy: auth.currentUser?.uid,
        shippedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: transfer.items.map(i => ({ ...i, shippedQuantity: i.requestedQuantity }))
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'stock_transfers');
    }
  };

  const handleReceive = async (transfer: StockTransfer, receivedQuantities: Record<string, number>, remarks: string) => {
    try {
      const batch = writeBatch(db);
      
      for (const item of transfer.items) {
        const receivedQty = receivedQuantities[item.itemId];
        const stockRef = doc(db, 'branch_inventory', `${transfer.toBranchId}_${item.itemId}`);
        const stockSnap = await getDoc(stockRef);
        
        const currentQty = stockSnap.exists() ? stockSnap.data().quantity : 0;
        
        // 1. Add to destination branch inventory
        if (stockSnap.exists()) {
          batch.update(stockRef, {
            quantity: currentQty + receivedQty,
            updatedAt: new Date().toISOString()
          });
        } else {
          batch.set(stockRef, {
            branchId: transfer.toBranchId,
            itemId: item.itemId,
            quantity: receivedQty,
            tenantId,
            updatedAt: new Date().toISOString()
          });
        }

        // 2. Add to Stock Ledger (Addition)
        const ledgerRef = doc(collection(db, 'stock_ledger'));
        batch.set(ledgerRef, {
          itemId: item.itemId,
          branchId: transfer.toBranchId,
          type: 'transfer_in',
          previousQuantity: currentQty,
          newQuantity: currentQty + receivedQty,
          change: receivedQty,
          referenceId: transfer.id,
          staffId: auth.currentUser?.uid,
          staffName: auth.currentUser?.displayName || 'Staff',
          tenantId,
          createdAt: new Date().toISOString()
        });

        // 3. Handle Discrepancy (if any)
        const discrepancy = (item.shippedQuantity || 0) - receivedQty;
        if (discrepancy > 0) {
          const discLedgerRef = doc(collection(db, 'stock_ledger'));
          batch.set(discLedgerRef, {
            itemId: item.itemId,
            branchId: transfer.toBranchId,
            type: 'adjustment',
            previousQuantity: currentQty + receivedQty,
            newQuantity: currentQty + receivedQty,
            change: -discrepancy,
            notes: 'Discrepancy during transfer',
            referenceId: transfer.id,
            staffId: auth.currentUser?.uid,
            staffName: auth.currentUser?.displayName || 'Staff',
            tenantId,
            createdAt: new Date().toISOString()
          });
        }
      }

      // 4. Update transfer status to completed
      batch.update(doc(db, 'stock_transfers', transfer.id), {
        status: 'completed',
        receivedBy: auth.currentUser?.uid,
        receivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        remarks: remarks || null,
        items: transfer.items.map(i => ({ ...i, receivedQuantity: receivedQuantities[i.itemId] }))
      });

      await batch.commit();
      setSelectedTransfer(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'stock_transfers');
    }
  };

  const statusMap: Record<string, { label: string, color: string, icon: any }> = {
    pending: { label: t('inventory.status_pending'), color: 'bg-amber-50 text-amber-600', icon: Clock },
    in_transit: { label: t('inventory.status_in_transit'), color: 'bg-blue-50 text-blue-600', icon: Truck },
    completed: { label: t('inventory.status_completed'), color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
    rejected: { label: t('inventory.status_rejected'), color: 'bg-rose-50 text-rose-600', icon: XCircle }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <ArrowRightLeft className="text-indigo-600" size={32} />
            {t('inventory.transfers_title')}
          </h1>
          <p className="text-gray-500 font-medium mt-1">{t('inventory.transfers_subtitle')}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
        <Filter className="text-gray-400" size={20} />
        <div className="flex gap-2">
          {['all', 'pending', 'in_transit', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                filterStatus === status 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              )}
            >
              {status === 'all' ? t('common.all') : t(`inventory.status_${status}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {transfers
          .filter(t => filterStatus === 'all' || t.status === filterStatus)
          .map((transfer) => {
            const status = statusMap[transfer.status] || statusMap.pending;
            const StatusIcon = status.icon;
            
            return (
              <motion.div 
                key={transfer.id}
                layout
                className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden"
              >
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className={cn("p-4 rounded-2xl", status.color)}>
                      <StatusIcon size={24} />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-gray-900">{getBranchName(transfer.fromBranchId)}</span>
                        <ArrowRight size={16} className="text-gray-300" />
                        <span className="text-sm font-black text-gray-900">{getBranchName(transfer.toBranchId)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1"><Package size={12} /> {transfer.items.length} {t('inventory.items')}</span>
                        <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(transfer.createdAt).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1"><User size={12} /> {transfer.requestedByName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {transfer.status === 'pending' && (
                      <button 
                        onClick={() => handleShip(transfer)}
                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                      >
                        {t('inventory.ship_items')}
                      </button>
                    )}
                    {transfer.status === 'in_transit' && (
                      <button 
                        onClick={() => setSelectedTransfer(transfer)}
                        className="bg-[#22C55E] text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-100"
                      >
                        {t('inventory.receive_items')}
                      </button>
                    )}
                    <button 
                      onClick={() => setSelectedTransfer(transfer)}
                      className="bg-gray-50 text-gray-600 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
                    >
                      {t('common.details')}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
      </div>

      <AnimatePresence>
        {selectedTransfer && (
          <TransferDetailsModal 
            transfer={selectedTransfer} 
            onClose={() => setSelectedTransfer(null)} 
            onReceive={handleReceive}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const TransferDetailsModal = ({ transfer, onClose, onReceive }: any) => {
  const { t } = useTranslation();
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>(
    transfer.items.reduce((acc: any, item: any) => ({ ...acc, [item.itemId]: item.shippedQuantity || item.requestedQuantity }), {})
  );
  const [remarks, setRemarks] = useState(transfer.remarks || '');

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
        className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
              <Package size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">{t('inventory.transfer_details')}</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">ID: {transfer.id.substring(0, 8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('inventory.from')}</h3>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="font-black text-gray-900">{transfer.fromBranchId}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{t('inventory.source_location')}</p>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('inventory.to')}</h3>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="font-black text-gray-900">{transfer.toBranchId}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{t('inventory.destination_location')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('inventory.items_list')}</h3>
            <div className="space-y-3">
              {transfer.items.map((item: any) => (
                <div key={item.itemId} className="p-5 bg-white border border-gray-100 rounded-3xl flex items-center justify-between group hover:border-indigo-100 transition-all">
                  <div>
                    <p className="font-black text-gray-900">{item.itemName}</p>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{t('inventory.requested')}</p>
                      <p className="font-black text-gray-900">{item.requestedQuantity}</p>
                    </div>
                    
                    {transfer.status === 'in_transit' ? (
                      <div className="text-center">
                        <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">{t('inventory.receiving')}</p>
                        <input 
                          type="number"
                          value={receivedQuantities[item.itemId]}
                          onChange={e => setReceivedQuantities({...receivedQuantities, [item.itemId]: Number(e.target.value)})}
                          className="w-20 px-3 py-1.5 bg-indigo-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-black text-center text-indigo-600"
                        />
                      </div>
                    ) : (
                      <>
                        {item.shippedQuantity && (
                          <div className="text-center">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{t('inventory.shipped')}</p>
                            <p className="font-black text-gray-900">{item.shippedQuantity}</p>
                          </div>
                        )}
                        {item.receivedQuantity && (
                          <div className="text-center">
                            <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">{t('inventory.received')}</p>
                            <p className="font-black text-emerald-600">{item.receivedQuantity}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {transfer.status === 'in_transit' && (
            <div className="space-y-4">
              <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4">
                <AlertTriangle className="text-amber-600 shrink-0" size={24} />
                <div>
                  <p className="text-sm font-black text-amber-900 uppercase tracking-widest">{t('inventory.reconciliation_notice')}</p>
                  <p className="text-xs font-bold text-amber-700 mt-1 leading-relaxed">
                    {t('inventory.reconciliation_desc')}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ملاحظات الاستلام (اختياري)</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="أدخل أي ملاحظات حول الفروقات في الكميات المستلمة..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium resize-none h-24"
                />
              </div>
            </div>
          )}
          
          {transfer.remarks && transfer.status !== 'in_transit' && (
            <div className="space-y-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">ملاحظات الاستلام</h3>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-sm font-medium text-gray-900">{transfer.remarks}</p>
              </div>
            </div>
          )}
        </div>

        {transfer.status === 'in_transit' && (
          <div className="p-8 bg-gray-50 border-t border-gray-100">
            <button 
              onClick={() => onReceive(transfer, receivedQuantities, remarks)}
              className="w-full bg-[#22C55E] text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-green-100 hover:bg-green-600 transition-all flex items-center justify-center gap-3"
            >
              <CheckCircle2 size={24} />
              {t('inventory.confirm_reconciliation')}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default StockTransferWorkflow;
