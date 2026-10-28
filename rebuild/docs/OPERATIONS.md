# التشغيل والأسرار والترحيل

## حدود النشر

الاسم الافتراضي للعامل `meti-turso-review`. لا يوجد deploy script أو workflow نشر تلقائي للمسار الجديد. أمر `npm run build` هو dry-run فقط. قواعد البيانات الحالية لم تُقرأ أو تُعدّل في هذه الجلسة. لا تُحوّل نطاقًا ولا تنفذ migration على قواعد فعلية قبل اعتماد الوجهة والنتيجة.

هذه النسخة تستهدف **Turso libSQL/SQLite** و`/v2/pipeline`، مع دعم transactions وtriggers. تحقّق من محرك كل قاعدة أولًا؛ محرك Turso الجديد المختلف ليس بديلًا صامتًا. لا تستخدم migration D1 القديمة؛ بعضها يعيد بناء الجداول ويمسح القديم، ولا يحفظ أعمدة الأرشيف كما وردت.

## الأسرار

في Cloudflare Dashboard: Workers & Pages → العامل الخاص بالمراجعة → Settings → Variables and Secrets. أضف القيم كـ **Secret**، أو استخدم أوامر Wrangler التفاعلية التالية من `rebuild/` بعد إنشاء عامل المراجعة باسم الإعداد. لا تستخدم قيمة السر كوسيط command-line ولا تضعها في الدردشة.

```bash
npx wrangler secret put ARCHIVE_2025_URL
npx wrangler secret put ARCHIVE_2025_TOKEN
npx wrangler secret put ARCHIVE_2026_URL
npx wrangler secret put ARCHIVE_2026_TOKEN
npx wrangler secret put LIVE_DB_URL
npx wrangler secret put LIVE_DB_TOKEN
npx wrangler secret put AUTH_PEPPER
```

احتفظ بــ AUTH_PEPPER عشوائي قوي (32 بايت على الأقل) في مدير أسرار، واستخدم القيمة نفسها لدى إنشاء hashes المستخدمين. تغييره دون إعادة إعداد كلمات المرور يمنع الدخول. لا يوجد secret افتراضي. القيم الست للاتصال مستقلة حتى إن كان الحساب واحدًا. حساب Turso/Organization هو نطاق الحصة المشترك.

وقت التشغيل: استخدم توكن read-only لكل أرشيف بعد الاستيراد (`turso db tokens create <database-name> --read-only`؛ ناتج الأمر سر لا تنسخه إلى logs). استعمل توكن كتابة منفصلًا مؤقتًا للمستورد داخل بيئة خاصة، وتوكنًا للقاعدة الجديدة بأقل صلاحيات متاحة. اضبط انتهاء الصلاحية ودوران التوكنات في مدير الأسرار. لا تضف management token إلى العامل؛ يستعمله مراقب الاستخدام فقط.

محليًا: انسخ `.dev.vars.example` إلى `.dev.vars` واضبطها عبر محرر خاص. الملف متجاهل من Git، لكن تجاهله ليس تشفيرًا. للتشغيل `npm run dev`؛ استخدم `APP_ENV=test` **محليًا فقط** لأنه يسمح HTTP وcookie محلية. إعداد النشر يبقى `APP_ENV=production` ويستخدم HTTPS وSecure cookie.

## migrations والمستخدم الأول

ملف `private/import.env` مثال لاسم ملف إعداد خاص؛ أنشئه خارج الملفات المنشورة، بأذونات 0600، وبالقيم اللازمة فقط. `private/` متجاهل من Git. أو مرّر متغيرات البيئة من مدير أسرار في جلسة العمل.

```bash
node scripts/migrate.mjs --target live --env private/import.env
node scripts/migrate.mjs --target 2025 --env private/import.env
node scripts/migrate.mjs --target 2026 --env private/import.env
```

