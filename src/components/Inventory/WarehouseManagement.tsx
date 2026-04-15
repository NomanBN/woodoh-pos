import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  Store, 
  Plus, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  X,
  Building2,
  ShieldCheck,
  ArrowRightLeft
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Branch } from '../../types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import Branding from '../Branding';
import StockTransferWorkflow from './StockTransferWorkflow';

interface WarehouseManagementProps {
  tenantId: string;
}

const WarehouseManagement: React.FC<WarehouseManagementProps> = ({ tenantId }) => {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'branches'),
      where('tenantId', '==', tenantId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setBranches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'branches');
    });

    return () => unsub();
  }, [tenantId]);

  const handleSave = async (data: any) => {
    try {
      if (editingBranch) {
        await updateDoc(doc(db, 'branches', editingBranch.id), {
          ...data,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'branches'), {
          ...data,
          tenantId,
          createdAt: new Date().toISOString()
        });
      }
      setShowAddModal(false);
      setEditingBranch(null);
    } catch (error) {
      handleFirestoreError(error, editingBranch ? OperationType.UPDATE : OperationType.CREATE, 'branches');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <Building2 className="text-[#1C8FFF]" size={32} />
            إدارة الفروع والمواقع
          </h1>
          <p className="text-[#6B7280] font-medium mt-1">إدارة مواقع الفروع</p>
        </div>
        
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-[#1C8FFF] text-white px-6 py-2.5 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-100"
        >
          <Plus size={20} />
          {t('branches.add_location')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((branch) => (
          <motion.div 
            key={branch.id}
            layout
            className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden"
          >
            <div className="p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div className={cn(
                  "p-4 rounded-2xl shadow-lg",
                  branch.type === 'warehouse' ? "bg-[#1C8FFF] text-white shadow-blue-100" : "bg-amber-500 text-white shadow-amber-100"
                )}>
                  {branch.type === 'warehouse' ? <Warehouse size={24} /> : <Store size={24} />}
                </div>
                <div className="flex items-center gap-2">
                  {branch.isMain && (
                    <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                      <ShieldCheck size={12} />
                      {t('branches.master')}
                    </span>
                  )}
                  <button 
                    onClick={() => {
                      setEditingBranch(branch);
                      setShowAddModal(true);
                    }}
                    className="p-2 hover:bg-gray-50 rounded-full transition-colors"
                  >
                    <MoreVertical size={20} className="text-gray-400" />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black text-gray-900">{branch.name}</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                  {t(`inventory.type_${branch.type}`)}
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-50">
                <div className="flex items-center gap-3 text-[#6B7280]">
                  <MapPin size={18} className="text-[#1C8FFF]" />
                  <span className="text-sm font-medium">{branch.location}</span>
                </div>
                <div className="flex items-center gap-3 text-[#6B7280]">
                  <Phone size={18} className="text-[#1C8FFF]" />
                  <span className="text-sm font-medium">{branch.phone}</span>
                </div>
              </div>
            </div>
            
            <div className="px-8 py-4 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('common.active')}</span>
              </div>
              <button className="text-xs font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest">
                {t('branches.view_stock')}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <BranchModal 
            onClose={() => {
              setShowAddModal(false);
              setEditingBranch(null);
            }}
            onSave={handleSave}
            initialData={editingBranch}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const BranchModal = ({ onClose, onSave, initialData }: any) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState(initialData || {
    name: '',
    location: '',
    phone: '',
    type: 'store',
    isMain: false
  });

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
        className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
              <Building2 size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">
                {initialData ? t('branches.edit_location') : t('branches.add_location')}
              </h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{t('branches.location_details')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t('branches.name')}</label>
            <input 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t('branches.type')}</label>
              <select 
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
                className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
              >
                <option value="store">{t('inventory.type_store')}</option>
                <option value="warehouse">{t('inventory.type_warehouse')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t('branches.phone')}</label>
              <input 
                required
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t('branches.location')}</label>
            <input 
              required
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
              className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl">
            <input 
              type="checkbox"
              id="isMain"
              checked={formData.isMain}
              onChange={e => setFormData({...formData, isMain: e.target.checked})}
              className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-none"
            />
            <label htmlFor="isMain" className="text-sm font-bold text-gray-700 cursor-pointer">
              {t('branches.set_as_master')}
            </label>
          </div>

          <button 
            type="submit"
            className="w-full bg-[#1C8FFF] text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-100 hover:bg-blue-600 transition-all mt-4"
          >
            {t('common.save')}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default WarehouseManagement;
