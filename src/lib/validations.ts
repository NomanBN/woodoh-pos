import { z } from 'zod';

// Common regex patterns
const phoneRegex = /^(\+?\d{1,3}[- ]?)?\d{10}$/;

export const customerSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل').max(100, 'الاسم طويل جداً'),
  phone: z.string().regex(phoneRegex, 'رقم الهاتف غير صحيح'),
  email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
  measurements: z.object({
    length: z.coerce.number().min(0).max(300).optional(),
    shoulder: z.coerce.number().min(0).max(100).optional(),
    chest: z.coerce.number().min(0).max(200).optional(),
    waist: z.coerce.number().min(0).max(200).optional(),
    hips: z.coerce.number().min(0).max(200).optional(),
    sleeve: z.coerce.number().min(0).max(150).optional(),
    neck: z.coerce.number().min(0).max(100).optional(),
    collarType: z.string().optional(),
    cuffType: z.string().optional(),
    pocketType: z.string().optional(),
    chestStyle: z.string().optional(),
    shoulderStyle: z.string().optional(),
    thobeMeasurements: z.object({
      collar: z.coerce.number().min(0).optional(),
      chest: z.coerce.number().min(0).optional(),
      shoulders: z.coerce.number().min(0).optional(),
      sleeves: z.coerce.number().min(0).optional(),
      length: z.coerce.number().min(0).optional(),
      bottomWidth: z.coerce.number().min(0).optional(),
    }).optional(),
  }).optional(),
  styles: z.object({
    neckShape: z.string().optional(),
    sleeveStyle: z.string().optional(),
    pocketType: z.string().optional(),
  }).optional(),
  notes: z.string().max(1000, 'الملاحظات طويلة جداً').optional(),
  isTest: z.boolean().optional().default(false),
});

export const orderSchema = z.object({
  customerId: z.string().min(1, 'يجب اختيار عميل'),
  items: z.array(z.object({
    garmentType: z.string().min(1, 'يجب اختيار نوع الثوب'),
    fabric: z.string().min(1, 'يجب اختيار القماش'),
    fabricId: z.string().optional(),
    quantity: z.coerce.number().min(0.01, 'الكمية يجب أن تكون أكبر من صفر'),
    selectedUnit: z.string().min(1, 'يجب اختيار الوحدة'),
    consumedMeters: z.coerce.number().min(0),
    price: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً'),
    closureType: z.enum(['zipper', 'buttons']).optional(),
    closureVisibility: z.enum(['hidden', 'visible']).optional(),
    collarType: z.string().optional(),
    cuffType: z.string().optional(),
    pocketType: z.string().optional(),
    chestStyle: z.string().optional(),
    collarPadding: z.enum(['hard', 'soft']).optional(),
    additions: z.string().optional(),
    embroidery: z.string().optional(),
  })).min(1, 'يجب إضافة قطعة واحدة على الأقل'),
  totalAmount: z.coerce.number().min(0).optional(),
  paidAmount: z.coerce.number().min(0),
  remainingAmount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'network', 'cash_on_delivery', 'partial']),
  deliveryDate: z.string().min(1, 'يجب تحديد تاريخ الاستلام'),
  createdBy: z.string().optional(),
  status: z.enum(['measurements_taken', 'cutting', 'sewing', 'embroidery', 'ironing_packaging', 'ready', 'delivered']),
  notes: z.string().max(1000).optional().or(z.literal('')),
  images: z.array(z.string()).optional(),
  isTest: z.boolean().optional().default(false),
});

export const inventorySchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  type: z.enum(['fabric', 'thread', 'button', 'lining', 'accessories', 'other']),
  quantity: z.coerce.number().min(0, 'الكمية لا يمكن أن تكون سالبة'),
  unit: z.enum(['meter', 'yard', 'roll', 'bolt', 'piece', 'spool', 'box']),
  baseUnit: z.enum(['meter', 'piece']),
  conversionRate: z.coerce.number().min(0.0001, 'معامل التحويل يجب أن يكون أكبر من صفر'),
  minThreshold: z.coerce.number().min(0),
  pricePerUnit: z.coerce.number().min(0),
  supplierId: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  isTest: z.boolean().optional().default(false),
});

export const staffSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  phone: z.string().regex(phoneRegex, 'رقم الهاتف غير صحيح'),
  role: z.string().min(1, 'يجب اختيار الدور الوظيفي'),
  branchId: z.string().min(1, 'يجب اختيار الفرع'),
  status: z.enum(['active', 'inactive']),
  pin: z.string().length(4, 'رمز الدخول يجب أن يكون 4 أرقام').regex(/^\d+$/, 'يجب أن يحتوي الرمز على أرقام فقط').optional().or(z.literal('')),
  isTest: z.boolean().optional().default(false),
});

export const onboardingSchema = z.object({
  customerId: z.string().min(5, 'كود العميل يجب أن يكون 5 أحرف على الأقل'),
  shopName: z.string().min(2, 'اسم المحل يجب أن يكون حرفين على الأقل'),
  category: z.enum(['tailor', 'tailor-female', 'uniform']),
  inventoryStrategy: z.enum(['centralized', 'decentralized']),
  phone: z.string().regex(phoneRegex, 'رقم الهاتف غير صحيح').optional().or(z.literal('')),
  address: z.string().min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل'),
  defaultLayout: z.enum(['sidebar', 'grid']).optional().default('sidebar'),
  defaultFulfillment: z.enum(['split', 'unified']).optional().default('split'),
});

export const supplierSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  contactPerson: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
  phone: z.string().regex(phoneRegex, 'رقم الهاتف غير صحيح'),
  address: z.string().min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل'),
  taxNumber: z.string().optional(),
  category: z.enum(['fabric', 'accessories', 'thread', 'button', 'lining', 'other']),
  isTest: z.boolean().optional().default(false),
});

export const reconciliationSchema = z.object({
  actualQuantity: z.coerce.number().min(0, 'الكمية لا يمكن أن تكون سالبة'),
  reason: z.enum(['damaged', 'lost', 'correction', 'return', 'other'], {
    message: 'يجب اختيار سبب التسوية'
  }),
  staffId: z.string().min(1, 'يجب اختيار الموظف المسؤول'),
});

export const settingsSchema = z.object({
  name: z.string().min(2, 'اسم المتجر يجب أن يكون حرفين على الأقل'),
  phone: z.string().regex(phoneRegex, 'رقم الهاتف غير صحيح'),
  address: z.string().min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل'),
  inventoryStrategy: z.enum(['centralized', 'decentralized']),
  logoUrl: z.string().optional(),
});