الأوامر لا تنشئ قواعد أو تحذف بيانات. تضيف جداول `meti_*` وتسجل checksum لكل migration. إعادة التشغيل آمنة ما لم تتغير migration منشورة؛ عندها يلزم ملف migration جديد. `opened_at` للمهام الجديدة يثبت أول مرة ولا يُصفّر عند إعادة النشر. لا تقبل API تسجيلًا بوقت حدث أقدم منه، لحماية الفصل عن الأرشيف. لا تستخدم النموذج لترحيل تاريخ قديم.

إنشاء مسؤول أول بأداة CLI من دون وضع كلمة المرور في history:

```bash
read -r -s -p 'Initial password: ' METI_INITIAL_PASSWORD
export METI_INITIAL_PASSWORD
node scripts/user.mjs --username your-admin --name 'اسم المسؤول' --role admin --env private/import.env
unset METI_INITIAL_PASSWORD
```

كلمة المرور 12–256 حرفًا. التخزين scrypt N=32768,r=8,p=3 مع salt عشوائي وHMAC pepper؛ لا fallback للـplaintext. الحسابات القديمة لا تُنسخ بكلمات مرورها تلقائيًا. كرر الإجراء للحسابات المعتمدة بأدوار `operator` أو`supervisor`. لا توجد صفحة تسجيل عامة أو password-reset عبر Apps Script. إضافة إدارة دورة كلمات المرور/SSO لاحقًا مسار مستقل قبل توسيع النشر.

`PATCH /api/admin/users/:id` يقبل `{role,active}` لمسؤول مسجل، مع Origin وCSRF، ويزيد auth_version ويلغي جلسات الهدف فورًا. التغيير خارج API لا يصل إلى الجلسات المخبأة إلا عند الفحص التالي خلال 60 ثانية. لا يمكن للمسؤول تعطيل نفسه بهذا endpoint.

## استيراد الأرشيف مرة واحدة

المدخل الحالي CSV أو TSV بترميز UTF-8. المستورد لا يفتح Sheets أو Apps Script ولا ينفذ مزامنة لاحقة. إن كان الأصل XLSX احتفظ به مستقلًا؛ أرفقه أولًا لفحص نوع الخلايا/تنسيقات المعرّفات قبل اعتماد طريقة استخراج نصية. تصدير Excel عشوائيًا قد يكون أزال الأصفار قبل وصول الملف للمستورد ولا يمكنه استعادتها.

قبل التشغيل احفظ نسخة مستقلة من الأصل وبصمة SHA-256. `--rows` يعني **صفوف البيانات دون صف العناوين**. عدد الأعمدة يشمل العناوين الفارغة والمكررة. الأوامر التالية تستخدم أرقام الطلب، وليست تأكيدًا لها:

```bash
node scripts/import-archive.mjs --year 2025 --file private/archive-2025.csv --source archive-2025-main --page '2025 original page' --rows 54539 --columns 26 --env private/import.env
node scripts/import-archive.mjs --year 2026 --file private/archive-2026-january.csv --source archive-2026-january --page 'January 2026' --rows 34635 --columns 20 --env private/import.env
```

حدد source ثابتًا لكل صفحة. بعد انقطاع التشغيل أعد **نفس الأمر ونفس الملف**؛ الدفعات (100 صف) محفوظة مع checkpoint داخل نفس المعاملة. ملف مكتمل بنفس البصمة يصبح no-op. نفس المصدر بملف مختلف، أو نفس الملف تحت مصدر جديد، يُرفض. الصفوف الجزئية لا تظهر في API ولا تدخل التقارير إلى أن تكتمل وتنجح المراجعة. عند ملف تالف/manifest خاطئ لا تستبدل المصدر الجزئي تلقائيًا؛ افحصه ثم جهز migration إصلاح معتمدة تحفظ الأصل.

المراجعة تشمل العدد، عرض كل صف، تسلسل source_row، وdigest لكل القيم الأصلية بالترتيب. API الأرشيف للمشرف يعرض العنوان الأصلي مع الاسم التقني. raw source_row يبدأ من 2 ويعد سجلات CSV المنطقية، حتى لو احتوت الخلية على newline. تبقى صيغة الخلية النصية كما هي ولا trim أو numeric coercion.

## اعتماد ملخصات الأرشيف

