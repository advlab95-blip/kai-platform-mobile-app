# 📖 دليل نشر منصة كاي — خطوة بخطوة مع صور
## كل شي لازم تسويه قبل وبعد النشر

---

# 📌 الخطوة 1: تشغيل Migrations بـ Supabase

## 1.1 افتح Supabase Dashboard
- روح: https://supabase.com/dashboard
- اختر مشروعك (Kai Platform Canvas)
- من القائمة اليسار اضغط **SQL Editor**

## 1.2 شغّل كل Migration بالترتيب

انسخ محتوى كل ملف وألصقه بالـ SQL Editor واضغط **Run**:

### الملف 1: `20260414_manual_grades.sql`
- موقعه: `supabase/migrations/20260414_manual_grades.sql`
- انسخ كل المحتوى → ألصق بـ SQL Editor → Run
- لازم يطلع ✅ Success

### الملف 2: `20260414_attendance_devices.sql`
- موقعه: `supabase/migrations/20260414_attendance_devices.sql`
- نفس الطريقة

### الملف 3: `20260414_promotion_system.sql`
- موقعه: `supabase/migrations/20260414_promotion_system.sql`

### الملف 4: `20260414_final_setup.sql`
- موقعه: `supabase/migrations/20260414_final_setup.sql`

### الملف 5: `20260415_auto_cleanup_messages.sql`
- موقعه: `supabase/migrations/20260415_auto_cleanup_messages.sql`

**لو طلع خطأ "already exists"** → عادي، يعني سويته من قبل. كمّل للملف التالي.

---

# 📌 الخطوة 2: تفعيل pg_cron + جدولة الحذف التلقائي

## 2.1 تفعيل pg_cron
1. روح **Supabase Dashboard**
2. من القائمة اليسار اضغط **Database**
3. اضغط **Extensions**
4. بمربع البحث اكتب: `pg_cron`
5. اضغط **Enable**
6. انتظر ثواني لحد ما يتفعل ✅

## 2.2 جدولة الحذف التلقائي
1. روح **SQL Editor**
2. انسخ هالكود وشغّله:

```sql
SELECT cron.schedule(
  'cleanup-old-messages',
  '0 3 * * *',
  'SELECT public.cleanup_old_messages()'
);
```

**شنو يسوي هالكود:**
- `cleanup-old-messages` = اسم الجدولة
- `0 3 * * *` = كل يوم الساعة 3:00 صباحاً
- يستدعي الدالة اللي تمسح الرسائل القديمة

## 2.3 تأكد إنه شغّال:
```sql
SELECT * FROM cron.job;
```
لازم تشوف سطر باسم `cleanup-old-messages` ✅

---

# 📌 الخطوة 3: نشر Edge Functions

## 3.1 ثبّت Supabase CLI (لو ما مثبّت)
افتح Terminal واكتب:
```bash
npm install -g supabase
```

## 3.2 سجّل دخول
```bash
supabase login
```
يفتح المتصفح → سجّل دخول بحسابك → ارجع للـ Terminal

## 3.3 اربط المشروع
```bash
cd /Users/per/Downloads/kai-mobile
supabase link --project-ref mrytoccwpgcyirjrpanu
```
**ملاحظة:** `mrytoccwpgcyirjrpanu` هو الـ project ID مالك (موجود بالـ URL).

## 3.4 انشر Edge Functions
```bash
# Edge Function 1: جهاز البصمة
supabase functions deploy attendance-device

# Edge Function 2: AI Proxy (يوفّر تكاليف AI)
supabase functions deploy ai-proxy
```

## 3.5 أضف المفاتيح للـ Edge Functions
```bash
# مفتاح Gemini (للـ AI)
supabase secrets set GEMINI_API_KEY=مفتاحك_هنا

# أو مفتاح OpenAI
supabase secrets set OPENAI_API_KEY=مفتاحك_هنا
```

