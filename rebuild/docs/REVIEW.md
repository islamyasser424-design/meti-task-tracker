# مراجعة الكود الفعلي قبل التنفيذ

المستودع `islamyasser424-design/meti-task-tracker`، الأساس `c4757c623374f17b2d1513113db62e1a8418caa6`. لم يُستخدم README لإثبات سلوك التشغيل. لا توجد AGENTS.md أو ملفات CSV/XLSX أو SQL dump للبيانات في هذا checkout.

| الملف/الموضع في الأساس | الملاحظة الفعلية | القرار |
|---|---|---|
| `backend/src/index.js:147` تقريبًا، `db()` | `env.DB` له الأولوية، ثم اتصال Turso واحد فقط | عميل منفصل لكل مصدر دون D1 fallback |
| `backend/wrangler.toml` | DB binding إلى D1 وcron كل 5 دقائق | إعداد `rebuild/wrangler.jsonc` مستقل، بلا cron Sheets |
| `backend/src/index.js:535` و`scheduled` في نهايته | قراءة Sheets بآلية GViz وتسجيلها في D1 | لم يُنقل أي مسار منها إلى التطبيق الجديد |
| `backend/src/index.js:1070` | POST المهام يسبق حاجز المصادقة عند 1354، ويفحص task_id/pass ثم INSERT منفصلًا | مصادقة على الخادم + هوية الحساب + قيد فريد ومعاملة |
| `backend/src/index.js:1144` تقريبًا | إنشاء نتيجة POST يشير إلى `user` قبل تعريفه اللاحق في نفس block؛ قد يُحفظ الصف ثم يفشل إنشاء الرد | رد الحفظ مأخوذ من المعاملة واختبار ضياع الرد وإعادة المحاولة |
| `backend/src/index.js:1531` | delta يستخدم COALESCE على الوقت ومؤشر time:id؛ tombstones تعتمد وقتًا فقط | سجل تغييرات seq متزايد وappend-only واضح |
| `backend/src/index.js:1711–1751` | صفحات OFFSET، واستعلامات COUNT بعد الجلب | keyset على فهرس seq وملخصات صغيرة متزايدة |
| `backend/src/index.js:1216` و`dashboard-ui.js:3630` | dataset endpoint وعملاء analytics يطلبون datasets كبيرة (حتى 25,000) للحساب في المتصفح | لا تُعاد هذه آلية الجلب؛ الحسابات العامة من الملخصات |
| `backend/schema.sql` | archive_2025 وarchive_2026 مطبّعان إلى مجموعة أعمدة مهام؛ لا يحفظان 26/20 عمودًا أصليًا ولا تكرار العناوين | raw table لكل صفحة وregistry للأعمدة الأصلية |
| `backend/migrations/0002_incremental_checkpoint_sync.sql` | نقل ثم DROP للجدول القديم، وصنع submission_key من task_id/labeler/timestamp/pass | لا تشغّل على القواعد الجديدة أو الحالية. Migrations جديدة إضافية بلا DROP/DELETE للبيانات |
| اختبارات `test_unique_constraint_removal` و`test_legacy_and_sheet_dedup` | تنص على تعدد تسجيلات المهمة المشروع، خلاف فحص POST القديم الأضيق | اعتماد قاعدة migration كأساس مؤقت موثق، مع idempotency مستقل |
| `checkPassword()` و`hmac()` وthrottle | قبول plaintext قديم، signing secret افتراضي، rate limits في ذاكرة isolate | لا إعادة استخدام؛ scrypt+pepper، جلسات عشوائية مبهمة في DO، throttling ثابت ومشترك |
| reverse proxy عند 828 | يجلب صفحات GitHub ويحذف CSP | أصول محلية بنفس الإصدار وCSP مقيدة |
| workflow النشر القديم | نشر `backend/**` على main | لم يُعدّل ولم يُشغّل. CI جديد يختبر rebuild فقط ولا ينشر |

الأجزاء القابلة لإعادة الاستخدام: أسماء حقول المهمة، قواعد استخراج Task ID والمرحلة وpass وmodality واستثناءات queue من الفورم، هوية METI وأسلوب عرض السجل، وفكرة تقييد الأدوار والاستعلامات ذات المعاملات. نُقلت قواعد الرابط المحددة إلى `web/task-link.js` مع اختبار يحفظ الأصفار في بداية المعرف. يلزم اعتماد قائمة الوحدات والورديات وQTCs الخاصة بالفريق؛ لا تُستخرج أسماء الموظفين من خدمات قديمة أو تُضاف إلى Git.

لم نعد استخدام backend القديم أو مجمعات analytics الكبيرة كما هي لأن افتراضات المصدر والأمان واستهلاك البيانات تختلف. التقارير المتقدمة تحتاج mapping معتمدًا ومجموعة ملخصات محدودة لكل استعلام شائع.

هذه نتائج مراجعة كود، وليست إثباتًا لحالة الإنتاج أو لوجود أسرار معينة في منصة النشر. قبل التحويل راجع أي قيم افتراضية/كلمات مرور تاريخية ظهرت في النسخة العامة، ودوّر بيانات الاعتماد المتأثرة إن كانت مستخدمة، دون نسخها في issue أو PR أو الدردشة.