بعد معاينة العناوين والعينات، أنشئ mapping خاصًا **بأرقام الأعمدة التقنية المعتمدة فعليًا**. العقد الحالي:

- `metric_version`: `submission-v1`.
- `row_semantics`: `one-row-per-submission`؛ إقرار من مالك البيانات، لا استنتاج من عدد الصفوف.
- `object_count`: اسم cNNN الصحيح، مع قيم أعداد صحيحة غير سالبة.
- `occurred_at`: اسم cNNN الصحيح.
- `timestamp_format`: `iso8601` في الإصدار الحالي، مع Z أو offset. أي تاريخ محلي/غامض يحتاج parser محدد ومعتمد قبل المتابعة.

أعد أمر الاستيراد بنفس الملف وأضف `--mapping private/approved-mapping.json`. التخزين raw يبقى كما هو. تبنى الملخصات مرة واحدة بعد التحقق؛ تعديل mapping مقفل يحتاج migration مراجعة.

قبل تفعيل `all`، افحص حدود جميع الصفحات وأنها لا تتداخل بعضها مع بعض أو مع `meti_live_config.opened_at`، وأن الصف ليس مكررًا داخل مصدره، ثم اعتمد علم `archive_boundary_confirmed=1` عبر change إدارة معتمد. يوجد guard إضافي في API يمنع الجمع عندما تتداخل ranges الزمنية حتى لو رفع العلم. إن كانت صفحات مشروعة تتداخل زمنيًا لكن تسجيلاتها مختلفة، يلزم تصميم إثبات فصل أقوى بدل تجاوز guard. لا يجلب `all` الصفوف الخام مطلقًا.

## نسخة احتياطية واسترجاع مستقل

للأرشيف المكتمل والثابت، صدّر snapshot مستقلًا عن الحساب بوسيلة Turso الرسمية. الأمر الحالي `turso db export <database> --output-file <new-file>`؛ **قد لا يشمل آخر تغييرات القاعدة** بحسب التوثيق. لذلك لا تعتمد snapshot غير متحقق منه لقاعدة live المتغيرة. عند cutover خذ لقطة متسقة بعد إيقاف الكتابة المخطط له، وراجع آخر seq وملخصاته بالقراءة من primary أو وسيلة backup/SDK معتمدة لمزامنة اللقطة. لا تنفّذ embedded sync دائمًا للتطبيق.

```bash
turso db export archive-2025 --output-file private/backups/archive-2025-export.db
node scripts/backup.mjs --file private/backups/archive-2025-export.db --output private/backups/archive-2025-restore-test.sqlite
```

كرر للأرشيف الآخر ولـlive بلقطة متحققة. أداة backup ترفض الكتابة فوق ملف موجود، تنشئ نسخة مستقلة، تنفذ integrity_check، وتقارن count وSHA-256 لكل جدول وقيمه. لصيغة SQL dump مراجعة مسبقة:

```bash
node scripts/backup.mjs --dump private/backups/reviewed.dump.sql --output private/backups/new-restore-test.sqlite
```

نجاح restore محلي لا يثبت وحده أن cloud export حديث أو كامل؛ قارنه ببصمة مصدر الاستيراد، والأعداد، وأحدث seq في المصدر. خزّن نسخة مشفرة خارج جهاز التشغيل وحساب Turso، مع حفظ مفتاحها منفصلًا. الاختبارات هنا أثبتت آلية backup/restore لبيانات مصطنعة فقط؛ لم تُؤخذ backup من القواعد الحالية.

## المراقبة والقياس السحابي

ضع `TURSO_ORG` و`TURSO_MANAGEMENT_TOKEN` في GitHub repository/environment secrets للمراقب، لا في الواجهة. `.github/workflows/meti-usage-monitor.yml` يفحص Organization Usage كل 6 ساعات **بعد اعتماده ودمجه في الفرع الافتراضي**. تجاوز 70% يسبب workflow failure مع `::error::`؛ فعّل إشعارات فشل Actions للمسؤول. لم يرسل التغيير رسالة ولم يفعل monitor في حسابك. جدولة GitHub ليست SLA، وفشل إعداد secrets/الشبكة يظهر أيضًا فشلًا. راجع يدويًا لوحة Turso/Cloudflare عند الإنذار.

