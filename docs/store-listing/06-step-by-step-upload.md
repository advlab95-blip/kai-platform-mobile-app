# دليل الرفع خطوة بخطوة — Google Play Console

## 🎯 الهدف
نشر `kai-platform-v1.0.0-build3.aab` على Google Play Store، أولاً على Internal Testing track للاختبار، ثم على Production.

## 📋 ما تحتاجه قبل البدء

| العنصر | الحالة | الموقع |
|---|---|---|
| ✅ AAB موقّع | جاهز | `~/Downloads/kai-builds/kai-platform-v1.0.0-build3.aab` |
| ✅ Privacy policy نص | جاهز | `docs/privacy-policy.md` |
| ⚠️ Privacy policy URL منشور | يحتاج عمل | (راجع الخطوة 0) |
| ✅ App description | جاهز | `docs/store-listing/02-store-description.md` |
| ⚠️ App icon 512×512 | EAS بناه | يولده Google من الـ AAB |
| ⚠️ Feature graphic 1024×500 | يحتاج تصميم | (راجع `05-graphics-needed.md`) |
| ⚠️ 2+ Screenshots | يحتاج التقاط | (راجع `05-graphics-needed.md`) |
| ✅ حساب Google Play Developer | تأكد عندك | $25 رسم لمرة واحدة |

---

## الخطوة 0 — نشر Privacy Policy على رابط عام

Google يرفض النشر بدون رابط Privacy Policy عام (HTTP 200).

### الخيار الأسهل (5 دقائق): GitHub Gist

1. روح **https://gist.github.com**
2. سجّل دخول بحساب GitHub (لو ما عندك، أنشئ مجاناً)
3. **Filename:** `privacy-policy.md`
4. الصق محتوى `docs/privacy-policy.md` كاملاً
5. اضغط **Create public gist**
6. اضغط **Raw** فوق-يمين الـ gist
7. انسخ الرابط — هذا هو رابط Privacy Policy

**مثال على الرابط:**
```
https://gist.githubusercontent.com/USERNAME/HASH/raw/privacy-policy.md
```

### بديل: استضافة على Vercel project

إذا عندك مشروع Vercel جاهز (يبدو موجود من `kai-platform-canvas.vercel.app`):
1. أضف ملف `app/privacy/page.tsx` فيه محتوى السياسة
2. Deploy → الرابط يصير `https://kai-platform-canvas.vercel.app/privacy`

**👉 احتفظ بالرابط — راح نحطه في الخطوة 4.**

---

## الخطوة 1 — التسجيل في Google Play Console (لو أول مرة)

1. روح **https://play.google.com/console/signup**
2. سجّل دخول بحساب Google
3. اختر **Personal** (لو حساب فردي) أو **Organization** (لو مؤسسة)
4. عبّي البيانات + ادفع $25
5. تحقق من هويتك (يطلب صورة هوية)

⏱️ **التحقق يأخذ من ساعة لـ 48 ساعة.** بعد الموافقة تكدر تكمل.

**👉 لو عندك حساب جاهز، سكب هذي الخطوة.**

---

## الخطوة 2 — إنشاء التطبيق

1. **https://play.google.com/console** → سجّل دخول
2. اضغط **Create app** أعلى-يمين
3. عبّي:
   - **App name:** `منصة كاي`
   - **Default language:** `Arabic – ar`
   - **App or game:** `App`
   - **Free or paid:** `Free`
4. وافق على الـ 2 declarations:
   - ✅ Developer Program Policies
   - ✅ US export laws
5. اضغط **Create app**

✅ **التطبيق انشئ.** الآن لوحة Setup مع قائمة مهام يسار.

---

## الخطوة 3 — Privacy & Compliance

### App content (يسار، تحت Policy)

#### Privacy Policy
1. اضغط **Privacy Policy**
2. الصق الرابط من الخطوة 0
3. **Save**

#### App access
1. اضغط **App access**
2. اختر **All or some functionality is restricted**
3. **Add new instructions:**
   - **Username:** (رمز تجريبي عندك، مثلاً `student_demo`)
   - **Password:** (الرمز نفسه)
   - **Any other information:** "هذا حساب طالب تجريبي. الإدارة تنشئ الحسابات يدوياً، التطبيق ما فيه self-signup."
4. **Save**

#### Ads
1. اضغط **Ads**
2. اختر **No, my app does not contain ads**
3. **Save**

#### Content rating
1. اضغط **Content rating** → **Start questionnaire**
2. **Email:** بريدك
3. **Category:** اختر **Reference, News, or Educational**
4. عبّي الاستبيان حسب `04-content-rating.md`:
   - كل الأسئلة عن العنف/الجنس/المخدرات/القمار = **No**
   - User-generated content shared publicly = **No**
   - Sharing personal info with 3rd parties = **No**
5. **Save** → **Submit**
6. التصنيف يطلع **Everyone** أو **Everyone 10+**

#### Target audience
1. اضغط **Target audience and content**
2. **Target age:** 13+ (ابدأ من 13 لتجنّب COPPA الإضافي)
3. **Does your app appeal to children?** No
4. **Save**

#### Data safety
1. اضغط **Data safety** → **Start**
2. **Does your app collect or share required user data types?** Yes
3. **Is all of the user data collected by your app encrypted in transit?** Yes
4. **Do you provide a way for users to request that their data is deleted?** Yes
   - Method: "By email request to support@kai-platform.app"
5. اختر البيانات المجمّعة (راجع `04-content-rating.md` تفصيل):
   - Personal: Name, Email, Phone, User IDs
   - Photos: Profile + uploads
   - Audio: Voice messages (only if you implement voice)
   - App activity: usage analytics
   - App info: Crash logs
