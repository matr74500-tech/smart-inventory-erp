# Smart Inventory ERP

يرجى إجراء فحص شامل وكامل (Full Codebase Audit & Update) وتطبيق كافة التعديلات والإضافات التالية على مشروع (SuhailSoft POS & ERP)، مع تنفيذ شرط إزالة الهوية بالكامل:



1. إزالة جميع علامات وشعارات المنصات الخارجية (White-label & Brand Sanitization):

   - إزالة أي شعارات، نصوص، أو علامات ارتباط تظهر في واجهات التطبيق أو الملفات أو الشاشة الافتتاحe-Based Access):

   - تصميم واجهة تسجيل دخول عصرية ونظيفة تعتمد على (اسم المستخدم وكلمة المرور) مع أيقونات واضحة وحالة التحميل (Loading).

   - ربط كل مستخدم بصلاحيات مخصصة (مثل: مدير، أمين مخزن، بائع) تقيد أو تتيح الوصول للشاشات والأزرار بحسب الحساب المدخل في قاعدة بيانات (Supabase).



3. تجميل وتحسين الصفحة الرئيسية (Dashboard UI & Modern Icons):

   - إعادة تصميم الصفحة الرئيسية لتكون سريعة ومنظمة مع رموز وأيقونات تعبيرية حديثة لكل قسم (المخزون، الجرد، البحث، التوريد).



4. جرد المخزون، الإدخال الأولي والتحويل التוריدي:

   - واجهة واضحة للجرد والإدخال الأولي للكميات وتحديثها فوراً.

   - إعداد منطق برمجي (Triggers/Logic) للتحويلات المخزنية وإعادة التوريد عند وصول الصنف لحد الطلب.



5. المزامنة اللحظية (Real-time Inventory Sync):

   - تفعيل Supabase Realtime لتحديث الكميات والأصناف وتفاصيلها لحظياً بين المستودعات عند الإضافة أو النقص أو التعديل.



6. محركات البحث الذكية وماسح الباركود (Smart Search & Barcode):

   - بحث نصي لحظي يتجاهل فروقات الأحرف العربية (أ، إ، ا، ة، ه).

   - دمج ماسح الباركود بالكاميرا لتسهيل البحث السريع وتسجيل المنتجات.



7. فحص أخطاء البناء وتجهيز APK (Build Readiness):

   - مراجعة ملف app.json و package.json والتأكد من أذونات الأندرويد وخلو الكود من أخطاء الـ TypeScript والـ Imports لضمان نجاح بناء الـ APK عبر GitHub Actions بسلاسة.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a43ce18c-9628-4426-a1d2-6f05cab1b285).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