```bash
node scripts/monitor.mjs --env private/monitor.env --threshold 0.7 --output private/usage.json
```

العدادات تشمل كل قواعد Organization، بما فيها أي حمل قديم. عتبات الافتراضات للخطة المجانية الحالية: 500M reads،10M writes،5GB storage؛ عدّلها إذا اختلفت خطة الحساب. راقب أيضًا Cloudflare requests وDO SQLite usage وduration على لوحة Cloudflare واضبط تنبيهاتها؛ لا تقاس بحصة Turso.

لقياس صفوف Turso الفعلية أنشئ **قاعدة اختبار منفصلة باسم meti-bench-...** في بيئة خاصة بعد الاعتماد، واضبط LIVE_DB_URL/TOKEN لها داخل ملف قياس خاص، مع management credentials. لا تستخدم new-database أو الأرشيف لهذا الحمل:

```bash
node scripts/measure-turso.mjs --database meti-bench-review --samples 100 --env private/bench.env --output private/turso-measurement.json
```

البرنامج يرفض hostname غير مطابق، يسجل snapshots من Usage API الرسمي، ويختبر save/retry/list/changes/summary دون حذف صفوف. إذا لم تتحدث العدادات، يعيد نتيجة inconclusive بدل قراءة صفر وهمية. القياس يشمل أي حركة أخرى/تأخر في نفس قاعدة الاختبار؛ أعد القياس بعد استقرار العدادات، وقارن Stats/top_queries دون نشر SQL أو معاملات تحتوي بيانات حقيقية. أرقام الاختبار المحلي ليست billed row reads.

## مراجعة ونشر وتحويل

بعد اعتماد الفرع والنتائج: جهز بيئة المراجعة وأسرارها ومستخدمها، شغّل migrations فيها ثم `npx wrangler deploy` **يدويًا** لعامل المراجعة فقط. اختبر المتصفح الحقيقي والأجهزة المقصودة وعدادات الاستخدام والـcutover/restore. لا توجّه الأسرار إلى قواعد الإنتاج لمجرد معاينة الواجهة.

قبل التحويل الإنتاجي يلزم اعتماد منفصل للنتيجة والوجهة. حينها حدد نافذة قطع وbackup متحققًا، عطّل الكتابة/cron Sheets القديمين حتى لا يبقيا مصدرين للتسجيل، واربط الفورم والداش بورد بالعامل الجديد على نفس النطاق. لا تمسح القواعد أو الجداول القديمة. احتفظ بمسار رجوع للواجهة مع تعطيل التسجيل المزدوج؛ لا ترجع إلى قاعدة أقدم متجاهلًا المهام الجديدة، بل احتفظ بسجلها وخطة reconciliation معتمدة. تحديث التطبيق بعد الاستيراد لا يحتاج Sheets إطلاقًا.

## مصادر الحدود والواجهات (تم التحقق في 28 أكتوبر 2026)

- [Turso pricing](https://turso.tech/pricing)، [rows scanned and billing](https://docs.turso.tech/help/usage-and-billing).
- [Organization Usage](https://docs.turso.tech/api-reference/organizations/usage)، [Database Usage](https://docs.turso.tech/api-reference/databases/usage)، [Stats](https://docs.turso.tech/api-reference/databases/stats).
- [read-only tokens](https://docs.turso.tech/cli/db/tokens/create)، [snapshot export وحدوده](https://docs.turso.tech/cli/db/export).
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)، [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)، [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
- [node:crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)، [OWASP scrypt parameters](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
- [libSQL consistency model](https://github.com/tursodatabase/libsql/blob/main/docs/CONSISTENCY_MODEL.md)، [replica write forwarding](https://github.com/tursodatabase/libsql/blob/main/docs/USER_GUIDE.md). لا تفترض تطابق replicas بمجرد نجاح write على primary.
