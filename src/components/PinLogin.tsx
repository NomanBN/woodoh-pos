import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Delete, User, Users, Lock, AlertCircle, LogOut, CheckCircle2 } from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Staff } from '../types';
import { cn } from '../lib/utils';
import bcrypt from 'bcryptjs';
import { hashPin } from '../services/staffService';
import Branding from './Branding';

interface PinLoginProps {
  tenantId: string;
  onLogin: (staff: Staff) => void;
}

export default function PinLogin({ tenantId, onLogin }: PinLoginProps) {
  const [pin, setPin] = useState('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [mustChangePin, setMustChangePin] = useState<Staff | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaff = async () => {
      const q = query(collection(db, 'staff'), where('tenantId', '==', tenantId), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      setStaffList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    };
    fetchStaff();
  }, [tenantId]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(null);
      // Visual feedback
      setActiveKey(num);
      setTimeout(() => setActiveKey(null), 100);
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(prev => prev.slice(0, -1));
      setError(null);
      // Visual feedback
      setActiveKey('Backspace');
      setTimeout(() => setActiveKey(null), 100);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/\d/.test(e.key)) {
        handleNumberClick(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin();
    }
  }, [pin]);

  const verifyPin = async () => {
    setIsVerifying(true);
    let matchedStaff: Staff | undefined;

    for (const s of staffList) {
      if (s.pin && await bcrypt.compare(pin, s.pin)) {
        matchedStaff = s;
        break;
      }
    }
    
    if (matchedStaff) {
      if (matchedStaff.mustChangePin) {
        setMustChangePin(matchedStaff);
        setIsVerifying(false);
      } else {
        // Success
        setTimeout(() => {
          onLogin(matchedStaff!);
          setIsVerifying(false);
        }, 500);
      }
    } else {
      // Failure
      setTimeout(() => {
        setError('رمز الدخول غير صحيح');
        setPin('');
        setIsVerifying(false);
      }, 500);
    }
  };

  const handlePinChange = async () => {
    if (!mustChangePin) return;
    if (newPin.length !== 4) {
      setError('يجب أن يكون الرمز الجديد 4 أرقام');
      return;
    }
    if (newPin !== confirmPin) {
      setError('الرمزان غير متطابقين');
      return;
    }

    setIsChanging(true);
    try {
      const hashedPin = await hashPin(newPin);
      await updateDoc(doc(db, 'staff', mustChangePin.id), {
        pin: hashedPin,
        mustChangePin: false
      });
      
      onLogin({ ...mustChangePin, pin: hashedPin, mustChangePin: false });
    } catch (err) {
      setError('فشل تحديث الرمز السري');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center overflow-hidden font-sans" dir="rtl">
      <div className="flex w-full h-full">
        {/* Right Side: PIN Login Form (Now on the right in RTL) */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50/50">
          <AnimatePresence mode="wait">
            {mustChangePin ? (
              <motion.div 
                key="change-pin"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-[3rem] shadow-xl border border-gray-100 p-10 relative z-10 flex flex-col items-center"
              >
                <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-600 mb-6 shadow-inner">
                  <Lock size={40} />
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-2 text-center">تغيير رمز الدخول</h2>
                <p className="text-gray-500 text-sm mb-8 text-center font-medium">لأمان حسابك، يرجى تعيين رمز دخول جديد خاص بك</p>

                <div className="w-full space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2">الرمز الجديد</label>
                    <input 
                      type="password"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl p-4 text-center text-2xl font-black tracking-[1em] outline-none transition-all"
                      placeholder="****"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2">تأكيد الرمز</label>
                    <input 
                      type="password"
                      maxLength={4}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl p-4 text-center text-2xl font-black tracking-[1em] outline-none transition-all"
                      placeholder="****"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-red-500 text-xs font-bold bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  )}

                  <button 
                    onClick={handlePinChange}
                    disabled={isChanging || newPin.length !== 4 || confirmPin.length !== 4}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isChanging ? 'جاري الحفظ...' : 'تأكيد الرمز الجديد'}
                  </button>
                  
                  <button 
                    onClick={() => {
                      setMustChangePin(null);
                      setPin('');
                      setNewPin('');
                      setConfirmPin('');
                      setError(null);
                    }}
                    className="w-full text-gray-400 font-bold py-2 hover:text-gray-600 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="login-pin"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="w-full max-w-md bg-white rounded-[3rem] shadow-xl border border-gray-100 p-10 relative z-10 flex flex-col items-center"
              >
                <div className="lg:hidden w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 shadow-inner">
                  <Shield size={40} />
                </div>

                <h2 className="text-3xl font-black text-gray-900 mb-2 text-center">دخول الموظفين</h2>
                <p className="text-gray-500 text-sm mb-10 text-center font-medium">الرجاء إدخال رمز الدخول السريع الخاص بك</p>

                {/* PIN Display */}
                <div className="flex gap-4 mb-10">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      animate={pin.length === i ? { scale: [1, 1.1, 1] } : {}}
                      className={cn(
                        "w-14 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 text-2xl font-black",
                        pin.length > i ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-50 border-gray-100",
                        error && "border-red-500 bg-red-50 text-red-500"
                      )}
                    >
                      {pin.length > i ? (
                        <div className="w-4 h-4 bg-current rounded-full" />
                      ) : (
                        pin.length === i && <div className="w-1.5 h-8 bg-indigo-200 rounded-full animate-pulse" />
                      )}
                    </motion.div>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-2 text-red-500 text-sm font-bold mb-8 bg-red-50 px-6 py-3 rounded-2xl border border-red-100"
                    >
                      <AlertCircle size={18} />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-5 w-full">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleNumberClick(num.toString())}
                      disabled={isVerifying}
                      className={cn(
                        "h-20 rounded-2xl text-3xl font-black transition-all active:scale-95 disabled:opacity-50 border border-transparent",
                        activeKey === num.toString() 
                          ? "bg-indigo-600 text-white scale-95 shadow-lg shadow-indigo-200 border-indigo-600" 
                          : "bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                  <div className="h-20" />
                  <button
                    onClick={() => handleNumberClick('0')}
                    disabled={isVerifying}
                    className={cn(
                      "h-20 rounded-2xl text-3xl font-black transition-all active:scale-95 disabled:opacity-50 border border-transparent",
                      activeKey === '0' 
                        ? "bg-indigo-600 text-white scale-95 shadow-lg shadow-indigo-200 border-indigo-600" 
                        : "bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100"
                    )}
                  >
                    0
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isVerifying}
                    className={cn(
                      "h-20 rounded-2xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 border border-transparent",
                      activeKey === 'Backspace'
                        ? "bg-red-600 text-white scale-95 shadow-lg shadow-red-200 border-red-600"
                        : "bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100"
                    )}
                  >
                    <Delete size={28} />
                  </button>
                </div>

                <div className="mt-10 pt-8 border-t border-gray-100 w-full">
                  <button 
                    onClick={() => window.location.reload()}
                    className="w-full flex items-center justify-center gap-3 text-gray-400 hover:text-gray-600 font-black transition-colors py-2"
                  >
                    <LogOut size={20} />
                    <span>خروج من النظام</span>
                  </button>
                </div>

                <Branding className="mt-4 opacity-50" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Left Side: Decorative / Vector Illustration (Now on the left in RTL) */}
        <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 relative overflow-hidden items-center justify-center p-12">
          {/* Abstract Background Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-400/10 rounded-full blur-3xl" />
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 text-center text-white w-full max-w-lg"
          >
            {/* Visual Composition: Employees + PIN Pad */}
            <div className="relative h-80 mb-12 flex items-center justify-center">
              {/* Central PIN Pad Vector */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-40 h-56 bg-white/10 backdrop-blur-2xl rounded-[2.5rem] border-2 border-white/20 shadow-2xl p-6 flex flex-col gap-3 relative z-20"
              >
                <div className="grid grid-cols-3 gap-2 flex-1">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="bg-white/10 rounded-lg border border-white/5" />
                  ))}
                  <div />
                  <div className="bg-indigo-400/40 rounded-lg border border-white/20" />
                  <div />
                </div>
                <div className="h-4 bg-white/20 rounded-full w-2/3 mx-auto" />
              </motion.div>

              {/* Floating Employee Avatars */}
              <motion.div 
                animate={{ x: [-20, 0, -20], y: [0, -15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-10 left-10 w-20 h-20 bg-emerald-400/20 backdrop-blur-xl rounded-3xl border border-white/20 flex items-center justify-center shadow-xl z-30"
              >
                <User size={32} className="text-emerald-300" />
              </motion.div>

              <motion.div 
                animate={{ x: [20, 0, 20], y: [0, 15, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute bottom-10 right-10 w-24 h-24 bg-amber-400/20 backdrop-blur-xl rounded-[2rem] border border-white/20 flex items-center justify-center shadow-xl z-30"
              >
                <Users size={40} className="text-amber-300" />
              </motion.div>

              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute top-1/2 -right-4 w-16 h-16 bg-indigo-400/30 backdrop-blur-xl rounded-2xl border border-white/20 flex items-center justify-center shadow-xl z-10"
              >
                <Shield size={24} className="text-indigo-200" />
              </motion.div>

              {/* Connecting Lines (Visualizing Access) */}
              <svg className="absolute inset-0 w-full h-full -z-10 opacity-20" viewBox="0 0 400 300">
                <motion.path 
                  d="M 100 80 Q 200 150 200 150" 
                  stroke="white" strokeWidth="2" fill="none" strokeDasharray="5,5"
                  animate={{ strokeDashoffset: [0, -20] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <motion.path 
                  d="M 300 220 Q 200 150 200 150" 
                  stroke="white" strokeWidth="2" fill="none" strokeDasharray="5,5"
                  animate={{ strokeDashoffset: [0, -20] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </svg>
            </div>

            <h1 className="text-5xl font-black mb-6 leading-tight">بوابة الموظفين<br />الذكية</h1>
            <p className="text-indigo-100 text-xl font-medium max-w-md mx-auto leading-relaxed opacity-80">
              وصول سريع وآمن لكل أفراد فريق العمل باستخدام رمز الدخول الخاص بك.
            </p>
            
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/10">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-indigo-100 uppercase tracking-widest">نظام نشط</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/10">
                <Shield size={14} className="text-indigo-300" />
                <span className="text-xs font-bold text-indigo-100 uppercase tracking-widest">حماية متطورة</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
