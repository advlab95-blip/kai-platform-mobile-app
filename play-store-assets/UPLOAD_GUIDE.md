# دليل الرفع لـPlay Console — Step by Step

## 📦 الـ.aab جاهز

📁 المسار: `/Users/per/Downloads/kai-mobile/kai-platform-v1.0.0-build15.aab`
📏 الحجم: 73 MB
🔢 Version: 1.0.0 (versionCode 15)

---

## 🚀 خطوات الرفع (بـ Play Console)

### Phase 1 — إنشاء التطبيق (مرة وحدة فقط)

١. ادخل https://play.google.com/console
٢. اضغط **Create app**
٣. املأ:
   - **App name**: منصة كاي
   - **Default language**: Arabic (ar)
   - **App or game**: App
   - **Free or paid**: Free
٤. وافق على الـDeclarations
٥. اضغط **Create app**

### Phase 2 — Set up your app (الـ"All set up" requirements)

روح لـ**Dashboard** → ستلقى قائمة "Set up your app" — املأها بالترتيب:

#### App access
- اختر "All functionality is available without special access" لو ما عندك paywall
- أو "All or some functionality is restricted" → ضف:
  - Username: `8787admin@kaiplatform.test`
  - Password: `KAI2026X` (أنشئ حساب admin خاص بالـreviewer)
  - Instructions: "Login codes by role: institute=qqqqqq, teacher=wwwwww, student=rrrrrr"
  - ⚠️ **لا تشارك رمز الادمن الفعلي 8787**

#### Ads
- اختر **No, my app does not contain ads**

#### Content rating
- اضغط **Start questionnaire**
- Email: agentlab9@gmail.com
- Category: **Reference, News, or Educational**
- جاوب على الأسئلة (كلها لا/None لتطبيق تعليمي بدون عنف/مقامرة/تواصل عشوائي)
- Submit → Save

#### Target audience
- **Target age**: 13+ (أكاديمي)
- لا للأطفال تحت ١٣

#### News app
- **Not a news app**

#### COVID-19 contact tracing
- **No**

#### Data safety
- اتبع الـquestions حسب ما هو موجود بـSTORE_LISTING.md → Data Safety Form section

#### Government app
- **No** (إلا إذا فيه شراكة حكومية رسمية)

#### Financial features
- **No** (الـtuition management داخلي، مو معاملات بنكية)

### Phase 3 — Store listing

روح لـ**Grow → Store presence → Main store listing**:

| الحقل | القيمة |
|---|---|
| App name | منصة كاي |
| Short description | (من STORE_LISTING.md) |
| Full description | (من STORE_LISTING.md) |
| App icon | ارفع `assets/icon.png` (1024×1024) |
| Feature graphic | ارفع الـbanner اللي صنعته (1024×500) |
| Phone screenshots | ارفع ٢-٨ صور (يفضّل ٤-٦) |
| App category | Education |
| Tags | education, school, students |
| Email | agentlab9@gmail.com |
| Privacy Policy | URL اللي نشرته من HOSTING_PRIVACY_POLICY.md |

اضغط **Save**.

### Phase 4 — Upload the .aab

١. روح لـ**Release → Production** بـsidebar اليسار
٢. اضغط **Create new release**
٣. تحت **App bundles** اضغط **Upload** → اختار:
   `/Users/per/Downloads/kai-mobile/kai-platform-v1.0.0-build15.aab`
٤. ينتظر ~٢ دقيقة لتحليل الـbundle
٥. **Release name**: اتركه افتراضي (15 (1.0.0))
٦. **Release notes** (Arabic):
   ```
   • الإصدار الأول من منصة كاي
   • دعم كامل للأدوار السبعة
   • تشفير شامل للبيانات
   ```
٧. اضغط **Next** → **Save**

### Phase 5 — Review and submit

١. روح لـ**Publishing overview** → ستلقى زر **Send for review** لما كل شي مكتمل
٢. اضغط **Send 1 release for review**
٣. الـreview يأخذ ~٧ أيام (أول مرة) — قد يكون أسرع

---

## ⏳ Timeline

| المرحلة | الوقت المتوقع |
|---|---|
| Account verification (Play Console) | ٢-٣ أيام (بعد دفع $25) |
| App review (أول إصدار) | ٤-٧ أيام |
| تحديثات لاحقة | ساعات قليلة - ١ يوم |

---

## ❓ مشاكل شائعة

**"Privacy policy URL is invalid"**
→ تأكد أن URL يفتح بدون تسجيل دخول. PDF مرفوض.

**"Your app needs to specify a target API level of 35 or higher"**
→ Expo SDK 54 = targetSdk 35 ✓ (موجود تلقائياً)

**"App bundle is invalid"**
→ تأكد أن signedBy Keystore (EAS يولّد keystore تلقائياً للـproduction profile — موجود)

**"Required content rating questionnaire missing"**
→ روح لـ**Policy → App content → Content rating** → Complete

**"Data safety form is required"**
→ روح لـ**Policy → App content → Data safety** → اتبع STORE_LISTING.md

---

## 🎯 بعد الرفع

١. Play Console يبعتلك إيميل بكل خطوة (received, in review, approved)
٢. لما يتفعّل: الـapp يصير متوفر على https://play.google.com/store/apps/details?id=com.kai.platform
٣. تحديث الـapp مستقبلاً:
   ```
   eas build --platform android --profile production
   ```
   ثم ارفع الـ.aab الجديد لـPlay Console
   (versionCode يبزّز تلقائياً)
