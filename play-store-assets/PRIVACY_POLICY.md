# سياسة الخصوصية — منصة كاي

**تاريخ السريان:** 2026-05-18
**التطبيق:** منصة كاي (Kai Platform)
**المُطوّر:** AgentLab

---

## ١. مقدمة

نحن في منصة كاي نلتزم بحماية خصوصية المستخدمين. هذي السياسة توضّح أي بيانات نجمعها، كيف نستخدمها، ومع من نشاركها.

## ٢. البيانات اللي نجمعها

### بيانات تنشئها المؤسسة عنك
- اسمك الكامل
- دورك بالمؤسسة (طالب / أستاذ / ولي أمر / إداري / كافتيريا / طبابة)
- رقم هاتفك (اختياري)
- صورتك الشخصية (اختياري — تختار ترفعها بنفسك)

### بيانات أكاديمية
- درجاتك ونتائج الامتحانات
- سجل الحضور والغياب
- الواجبات والمواد التعليمية اللي تتفاعل معاها
- ملاحظات السلوك (للطلاب)
- السجل الطبي بالعيادة (للطلاب فقط، يُدار من قبل طبابة المؤسسة)

### بيانات تقنية
- توكنات دفع الإشعارات (Push Notification Tokens)
- معرّفات الجهاز (للأمان فقط، مو tracking)
- سجلات تسجيل الدخول الفاشلة (لحماية ضد brute-force)

## ٣. كيف نستخدم البيانات

- **خدمة المنصة**: عرض درجاتك، حضورك، واجباتك، إلخ
- **التواصل**: إشعارات بقرارات المؤسسة، اجتماعات أولياء الأمور، طلبات الإجازة
- **الأمان**: حماية الحساب من اختراق + كشف محاولات تسجيل دخول مشبوهة
- **التحسين الفني**: تشخيص الأخطاء بدون كشف هويتك

## ٤. مع من نشارك بياناتك

- **مؤسستك التعليمية**: الإدارة والمعلمون يشوفون بياناتك الأكاديمية حسب دورهم
- **ولي أمرك**: يشوف بياناتك إذا كنت طالباً
- **Supabase** (مزود قاعدة البيانات): تخزين آمن
- **Bunny CDN** (مزود الملفات): تخزين الفيديوهات والمستندات
- **Expo Push Service**: توصيل الإشعارات

**ميتم بيع البيانات لأي طرف ثالث.**

## ٥. حقوقك

- الحصول على نسخة من بياناتك
- تصحيح بياناتك
- حذف حسابك (تواصل مع إدارة مؤسستك)
- سحب الموافقة على معالجة البيانات

## ٦. عزل البيانات بين المؤسسات

كل مؤسسة لها فضاء بيانات معزول تماماً (Multi-Tenant Isolation). موظفو مؤسسة "أ" ميقدرون يصلون لأي بيانات تخص مؤسسة "ب".

## ٧. أمن البيانات

- اتصال HTTPS مشفّر بالكامل
- كلمات المرور مخزّنة بـbcrypt
- Row-Level Security (RLS) على كل جدول بقاعدة البيانات
- مفاتيح API محمية بالـEdge Functions ومو مكشوفة بالتطبيق

## ٨. الأطفال

التطبيق مصمم للاستخدام التعليمي. لو عمرك أقل من ١٣ سنة، يجب أن يكون استخدامك تحت إشراف ولي أمرك أو مؤسستك التعليمية.

## ٩. تغييرات على هذي السياسة

ممكن نحدّث السياسة. أي تغيير راح نخبرك بيه عبر التطبيق أو الإيميل.

## ١٠. التواصل

للاستفسار أو الإبلاغ عن مشكلة خصوصية:

📧 **agentlab9@gmail.com**

---

# Privacy Policy — Kai Platform

**Effective Date:** 2026-05-18
**App:** Kai Platform
**Developer:** AgentLab

## 1. Introduction
Kai Platform is committed to protecting user privacy. This policy explains what data we collect, how we use it, and with whom we share it.

## 2. Data We Collect
- **Profile**: Full name, role (student/teacher/parent/admin/cafeteria/medical), optional phone, optional avatar.
- **Academic**: Grades, attendance, assignments, behavior notes, medical clinic records (students only).
- **Technical**: Push notification tokens, device identifiers (security only), failed-login logs.

## 3. How We Use Data
- Service delivery (showing your grades, attendance, etc.)
- Communications (notifications, parent meetings, leave requests)
- Security (anti-brute-force, anomaly detection)
- Technical improvements (anonymized error diagnostics)

## 4. Data Sharing
- **Your institution** (admins/teachers per role)
- **Your parent** (if you are a student)
- **Supabase** (database hosting)
- **Bunny CDN** (media file storage)
- **Expo Push** (notification delivery)

**We do not sell data to any third party.**

## 5. Your Rights
- Access a copy of your data
- Correct your data
- Delete your account (via your institution admin)
- Withdraw consent

## 6. Multi-Tenant Isolation
Each institution has fully isolated data space. Staff of institution A cannot access data of institution B.

## 7. Security
- HTTPS encryption end-to-end
- Passwords stored with bcrypt
- Row-Level Security (RLS) on every table
- API keys protected server-side via Edge Functions

## 8. Children
Designed for educational use. Users under 13 should use under guardian or institutional supervision.

## 9. Changes
We may update this policy. Changes will be communicated via the app or email.

## 10. Contact
📧 **agentlab9@gmail.com**