6. لكل عنصر، اختر:
   - **Collected** (ينحفظ في DB)
   - **Used for:** App functionality
   - **Required or optional:** Required (لتسجيل الدخول)
7. **Save** → **Next** → **Submit**

#### Government apps
1. اضغط **Government apps** → اختر **No**

#### News apps
1. اضغط **News apps** → اختر **No**

#### Health apps (لو ينطبق على فيتشر الطبابة)
- اختر **Yes** + اشرح: "Medical records visible only to school medical staff and parents"

---

## الخطوة 4 — Store listing (الواجهة على المتجر)

يسار → **Main store listing**

### App details
- **App name:** `منصة كاي` (موجود من الخطوة 2)
- **Short description:** الصق من `02-store-description.md` (الجزء الأول)
- **Full description:** الصق من `02-store-description.md` (الجزء الثاني)

### Graphics
- **App icon:** يرفع من `assets/icon.png` (أو يولّده Google من AAB)
- **Feature graphic:** ارفع 1024×500 PNG (راجع `05-graphics-needed.md`)
- **Phone screenshots:** ارفع 2-8 (راجع `05-graphics-needed.md`)

### Categorization
- **App category:** Education
- **Tags:** Education, School, Productivity

### Contact details
- **Email:** `support@kai-platform.app`
- **Phone (اختياري):** ضع رقم تواصل
- **Website:** `https://kai-platform.app`

### Save → كل القسم يصير ✅

---

## الخطوة 5 — رفع AAB على Internal Testing (موصى به أولاً)

**ليش Internal Testing مو Production مباشرة؟**
- اختبار سريع على 100 شخص قبل المتجر العام
- يمر بمراجعة Google لكن أسرع (ساعات بدل أيام)
- لو فيه مشكلة، تصلحها بدون ما تنزل من Production

### الخطوات

1. يسار → **Testing** → **Internal testing**
2. اضغط **Create new release** أعلى-يمين
3. **App signing:** Google يطلب الموافقة على Play App Signing → اضغط **Continue**
4. **Bundle:** اسحب الملف:
   ```
   ~/Downloads/kai-builds/kai-platform-v1.0.0-build3.aab
   ```
5. ينتظر Google يعالج (~30 ثانية)
6. **Release name:** `1.0.0 (3)` (Google يولّده تلقائياً)
7. **Release notes:**
   - **Default language (ar-SA):** الصق من `03-release-notes.md`
8. **Save** → **Review release** (يفحص أي تنبيهات)
9. لو في تنبيهات صفراء ومحلولة، اضغط **Start rollout to Internal testing**
10. **Confirm**

✅ **الإصدار قيد المراجعة.** عادة Google يوافق على Internal testing خلال 1-3 ساعات.

### إضافة المختبرين (Internal testers)

1. **Internal testing** → **Testers** tab
2. **Create email list** → الصق إيميلات (إيميلك أنت + إيميل ٢-٣ مختبرين)
3. **Save changes**
4. انسخ **Opt-in URL** → ابعثه للمختبرين
5. كل مختبر يدخل الرابط → يقبل الانضمام → يحمّل التطبيق من Play Store

---

## الخطوة 6 — Production rollout (بعد ما Internal testing نجح)

بعد ما المختبرون يأكدون التطبيق شغّال على أجهزتهم:

1. يسار → **Production**
2. **Create new release**
3. **Promote release from:** Internal testing → اختر آخر إصدار
4. **Release notes:** نفس اللي في Internal testing
5. **Save** → **Review release** → **Start rollout to Production**
6. **Rollout percentage:**
   - ابدأ بـ **20%** (آمن)
   - بعد 24 ساعة بدون مشاكل → ارفعها لـ **50%**
   - بعد 48 ساعة → **100%**

⏱️ **مراجعة Production أطول:** 1-3 أيام في الغالب.

---

## ⏱️ Timeline متوقع

| الخطوة | الوقت |
|---|---|
| 0. نشر Privacy Policy | 5-30 دقيقة |
| 1. التسجيل في Play Console (لو أول مرة) | 1-48 ساعة |
| 2. إنشاء التطبيق + بيانات الستور | 30-60 دقيقة |
| 3. Privacy/Compliance forms | 30 دقيقة |
| 4. Store listing + screenshots | 1-2 ساعة |
| 5. Internal testing rollout | 5 دقائق + 1-3 ساعة مراجعة |
| 6. Production rollout | 5 دقائق + 1-3 أيام مراجعة |

**المجموع:** ~3-5 أيام للنشر العام (المعظم انتظار مراجعة Google).

---

## 🆘 لو طلعت أخطاء شائعة

### "App bundle is signed with a different certificate"
يعني Google عنده signing key سابق. الحل: في Play Console → **Setup** → **App integrity** → استخدم Play App Signing → ارفع ضمن Internal testing track مرة وحدة، Google يستلم الـ key.

### "Privacy policy URL is not reachable"
الرابط لازم يعطي HTTP 200 في خلال 10 ثواني. تأكد:
- مو HTTPS مكسور
- مو يحتاج تسجيل دخول
- يفتح من متصفح خارجي بدون VPN

### "Target API level too low"
EAS بنى بـ targetSdkVersion 34 (Android 14) — Google يقبل. لو طلعت رسالة، حدّث `app.json` → `android.targetSdkVersion` → 35 → أعد البناء.

### Screenshots مرفوضة
- لازم 320px-3840px على كل ضلع
- مو شفافة (no transparent background)
- مو فيه رمز الـ status bar الفعلي للجهاز

---

## 📞 لو احتجت مساعدة

ابعث لي رسالة عند أي خطوة، خصوصاً:
- لو طلعت أخطاء في Console
- لو فيه حقل ما تعرف وش تحط فيه
- لو تحتاج تعدّل الـ AAB (تغيير icon/version/permissions)
