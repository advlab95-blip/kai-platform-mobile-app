# Data Safety Form — Google Play Console

دليل لملء نموذج "Data safety" في Play Console.
**المسار**: Play Console → App → Policy → App content → Data safety

---

## 🔒 السؤال 1: هل التطبيق يجمع بيانات؟

**الإجابة:** ✅ نعم (Yes)

---

## 📥 السؤال 2: هل البيانات مُشفّرة أثناء النقل؟

**الإجابة:** ✅ نعم — كل البيانات عبر HTTPS/TLS 1.2+

---

## 🗑️ السؤال 3: يقدر المستخدم يطلب حذف بياناته؟

**الإجابة:** ✅ نعم — عبر إيميل `privacy@kaiplatform.app`

---

## 📋 البيانات اللي يجمعها التطبيق

اضغط "Add data type" لكل بند:

### 1. المعلومات الشخصية (Personal info)

#### ▪️ Name (الاسم)
- **Collected**: ✅ Yes
- **Shared**: ❌ No
- **Required or optional**: Required
- **Purpose**: App functionality, Account management
- **Why**: عرض اسم المستخدم في التطبيق، التواصل بين الأطراف

#### ▪️ Phone number (رقم الهاتف)
- **Collected**: ✅ Yes (للأهالي والأساتذة فقط)
- **Shared**: ❌ No
- **Required or optional**: Required (لبعض الأدوار)
- **Purpose**: Account management
- **Why**: للتحقق من الهوية وربط ولي الأمر بالطالب

#### ▪️ Other info (رمز الدخول — Login Code)
- **Collected**: ✅ Yes
- **Shared**: ❌ No
- **Required or optional**: Required
- **Purpose**: Account management, App functionality
- **Why**: تسجيل الدخول

---

### 2. الموقع (Location)

#### ▪️ Approximate location
- **Collected**: ✅ Yes (فقط عند تسجيل الحضور بـ QR)
- **Shared**: ❌ No
- **Required or optional**: Optional
- **Purpose**: App functionality
- **Why**: للتحقق من تواجد الطالب في المؤسسة وقت الحضور
- **Note**: لا يتم تخزينها — تُستخدم لحظياً فقط

---

### 3. المحتوى الذي ينشئه المستخدم (App activity / User-generated content)

#### ▪️ Photos
- **Collected**: ✅ Yes (صور البروفايل، صور الألبومات التعليمية)
- **Shared**: ❌ No
- **Required or optional**: Optional
- **Purpose**: App functionality
- **Stored**: في Bunny CDN (EU)

#### ▪️ Videos
- **Collected**: ✅ Yes (فيديوهات الدروس)
- **Shared**: ❌ No
- **Required or optional**: Optional
- **Purpose**: App functionality
- **Stored**: في Bunny CDN (EU)

#### ▪️ Audio recordings
- **Collected**: ✅ Yes (الرسائل الصوتية في الدردشة)
- **Shared**: ❌ No
- **Required or optional**: Optional
- **Purpose**: App functionality

#### ▪️ Files and documents
- **Collected**: ✅ Yes (ملازم PDF)
- **Shared**: ❌ No
- **Required or optional**: Optional
- **Purpose**: App functionality

#### ▪️ Messages (الرسائل)
- **Collected**: ✅ Yes (دردشات الصف، أستاذ-طالب، ولي أمر-أستاذ)
- **Shared**: ✅ Yes (مع Google Gemini و OpenRouter — فقط نص رسائل المساعد الذكي عند طلبه)
- **Required or optional**: Optional
- **Purpose**: App functionality, Personalization
- **Note**: تُحذف الدردشات تلقائياً بعد 3 أشهر

---

### 4. الصحة واللياقة (Health and fitness)

#### ▪️ Health info (السجل الطبي)
- **Collected**: ✅ Yes (للطلاب فقط — يدخلها الكادر الطبي للمؤسسة)
- **Shared**: ❌ No
- **Required or optional**: Optional (حسب المؤسسة)
- **Purpose**: App functionality
- **Why**: يستخدمها الكادر الطبي للمؤسسة للرعاية الصحية للطالب

---

### 5. المعلومات المالية (Financial info)

#### ▪️ Purchase history (سجل المدفوعات)
- **Collected**: ✅ Yes (الأقساط المدفوعة للمؤسسة)
- **Shared**: ❌ No
- **Required or optional**: Required (للأهالي)
- **Purpose**: App functionality
- **Note**: المنصة لا تعالج المدفوعات — تسجلها فقط

---

### 6. التطبيق والأجهزة (App activity)

#### ▪️ App interactions
- **Collected**: ✅ Yes
- **Shared**: ❌ No
- **Required or optional**: Required
- **Purpose**: App functionality
- **Why**: لتشغيل التطبيق (الواجبات، الدرجات، الحضور)

#### ▪️ In-app search history
- **Collected**: ❌ No

---

### 7. معرّفات الجهاز أو الحساب (App info and performance)

#### ▪️ Crash logs
- **Collected**: ❌ No (لا نجمع crash reports حالياً)

#### ▪️ Diagnostics
- **Collected**: ❌ No

#### ▪️ Other app performance data
- **Collected**: ❌ No

---

### 8. معرّفات الجهاز (Device or other IDs)

#### ▪️ Device or other IDs
- **Collected**: ✅ Yes (FCM push notification token)
- **Shared**: ✅ Yes (مع Google Firebase لإرسال الإشعارات)
- **Required or optional**: Optional
- **Purpose**: App functionality (push notifications)

---

## 🚫 بيانات **لا** تُجمع (للوضوح)

- ❌ Browsing history خارج التطبيق
- ❌ Web history
- ❌ Calendar events
- ❌ Contacts (جهات الاتصال على الجهاز)
- ❌ Email addresses
- ❌ Sexual orientation
- ❌ Race or ethnicity
- ❌ Political or religious beliefs
- ❌ Trade union membership
- ❌ Other personal characteristics

---

## 🔐 ملخص الأمان

- ✅ **Data is encrypted in transit**: Yes (HTTPS/TLS 1.2+)
- ✅ **You can request data deletion**: Yes (via privacy@kaiplatform.app)
- ✅ **Independent security review**: No (للنسخة الحالية)
- ✅ **Follows Families Policy**: Yes (للأطفال تحت 13 — البيانات تُجمع فقط عبر المؤسسة)

---

## 📤 الإقرار النهائي

عند إكمال النموذج، Play Console يطلب التأكيد:

- ✅ "I have reviewed the information I shared and confirm it is accurate"
- ✅ "I understand Google may verify this information"

اضغط **Save**.

النموذج يدخل قيد المراجعة من Google. عادة 24-48 ساعة.
