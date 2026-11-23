export const PAGES = [
  ["dashboard", "الرئيسية"],
  ["inventory", "الأصناف والمخزون"],
  ["purchases", "المشتريات"],
  ["prices", "تحديث الأسعار"],
  ["alerts", "التنبيهات"],
  ["labels", "ملصقات الباركود"],
  ["catalog", "الكتالوج"],
  ["stocktake", "الجرد"],
  ["transfers", "التحويلات"],
  ["reorders", "التوريد"],
  ["sales", "المبيعات"],
  ["customers", "العملاء"],
  ["cash", "الصندوق"],
  ["reports", "التقارير"],
  ["suppliers", "الموردون"],
  ["purchase_orders", "أوامر الشراء"],
  ["returns", "المرتجعات والمردودات"],
  ["expenses", "المصروفات العامة"],
  ["sales_reps", "المناديب والعمولات"],
  ["activity_log", "سجل تحركات النظام"],
  ["print_settings", "إعدادات الطباعة"],
  ["barcode_labels", "إعدادات ملصقات الباركود"],
  ["scanner_settings", "إعدادات ماسح الباركود"],
  ["ui_theme", "التخصيص والشكل"],
  ["home_shortcuts", "اختصارات الصفحة الرئيسية"],
  ["share_settings", "إعدادات المشاركة"],
  ["system_timezone", "التوقيت الزمني"],
  ["settings", "الإعدادات"],
  ["backup", "النسخ الاحتياطي"],
  ["users", "المستخدمون"],
] as const;
export const ACTIONS = [
  ["inventory.create", "إضافة صنف"],
  ["inventory.edit", "تعديل صنف"],
  ["inventory.delete", "حذف صنف"],
  ["inventory.import", "استيراد الأصناف"],
  ["inventory.export", "تصدير الأصناف"],
  ["prices.update", "تغيير الأسعار والتكلفة"],
  ["purchases.post", "اعتماد المشتريات"],
  ["stocktake.adjust", "اعتماد الجرد والرصيد الافتتاحي"],
  ["transfers.post", "تنفيذ تحويل"],
  ["reorders.receive", "استلام توريد"],
  ["settings.manage", "تعديل الإعدادات"],
  ["sales.draft", "حفظ مسودة بيع"],
  ["sales.post", "ترحيل فاتورة بيع"],
  ["sales.override_price", "تعديل سعر البيع"],
  ["customers.manage", "إدارة العملاء"],
  ["cash.manage", "إدارة سندات الصندوق"],
  ["cash.close", "إقفال الصندوق"],
  ["reports.view", "عرض التقارير"],
  ["suppliers.manage", "إدارة الموردين"],
  ["purchase_orders.manage", "إدارة أوامر الشراء"],
  ["returns.manage", "إدارة المرتجعات والمردودات"],
  ["expenses.manage", "إدارة المصروفات العامة"],
  ["sales_reps.manage", "إدارة المناديب والعمولات"],
  ["catalog.print", "طباعة الكتالوج"],
  ["labels.print", "طباعة الملصقات"],
  ["backup.manage", "إنشاء واستعادة النسخ الاحتياطية"],
  ["sales_defaults.manage", "إدارة إعدادات المبيعات الافتراضية"],
  ["print_settings.manage", "إدارة إعدادات الطباعة"],
  ["barcode_labels.manage", "إدارة إعدادات ملصقات الباركود"],
  ["scanner_settings.manage", "إدارة إعدادات ماسح الباركود"],
  ["ui_theme.manage", "إدارة التخصيص والشكل"],
  ["home_shortcuts.manage", "إدارة اختصارات الصفحة الرئيسية"],
  ["share_settings.manage", "إدارة إعدادات المشاركة"],
  ["system_timezone.manage", "إدارة التوقيت الزمني"],
] as const;
export const FIELDS = [
  ["name", "اسم الصنف"],
  ["code", "كود الصنف"],
  ["model_no", "رقم الموديل"],
  ["barcode", "باركود المصنع"],
  ["custom_barcode", "الباركود المولد"],
  ["description", "الوصف والملاحظات"],
  ["category_id", "الفئة"],
  ["warehouse_id", "المستودع الافتراضي"],
  ["shelf", "الرف"],
  ["unit", "الوحدة الأساسية"],
  ["major_unit", "الوحدة الكبرى"],
  ["pack_capacity", "سعة العبوة"],
  ["cost", "تكلفة الشراء"],
  ["price", "سعر التجزئة"],
  ["price_special", "السعر الخاص"],
  ["price_half", "نصف جملة"],
  ["price_wholesale", "الجملة"],
  ["price_bulk", "جملة الجملة"],
  ["image_url", "الصورة"],
  ["expiry_date", "تاريخ الصلاحية"],
  ["supplier", "المورد"],
  ["reorder_level", "حد الطلب"],
  ["reorder_qty", "كمية إعادة التوريد"],
  ["quantity", "أرصدة المستودعات والكميات"],
] as const;
export type PermissionSet = { pages: string[]; actions: string[]; fields: string[] };
export function defaultPermissions(roles: string[]): PermissionSet {
  const manager = roles.includes("storekeeper") || roles.includes("admin");
  return {
    pages: PAGES.map(([k]) => k).filter(
      (k) =>
        roles.includes("admin") ||
        (manager
          ? !["backup", "users"].includes(k)
          : [
              "dashboard",
              "inventory",
              "alerts",
              "labels",
              "catalog",
              "sales",
              "customers",
              "cash",
              "returns",
              "expenses",
            ].includes(k)),
    ),
    actions: ACTIONS.map(([k]) => k).filter(
      (k) =>
        roles.includes("admin") ||
        (manager
          ? !["inventory.delete", "backup.manage"].includes(k)
          : [
              "inventory.export",
              "catalog.print",
              "labels.print",
              "sales.draft",
              "sales.post",
              "customers.manage",
              "cash.manage",
              "returns.manage",
              "expenses.manage",
            ].includes(k)),
    ),
    fields: [...FIELDS.map(([k]) => k), "attributes"],
  };
}
export function isPermitted(
  roles: string[],
  permissions: PermissionSet | null,
  kind: keyof PermissionSet,
  key: string,
) {
  return roles.includes("admin") || (permissions ?? defaultPermissions(roles))[kind].includes(key);
}
export const pageForPath = (path: string) =>
  path === "/" ? "dashboard" : (path.split("/").filter(Boolean)[0] ?? "dashboard");
