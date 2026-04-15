import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Scissors, 
  Send, 
  CheckCircle, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Phone, 
  User, 
  ArrowRight,
  AlertCircle,
  Loader2,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

import Branding from './Branding';

type ViewMode = 'login' | 'register' | 'pending' | 'forgot-password';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<ViewMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  // Form States
  const [loginId, setLoginId] = useState(''); // Email or Phone
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const languages = [
    { code: 'ar', name: 'العربية', dir: 'rtl' },
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'ur', name: 'اردو', dir: 'rtl' }
  ];

  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangMenuOpen(false);
  };

  // Load remembered loginId
  useEffect(() => {
    const saved = localStorage.getItem('rememberedUser');
    if (saved) {
      setLoginId(saved);
      setRememberMe(true);
    }
  }, []);

  // Phone Formatting Logic
  const formatSaudiPhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('05') && cleaned.length === 10) {
      return '+966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      return '+966' + cleaned;
    }
    return phone;
  };

  const validatePhone = (phone: string) => {
    const formatted = formatSaudiPhone(phone);
    return formatted.startsWith('+9665') && formatted.length === 13;
  };

  // Password Strength Logic
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let strength = 0;
    if (pass.length >= 8) strength += 1;
    if (/[A-Z]/.test(pass)) strength += 1;
    if (/[0-9]/.test(pass)) strength += 1;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 1;
    return strength;
  };

  const strength = getPasswordStrength(regPassword);
  const strengthLabels = [
    t('login.strength.weak'),
    t('login.strength.medium'),
    t('login.strength.good'),
    t('login.strength.strong')
  ];
  const strengthColors = ['bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-400'];

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check Super Admin
      if (user.email === "nomansa2566512@gmail.com") return;

      // Check existing tenant or request
      const qTenant = query(collection(db, 'tenants'), where('ownerEmail', '==', user.email));
      const tenantSnap = await getDocs(qTenant);
      if (!tenantSnap.empty) {
        const tenant = tenantSnap.docs[0].data();
        if (tenant.status === 'pending') setView('pending');
        return;
      }

      const qReq = query(collection(db, 'tailorRequests'), where('uid', '==', user.uid));
      const reqSnap = await getDocs(qReq);
      if (reqSnap.empty) {
        setView('register');
        setFullName(user.displayName || '');
        setRegEmail(user.email || '');
      } else {
        const request = reqSnap.docs[0].data();
        if (request.status === 'pending') setView('pending');
      }
    } catch (err: any) {
      console.error('Google Login Error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError(t('login.errors.popup_blocked'));
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError(t('login.errors.popup_closed'));
      } else if (err.code === 'permission-denied') {
        setError(t('login.errors.permission_denied'));
      } else {
        setError(t('common.error') + ': ' + (err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // If loginId is phone, we need to find the email first (Firebase Auth uses email)
      let emailToUse = loginId;
      if (!loginId.includes('@')) {
        const formattedPhone = formatSaudiPhone(loginId);
        const q = query(collection(db, 'tailorRequests'), where('phone', '==', formattedPhone));
        const snap = await getDocs(q);
        if (snap.empty) {
          throw new Error(t('login.errors.phone_not_registered'));
        }
        emailToUse = snap.docs[0].data().email;
      }

      await signInWithEmailAndPassword(auth, emailToUse, password);
      
      if (rememberMe) {
        localStorage.setItem('rememberedUser', loginId);
      } else {
        localStorage.removeItem('rememberedUser');
      }
    } catch (err: any) {
      setError(t('login.errors.invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePhone(regPhone)) {
      setError(t('login.errors.invalid_phone'));
      return;
    }
    if (strength < 2) {
      setError(t('login.errors.weak_password'));
      return;
    }

    setLoading(true);
    setError(null);
    const formattedPhone = formatSaudiPhone(regPhone);

    try {
      // Check if phone already exists
      const qPhone = query(collection(db, 'tailorRequests'), where('phone', '==', formattedPhone));
      const qEmail = query(collection(db, 'tailorRequests'), where('email', '==', regEmail));
      
      let phoneSnap, emailSnap;
      try {
        [phoneSnap, emailSnap] = await Promise.all([
          getDocs(qPhone),
          getDocs(qEmail)
        ]);
      } catch (err: any) {
        console.error('Pre-registration Check Error:', err);
        throw err;
      }
      
      if (!phoneSnap.empty) {
        setError(t('login.errors.phone_exists'));
        setLoading(false);
        return;
      }

      if (!emailSnap.empty) {
        setError(t('login.errors.email_exists'));
        setLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      const user = userCredential.user;

      // Create Onboarding Request
      try {
        await addDoc(collection(db, 'tailorRequests'), {
          name: fullName,
          phone: formattedPhone,
          email: regEmail,
          uid: user.uid,
          status: 'pending',
          createdAt: new Date().toISOString(),
          onboardingStep: 1
        });
      } catch (err: any) {
        console.error('Add Request Error:', err);
        // If request creation fails, we should probably delete the user
        await user.delete();
        throw err;
      }

      setView('pending');
    } catch (err: any) {
      console.error('Registration Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError(t('login.errors.email_exists'));
      } else if (err.code === 'auth/invalid-email') {
        setError(t('login.errors.invalid_email', 'البريد الإلكتروني غير صالح'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('login.errors.weak_password'));
      } else if (err.code === 'auth/operation-not-allowed') {
        setError(t('login.errors.operation_not_allowed', 'يجب تفعيل خيار "البريد الإلكتروني وكلمة المرور" في إعدادات Firebase Console'));
      } else if (err.code === 'permission-denied') {
        setError(t('login.errors.permission_denied'));
      } else {
        setError(t('login.errors.unknown', 'حدث خطأ غير معروف'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50 font-sans">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-50">
        <div className="relative">
          <button 
            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <Globe size={18} className="text-indigo-600" />
            <span className="text-sm font-bold text-gray-700">{currentLanguage.name}</span>
          </button>

          <AnimatePresence>
            {isLangMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px]"
              >
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={cn(
                      "w-full text-right px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-between",
                      i18n.language === lang.code ? "text-indigo-600 bg-indigo-50/50" : "text-gray-600"
                    )}
                  >
                    <span>{lang.name}</span>
                    {i18n.language === lang.code && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Left Side - Visual */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 p-12 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-400 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl" />
        </div>
        
        <div className="relative z-10 text-white max-w-lg text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block p-6 bg-white/10 backdrop-blur-xl rounded-[2.5rem] mb-8"
          >
            <Scissors size={80} className="text-white" />
          </motion.div>
          <h1 className="text-5xl font-black mb-6 leading-tight">{t('login.title')}</h1>
          <p className="text-xl text-indigo-100 font-medium leading-relaxed">
            {t('login.subtitle')}
          </p>
        </div>
      </div>

      {/* Right Side - Forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center lg:text-right">
            <div className="lg:hidden inline-block p-4 bg-indigo-100 rounded-2xl text-indigo-600 mb-6">
              <Scissors size={32} />
            </div>
            <h2 className="text-3xl font-black text-gray-900">
              {view === 'login' ? t('login.welcome_back') : 
               view === 'register' ? t('login.create_account') : 
               view === 'forgot-password' ? t('login.forgot_password') : t('login.pending_review')}
            </h2>
            <p className="text-gray-500 mt-2 font-medium">
              {view === 'login' ? t('login.login_desc') : 
               view === 'register' ? t('login.register_desc') : 
               view === 'forgot-password' ? t('login.forgot_desc') : t('login.pending_desc')}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold"
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {view === 'login' && (
              <motion.form 
                key="login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleEmailLogin}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.email_or_phone')}</label>
                  <div className="relative group">
                    <Mail className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type="text"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder={i18n.language === 'en' ? "example@mail.com or 05xxxxxxxx" : "example@mail.com أو 05xxxxxxxx"}
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-4 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-4" : "pr-12 pl-4"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-sm font-bold text-gray-700">{t('login.password')}</label>
                    <button 
                      type="button"
                      onClick={() => setView('forgot-password')}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      {t('login.forgot_password_link')}
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-4 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-12" : "pr-12 pl-12"
                      )}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",
                        i18n.language === 'en' ? "right-4" : "left-4"
                      )}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-1">
                  <input 
                    type="checkbox" 
                    id="remember" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-2 border-gray-200 text-indigo-600 focus:ring-indigo-600" 
                  />
                  <label htmlFor="remember" className="text-sm font-bold text-gray-600 cursor-pointer">{t('login.remember_me')}</label>
                </div>

                <button 
                  disabled={loading}
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? <Loader2 className="animate-spin" /> : null}
                  <span>{t('login.login_button')}</span>
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-gray-50 px-2 text-gray-400 font-bold">{t('login.or_with')}</span></div>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                  <span>{t('login.google')}</span>
                </button>

                <p className="text-center text-gray-500 font-medium">
                  {t('login.no_account')}{' '}
                  <button type="button" onClick={() => setView('register')} className="text-indigo-600 font-bold hover:underline">{t('login.create_account')}</button>
                </p>

                <Branding className="pt-8 opacity-50" />
              </motion.form>
            )}

            {view === 'register' && (
              <motion.form 
                key="register"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleRegister}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.tailor_name')}</label>
                  <div className="relative group">
                    <User className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('login.full_name')}
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-3 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-4" : "pr-12 pl-4"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.phone')}</label>
                  <div className="relative group">
                    <Phone className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      onBlur={() => setRegPhone(formatSaudiPhone(regPhone))}
                      placeholder="05xxxxxxxx"
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-3 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-4" : "pr-12 pl-4"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.email')}</label>
                  <div className="relative group">
                    <Mail className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="example@mail.com"
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-3 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-4" : "pr-12 pl-4"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.password')}</label>
                  <div className="relative group">
                    <Lock className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-3 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-12" : "pr-12 pl-12"
                      )}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",
                        i18n.language === 'en' ? "right-4" : "left-4"
                      )}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {/* Strength Indicator */}
                  <div className="px-1 pt-2">
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-gray-400 uppercase">{t('login.password_strength')}</span>
                      <span className={cn("uppercase", strength > 0 ? "text-indigo-600" : "text-gray-300")}>
                        {regPassword ? strengthLabels[strength - 1] : ''}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "flex-1 rounded-full transition-all duration-500",
                            strength >= i ? strengthColors[strength - 1] : "bg-gray-100"
                          )} 
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <button 
                  disabled={loading}
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-70 mt-4"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                  <span>{t('login.register_button')}</span>
                </button>

                <p className="text-center text-gray-500 font-medium">
                  {t('login.have_account')}{' '}
                  <button type="button" onClick={() => setView('login')} className="text-indigo-600 font-bold hover:underline">{t('login.login_button')}</button>
                </p>
              </motion.form>
            )}

            {view === 'pending' && (
              <motion.div 
                key="pending"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6 py-8"
              >
                <div className="inline-flex items-center justify-center w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full mb-4">
                  <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-black text-gray-900">{t('login.pending_success_title')}</h2>
                <p className="text-gray-500 font-medium leading-relaxed">
                  {t('login.pending_success_desc')}
                </p>
                <button 
                  onClick={() => {
                    auth.signOut();
                    setView('login');
                  }}
                  className="flex items-center justify-center gap-2 text-indigo-600 font-bold hover:underline mx-auto"
                >
                  <ArrowRight size={18} className={cn(i18n.language === 'en' ? "rotate-180" : "")} />
                  <span>{t('login.back_to_login')}</span>
                </button>
              </motion.div>
            )}

            {view === 'forgot-password' && (
              <motion.form 
                key="forgot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLoading(true);
                  try {
                    await sendPasswordResetEmail(auth, loginId);
                    alert(t('login.reset_link_sent', 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني'));
                    setView('login');
                  } catch (err) {
                    setError(t('login.errors.reset_failed', 'فشل إرسال البريد، تأكد من صحة العنوان'));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 mx-1">{t('login.email')}</label>
                  <div className="relative group">
                    <Mail className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors",
                      i18n.language === 'en' ? "left-4" : "right-4"
                    )} size={20} />
                    <input 
                      required
                      type="email"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="example@mail.com"
                      className={cn(
                        "w-full bg-white border-2 border-gray-100 rounded-2xl py-4 focus:border-indigo-600 focus:ring-0 outline-none transition-all font-medium",
                        i18n.language === 'en' ? "pl-12 pr-4" : "pr-12 pl-4"
                      )}
                    />
                  </div>
                </div>

                <button 
                  disabled={loading}
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? <Loader2 className="animate-spin" /> : null}
                  <span>{t('login.send_reset_link')}</span>
                </button>

                <button 
                  type="button" 
                  onClick={() => setView('login')} 
                  className="w-full text-gray-500 font-bold hover:text-indigo-600 transition-colors"
                >
                  {t('login.cancel_and_back')}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
