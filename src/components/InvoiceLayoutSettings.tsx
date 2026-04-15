import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn } from '../lib/utils';
import { 
  FileText, 
  Layout, 
  AlignRight, 
  AlignCenter, 
  AlignLeft, 
  Upload,
  X as CloseIcon,
  Save,
  Eye
} from 'lucide-react';
import Branding from './Branding';

interface InvoiceLayoutSettingsProps {
  tenantId: string;
}

export default function InvoiceLayoutSettings({ tenantId }: InvoiceLayoutSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    printSize: 'thermal80',
    layoutTemplate: 'classic',
    header: {
      logoUrl: '',
      facilityName: '',
      contactNumbers: '',
      address: '',
      taxId: '',
      alignment: 'center' as 'right' | 'left' | 'center',
    },
    columns: {
      showUnitPrice: true,
      showDiscount: true,
      showMeasurements: false,
      showBarcode: true,
    },
    footer: {
      returnPolicy: '',
      thankYouMessage: 'شكراً لتسوقكم معنا',
      showZatcaQr: true,
    }
  });

  useEffect(() => {
    const fetchSettings = async () => {
      if (!tenantId || tenantId === 'super_admin') {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.invoiceSettings) {
            setSettings(data.invoiceSettings);
            setLogoPreview(data.invoiceSettings.header.logoUrl || null);
          } else {
            // Fallback to tenant basic info if invoice settings don't exist
            setSettings(prev => ({
              ...prev,
              header: {
                ...prev.header,
                facilityName: data.name || '',
                contactNumbers: data.phone || '',
                address: data.address || '',
                logoUrl: data.logoUrl || ''
              }
            }));
            setLogoPreview(data.logoUrl || null);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'tenants');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [tenantId]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 1 ميجابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setSettings(prev => ({
          ...prev,
          header: { ...prev.header, logoUrl: base64 }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!tenantId || tenantId === 'super_admin') return;
    setSaving(true);
    try {
      const docRef = doc(db, 'tenants', tenantId);
      await updateDoc(docRef, {
        invoiceSettings: settings
      });
      alert('تم حفظ إعدادات الفاتورة بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tenants');
      alert('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C8FFF]"></div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-[2.5rem] border border-border shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[800px]" dir="rtl">
      {/* Controls Section */}
      <div className="w-full lg:w-1/2 p-8 border-l border-border overflow-y-auto max-h-[800px] space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-content flex items-center gap-2">
              <FileText className="text-[#1C8FFF]" />
              تخطيط الفاتورة
            </h2>
            <p className="text-[#6B7280] text-sm mt-1">تخصيص مظهر ومحتوى الفواتير المطبوعة</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1C8FFF] text-white px-6 py-2.5 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>

        {/* 1. Size & Shape Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-content border-b border-border pb-2">1. إعدادات الحجم والشكل</h3>
          
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#6B7280]">حجم الطباعة</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'thermal80', label: 'حراري 80mm' },
                { id: 'thermal58', label: 'حراري 58mm' },
                { id: 'a4', label: 'A4' },
                { id: 'a5', label: 'A5' },
              ].map(size => (
                <button
                  key={size.id}
                  onClick={() => setSettings(s => ({ ...s, printSize: size.id }))}
                  className={cn(
                    "py-2 px-3 rounded-xl text-sm font-bold border-2 transition-all",
                    settings.printSize === size.id 
                      ? "border-[#1C8FFF] bg-[#1C8FFF]/10 text-[#1C8FFF]" 
                      : "border-border text-[#6B7280] hover:border-[#1C8FFF]/50"
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-[#6B7280]">قالب التخطيط</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'classic', label: 'كلاسيكي مبسط' },
                { id: 'detailed', label: 'مفصل (مع القياسات)' },
                { id: 'tax', label: 'ضريبي معتمد' },
              ].map(template => (
                <button
                  key={template.id}
                  onClick={() => setSettings(s => ({ ...s, layoutTemplate: template.id }))}
                  className={cn(
                    "py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all flex flex-col items-center gap-2",
                    settings.layoutTemplate === template.id 
                      ? "border-[#1C8FFF] bg-[#1C8FFF]/10 text-[#1C8FFF]" 
                      : "border-border text-[#6B7280] hover:border-[#1C8FFF]/50"
                  )}
                >
                  <Layout size={24} />
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Invoice Details Control */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-content border-b border-border pb-2">2. التحكم في تفاصيل الفاتورة</h3>
          
          {/* Header */}
          <div className="space-y-4 bg-surface-muted p-5 rounded-2xl">
            <h4 className="font-bold text-content">الترويسة (Header)</h4>
            
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="w-24 h-24 bg-white rounded-2xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden transition-all group-hover:border-[#1C8FFF]/50">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <span className="text-xs text-[#6B7280] text-center px-2">شعار المنشأة</span>
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 p-2 bg-[#1C8FFF] text-white rounded-xl shadow-lg cursor-pointer hover:bg-blue-600 transition-all hover:scale-110">
                  <Upload size={16} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                </label>
                {logoPreview && (
                  <button 
                    onClick={() => { setLogoPreview(null); setSettings(s => ({ ...s, header: { ...s.header, logoUrl: '' } })); }}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-all"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
              
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-xs font-bold text-[#6B7280] mb-1 block">محاذاة الترويسة</label>
                  <div className="flex bg-white rounded-xl border border-border p-1 w-fit">
                    {[
                      { id: 'right', icon: AlignRight },
                      { id: 'center', icon: AlignCenter },
                      { id: 'left', icon: AlignLeft },
                    ].map(align => (
                      <button
                        key={align.id}
                        onClick={() => setSettings(s => ({ ...s, header: { ...s.header, alignment: align.id as any } }))}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          settings.header.alignment === align.id ? "bg-[#1C8FFF] text-white" : "text-[#6B7280] hover:bg-surface-muted"
                        )}
                      >
                        <align.icon size={18} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-[#6B7280] mb-1 block">اسم المنشأة</label>
                <input 
                  type="text" 
                  value={settings.header.facilityName}
                  onChange={e => setSettings(s => ({ ...s, header: { ...s.header, facilityName: e.target.value } }))}
                  className="w-full bg-white border border-border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#6B7280] mb-1 block">أرقام التواصل</label>
                <input 
                  type="text" 
                  value={settings.header.contactNumbers}
                  onChange={e => setSettings(s => ({ ...s, header: { ...s.header, contactNumbers: e.target.value } }))}
                  className="w-full bg-white border border-border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#6B7280] mb-1 block">العنوان</label>
                <input 
                  type="text" 
                  value={settings.header.address}
                  onChange={e => setSettings(s => ({ ...s, header: { ...s.header, address: e.target.value } }))}
                  className="w-full bg-white border border-border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#6B7280] mb-1 block">الرقم الضريبي</label>
                <input 
                  type="text" 
                  value={settings.header.taxId}
                  onChange={e => setSettings(s => ({ ...s, header: { ...s.header, taxId: e.target.value } }))}
                  className="w-full bg-white border border-border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table Columns */}
          <div className="space-y-4 bg-surface-muted p-5 rounded-2xl">
            <h4 className="font-bold text-content">أعمدة الجدول (Table Columns)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'showUnitPrice', label: 'إظهار سعر الوحدة' },
                { id: 'showDiscount', label: 'إظهار الخصومات' },
                { id: 'showMeasurements', label: 'إظهار التفاصيل والقياسات' },
                { id: 'showBarcode', label: 'إظهار باركود الطلب' },
              ].map(col => (
                <label key={col.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-border cursor-pointer hover:border-[#1C8FFF]/30 transition-all">
                  <span className="text-sm font-bold text-content">{col.label}</span>
                  <div className={cn(
                    "w-10 h-6 rounded-full p-1 transition-colors relative",
                    (settings.columns as any)[col.id] ? "bg-[#1C8FFF]" : "bg-gray-300"
                  )}>
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-transform",
                      (settings.columns as any)[col.id] ? "translate-x-0" : "-translate-x-4"
                    )} />
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={(settings.columns as any)[col.id]}
                    onChange={(e) => setSettings(s => ({ ...s, columns: { ...s.columns, [col.id]: e.target.checked } }))}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Footer & Terms */}
          <div className="space-y-4 bg-surface-muted p-5 rounded-2xl">
            <h4 className="font-bold text-content">التذييل والشروط (Footer & Terms)</h4>
            
            <div>
              <label className="text-xs font-bold text-[#6B7280] mb-1 block">سياسة الاستبدال والاسترجاع</label>
              <textarea 
                rows={3}
                value={settings.footer.returnPolicy}
                onChange={e => setSettings(s => ({ ...s, footer: { ...s.footer, returnPolicy: e.target.value } }))}
                className="w-full bg-white border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none resize-none"
                placeholder="أدخل سياسة الاستبدال والاسترجاع الخاصة بمنشأتك..."
              />
            </div>
            
            <div>
              <label className="text-xs font-bold text-[#6B7280] mb-1 block">رسالة شكر</label>
              <input 
                type="text" 
                value={settings.footer.thankYouMessage}
                onChange={e => setSettings(s => ({ ...s, footer: { ...s.footer, thankYouMessage: e.target.value } }))}
                className="w-full bg-white border border-border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1C8FFF] outline-none"
              />
            </div>

            <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-border cursor-pointer hover:border-[#1C8FFF]/30 transition-all w-fit">
              <div className={cn(
                "w-10 h-6 rounded-full p-1 transition-colors relative",
                settings.footer.showZatcaQr ? "bg-[#1C8FFF]" : "bg-gray-300"
              )}>
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full transition-transform",
                  settings.footer.showZatcaQr ? "translate-x-0" : "-translate-x-4"
                )} />
              </div>
              <span className="text-sm font-bold text-content">توليد وعرض رمز الاستجابة السريعة (QR Code) لهيئة الزكاة</span>
              <input 
                type="checkbox" 
                className="hidden"
                checked={settings.footer.showZatcaQr}
                onChange={(e) => setSettings(s => ({ ...s, footer: { ...s.footer, showZatcaQr: e.target.checked } }))}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Live Preview Section */}
      <div className="w-full lg:w-1/2 bg-gray-100 p-8 flex flex-col items-center justify-start overflow-y-auto max-h-[800px]">
        <div className="flex items-center gap-2 mb-6 text-[#6B7280] font-bold">
          <Eye size={20} />
          <span>معاينة حية للفاتورة</span>
        </div>

        {/* Invoice Paper */}
        <div 
          className={cn(
            "bg-white shadow-xl transition-all duration-300 relative",
            settings.printSize === 'thermal80' ? "w-[300px] p-4 text-[11px]" :
            settings.printSize === 'thermal58' ? "w-[220px] p-3 text-[9px]" :
            settings.printSize === 'a4' ? "w-[600px] p-8 text-sm" :
            "w-[420px] p-6 text-xs" // A5
          )}
          style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
        >
          {/* Header */}
          <div className={cn(
            "flex flex-col mb-6 border-b border-dashed border-gray-300 pb-4",
            settings.header.alignment === 'center' ? "items-center text-center" :
            settings.header.alignment === 'left' ? "items-end text-left" : "items-start text-right"
          )}>
            {settings.header.logoUrl && (
              <img src={settings.header.logoUrl} alt="Logo" className="w-16 h-16 object-contain mb-2" />
            )}
            {settings.header.facilityName && <h1 className="font-black text-lg">{settings.header.facilityName}</h1>}
            {settings.header.address && <p className="text-gray-600 mt-1">{settings.header.address}</p>}
            {settings.header.contactNumbers && <p className="text-gray-600">هاتف: {settings.header.contactNumbers}</p>}
            {settings.header.taxId && settings.layoutTemplate === 'tax' && (
              <p className="text-gray-800 font-bold mt-1">الرقم الضريبي: {settings.header.taxId}</p>
            )}
            {settings.layoutTemplate === 'tax' && (
              <div className="mt-2 text-center font-bold border border-gray-800 px-2 py-1 rounded">
                فاتورة ضريبية مبسطة
              </div>
            )}
          </div>

          {/* Order Info */}
          <div className="flex justify-between mb-4 font-bold">
            <div>
              <p>رقم الطلب: #10042</p>
              <p>التاريخ: 2024-05-20</p>
            </div>
            <div className="text-left">
              <p>العميل: أحمد محمد</p>
              <p>الكاشير: محمد</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-4">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-right py-1">الصنف</th>
                <th className="text-center py-1">الكمية</th>
                {settings.columns.showUnitPrice && <th className="text-center py-1">السعر</th>}
                <th className="text-left py-1">المجموع</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 border-dashed">
                <td className="py-2">
                  <div className="font-bold">تفصيل ثوب رجالي</div>
                  {settings.columns.showMeasurements && settings.layoutTemplate === 'detailed' && (
                    <div className="text-gray-500 mt-1">
                      الطول: 150, الكتف: 45, الصدر: 55
                    </div>
                  )}
                </td>
                <td className="text-center py-2">2</td>
                {settings.columns.showUnitPrice && <td className="text-center py-2">150</td>}
                <td className="text-left py-2 font-bold">300</td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-gray-800 pt-2 mb-6 space-y-1">
            <div className="flex justify-between">
              <span>المجموع الفرعي:</span>
              <span>300 ر.س</span>
            </div>
            {settings.columns.showDiscount && (
              <div className="flex justify-between text-red-600">
                <span>الخصم:</span>
                <span>-20 ر.س</span>
              </div>
            )}
            {settings.layoutTemplate === 'tax' && (
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span>42 ر.س</span>
              </div>
            )}
            <div className="flex justify-between font-black text-lg border-t border-dashed border-gray-300 pt-1 mt-1">
              <span>الإجمالي:</span>
              <span>322 ر.س</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center space-y-4">
            {settings.footer.returnPolicy && (
              <div className="text-gray-600 border-t border-dashed border-gray-300 pt-4">
                <p className="font-bold mb-1">سياسة الاستبدال والاسترجاع:</p>
                <p className="whitespace-pre-wrap">{settings.footer.returnPolicy}</p>
              </div>
            )}
            
            {settings.footer.thankYouMessage && (
              <p className="font-bold text-lg">{settings.footer.thankYouMessage}</p>
            )}

            {settings.columns.showBarcode && (
              <div className="flex justify-center mt-4">
                <div className="w-3/4 h-12 bg-gray-200 flex items-center justify-center text-gray-500 border border-gray-300">
                  |||||||||||||||||||||||||||
                </div>
              </div>
            )}

            {settings.footer.showZatcaQr && (
              <div className="flex justify-center mt-4">
                <div className="w-24 h-24 bg-gray-200 flex items-center justify-center text-gray-500 border border-gray-300">
                  QR Code
                </div>
              </div>
            )}

            <div className="pt-4 mt-4 border-t border-gray-200">
              <Branding className="scale-75 origin-center" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
