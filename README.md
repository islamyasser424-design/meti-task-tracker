# METI Tasks Tracker · Turso Edge Edition 🚀

نظام تسجيل ومتابعة مهام التوسيم والتدقيق لعمليات **METI**، مربوط بقاعدة بيانات **Turso (LibSQL Edge)** السريعة والمجانية (25,000,000 عملية كتابة شهرياً).

---

## 🌟 الميزات الرئيسية
1. **نفس التصميم الأصلي المتقن 1:1:**
   - واجهة زرقاء سريعة ومريحة لعين الموظف.
   - عداد مهام لحظي (`Tasks Done`) مع خاصية `Undo` و `Reset`.
   - استخراج تلقائي لبيانات الرابط (`https://labeling.robot.car/#...`):
     - `Task ID`
     - `Pass` (FP / QA)
     - `Stage` (Lidar, Image, Relabeling, Sellmapping)
     - `Modality` & `Queue Name` مع شارة ⚡ Auto.
2. **قاعدة بيانات Turso السحابية فائقة السرعة:**
   - ترقيم تسلسلي فريد: `AUTOINCREMENT`.
   - قيد منع التكرار الصارم في قلب قاعدة البيانات:  
     `UNIQUE(task_id, pass, yubikey_email)` يمنع تسجيل نفس المهمة مرتين لنفس الموظف حتى في أجزاء من الثانية.
   - فهارس `Indexes` تضمن سرعة الاستعلامات حتى مع ملايين السجلات.
3. **لوحة الإدارة وتصدير التقارير (Records & Export):**
   - زر مدمج في الشريط العلوي: **📊 Records & Export**.
   - محمي برمز مرور (PIN): `2026` (أو `admin`).
   - يعرض إحصائيات حية: مهام اليوم وإجمالي مهام الداتابيز.
   - جدول يوضح آخر 50 تسجيلة مع تفاصيلها.
   - زر **📥 Export to Excel (CSV)** لتنزيل تقرير كامل بضغطة زر وبصيغة متوافقة 100% مع اللغة العربية (UTF-8 BOM).

---

## 🚀 كيفية التشغيل

### الخيار 1: تشغيل محلي فوري
* فقط اضغط مرتين (Double Click) على ملف `index.html` ليفتح مباشرة في متصفحك (Chrome أو Edge).
* أو عبر تشغيل سيرفر محلي باستخدام بايثون:
  ```bash
  python -m http.server 8000
  ```
  ثم فتح: `http://localhost:8000`

### الخيار 2: نشره أونلاين على GitHub Pages مجاناً (ليستخدمه كل الموظفين)
1. أنشئ مستودعاً جديداً (New Repository) على حسابك في **GitHub** (مثلاً: `meti-tasks-tracker`).
2. ارفع ملف `index.html`.
3. ادخل على **Settings** في المستودع -> ثم **Pages**.
4. اختر الفرع: `main` واضغط **Save**.
5. خلال 30 ثانية ستحصل على رابط مباشر مثل:
   `https://islamyasser424-design.github.io/meti-tasks-tracker/`
   شاركه مع جميع الموظفين وسيعمل فوراً 24/7!

---

## 🗄️ تفاصيل قاعدة بيانات Turso
* **Database URL:** `libsql://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io`
* **Region:** AWS EU West (Ireland)
* **Table:** `task_submissions`
* **Free Tier Quota:** 25,000,000 writes / month (تغطي 10,000 إلى 15,000 مهمة يومياً بفائض 98%).