### كيف تحصل مفتاح Gemini مجاني:
1. روح: https://aistudio.google.com/apikey
2. اضغط **Create API Key**
3. انسخ المفتاح
4. حطه بالأمر أعلاه

---

# 📌 الخطوة 4: تغيير المفاتيح المكشوفة

## ⚠️ مهم جداً — هالمفاتيح كانت مكشوفة بالكود القديم

### 4.1 Supabase Service Role Key
1. روح **Supabase Dashboard** → **Settings** → **API**
2. بقسم **service_role key** اضغط **Reveal**
3. اضغط **Generate new key** أو **Rotate**
4. انسخ المفتاح الجديد
5. حدّث `.env`:
```
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=المفتاح_الجديد
```

### 4.2 Bunny Stream API Key
1. روح: https://dash.bunny.net
2. اضغط **Stream** → **API Key**
3. اضغط **Regenerate**
4. حدّث `.env`:
```
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=المفتاح_الجديد
```

### 4.3 Bunny Storage Password
1. بنفس الداشبورد → **Storage** → اختر الـ Zone
2. **FTP & API Access** → **Password** → **Reset**
3. حدّث `.env`:
```
EXPO_PUBLIC_BUNNY_STORAGE_PASSWORD=المفتاح_الجديد
```

### 4.4 Cloudflare API Token
1. روح: https://dash.cloudflare.com/profile/api-tokens
2. بجنب التوكن القديم اضغط **Roll** أو أنشئ توكن جديد
3. حدّث `.env`:
```
EXPO_PUBLIC_CLOUDFLARE_API_TOKEN=المفتاح_الجديد
```

---

# 📌 الخطوة 5: EAS Secrets

## شنو EAS Secrets؟
مكان آمن تحط بيه المفاتيح — تنحقن وقت البناء فقط ولا أحد يشوفها.

## 5.1 ثبّت EAS CLI (لو ما مثبّت)
```bash
npm install -g eas-cli
eas login
```

## 5.2 أضف المفاتيح
```bash
# Supabase URL
eas secret:create EXPO_PUBLIC_SUPABASE_URL --value "https://mrytoccwpgcyirjrpanu.supabase.co" --scope project

# Supabase Anon Key (انسخه من Supabase Dashboard → Settings → API)
eas secret:create EXPO_PUBLIC_SUPABASE_ANON_KEY --value "المفتاح_هنا" --scope project

# AI API Key (Gemini)
eas secret:create EXPO_PUBLIC_AI_API_KEY --value "المفتاح_هنا" --scope project

# AI Provider
eas secret:create EXPO_PUBLIC_AI_PROVIDER --value "gemini" --scope project

# Bunny Stream
eas secret:create EXPO_PUBLIC_BUNNY_STREAM_API_KEY --value "المفتاح_الجديد" --scope project
eas secret:create EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID --value "632959" --scope project
eas secret:create EXPO_PUBLIC_BUNNY_STREAM_CDN --value "vz-feb784be-57b.b-cdn.net" --scope project

# Bunny Storage
eas secret:create EXPO_PUBLIC_BUNNY_STORAGE_ZONE --value "kai-platform" --scope project
eas secret:create EXPO_PUBLIC_BUNNY_STORAGE_PASSWORD --value "المفتاح_الجديد" --scope project
eas secret:create EXPO_PUBLIC_BUNNY_STORAGE_CDN --value "kaiplatformfiles.b-cdn.net" --scope project
```

## 5.3 تأكد إنها انحفظت
```bash
eas secret:list
```
لازم تشوف كل المفاتيح بالقائمة ✅

---

# 📌 الخطوة 6: google-services.json (للـ Android)

## ليش تحتاجه؟
للإشعارات Push Notifications على Android (Firebase Cloud Messaging)

## 6.1 أنشئ مشروع Firebase
1. روح: https://console.firebase.google.com
2. اضغط **Add Project** → اسم المشروع: `Kai Platform`
3. اضغط **Continue** (بدون Google Analytics عادي)

## 6.2 أضف تطبيق Android
1. بالمشروع اضغط أيقونة **Android** (الروبوت)
2. **Android package name:** `com.kai.platform`
3. **App nickname:** منصة كاي
4. اضغط **Register app**

## 6.3 حمّل google-services.json
1. اضغط **Download google-services.json**
2. حط الملف بمجلد المشروع:
```
/Users/per/Downloads/kai-mobile/google-services.json
```

## 6.4 تأكد إنه بالمكان الصحيح
الملف `app.json` أصلاً يشير للملف:
```json
"android": {
  "googleServicesFile": "./google-services.json"
}
```

---

# 📌 الخطوة 7: بناء ونشر التطبيق

## 7.1 بناء للمتجرين
```bash
cd /Users/per/Downloads/kai-mobile

# بناء iOS + Android
eas build --platform all --profile production
```

**الوقت المتوقع:** 15-30 دقيقة

## 7.2 رفع للمتاجر
```bash
# رفع لـ App Store (iOS)
eas submit --platform ios --profile production

# رفع لـ Google Play (Android)
eas submit --platform android --profile production
```

## 7.3 بعد الرفع — تحديثات مستقبلية

### تحديث صغير (بدون المتجر — فوري):
```bash
eas update --branch production --message "وصف التحديث"
```
المستخدم يفتح التطبيق → يتحدّث تلقائي ✅

### تحديث كبير (عبر المتجر):
```bash
eas build --platform all --profile production
eas submit --platform all --profile production
```

---

# 📌 الخطوة 8: إعدادات إضافية للأمان والتوفير

## 8.1 تفعيل Rate Limiting بـ Supabase
روح **SQL Editor** وشغّل:
```sql
-- حد 100 طلب بالدقيقة لكل مستخدم (حماية من الـ spam)
-- هذا يتطلب Supabase Pro plan
```

## 8.2 تفعيل Supabase Pro Plan
- روح **Settings** → **Billing** → **Upgrade to Pro**
- $25/شهر — يعطيك:
  - 8GB database
  - 250GB bandwidth
  - Connection pooling
  - Daily backups

## 8.3 مراقبة التكاليف
- **Supabase:** Dashboard → Usage
- **Bunny:** Dashboard → Statistics → Bandwidth
- **AI:** اضغط بالمتجر على تكاليف API مالك

---

# 📌 ملخص الأوامر كلها بالترتيب:

```bash
# 1. تثبيت الأدوات
npm install -g supabase eas-cli
supabase login
eas login

# 2. ربط المشروع
cd /Users/per/Downloads/kai-mobile
supabase link --project-ref mrytoccwpgcyirjrpanu

# 3. نشر Edge Functions
supabase functions deploy attendance-device
supabase functions deploy ai-proxy

# 4. مفاتيح Edge Functions
supabase secrets set GEMINI_API_KEY=مفتاحك

# 5. EAS Secrets (كل المفاتيح)
eas secret:create EXPO_PUBLIC_SUPABASE_URL --value "https://mrytoccwpgcyirjrpanu.supabase.co" --scope project
eas secret:create EXPO_PUBLIC_SUPABASE_ANON_KEY --value "مفتاحك" --scope project
eas secret:create EXPO_PUBLIC_AI_API_KEY --value "مفتاحك" --scope project
eas secret:create EXPO_PUBLIC_AI_PROVIDER --value "gemini" --scope project

# 6. بناء
eas build --platform all --profile production

# 7. نشر
eas submit --platform all --profile production

# 8. تحديث مستقبلي (بدون متجر)
eas update --branch production --message "وصف التحديث"
```

---

# ⚠️ لا تنسى:
1. ✅ شغّل الـ 5 migrations بـ SQL Editor
2. ✅ فعّل pg_cron + شغّل الـ schedule
3. ✅ غيّر كل المفاتيح المكشوفة
4. ✅ أضف google-services.json
5. ✅ أضف مفتاح Gemini
6. ✅ EAS Secrets لكل المفاتيح
