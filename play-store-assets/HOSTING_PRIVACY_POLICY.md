# كيف تنشر سياسة الخصوصية مجاناً (٣ خيارات)

Play Console **يطلب URL فعلي** لسياسة الخصوصية. ميقبل ملف PDF أو link محلي.

## ✅ الخيار ١ — GitHub Pages (الأسرع، مجاني تماماً)

١. روح لـrepo التطبيق:
   https://github.com/agentlab9-png/kai-platform-mobile-app

٢. اضغط **Settings** → **Pages**

٣. تحت **Source** اختر `master` branch + folder `/ (root)`

٤. اضغط **Save**

٥. أنشئ ملف بالـrepo اسمه `privacy.html` بهذا المحتوى:

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>سياسة الخصوصية — منصة كاي</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 1rem; line-height: 1.7; color: #333; }
  h1 { color: #1D4ED8; }
  h2 { color: #4F46E5; margin-top: 2rem; }
  hr { margin: 3rem 0; border: 0; border-top: 1px solid #ddd; }
</style>
</head>
<body>
<!-- انسخ محتوى play-store-assets/PRIVACY_POLICY.md هنا (ملف md نفسه أو حوله لـHTML) -->
</body>
</html>
```

٦. بعد ٢ دقيقة الرابط راح يصير:
   `https://agentlab9-png.github.io/kai-platform-mobile-app/privacy.html`

---

## ✅ الخيار ٢ — Notion (٥ دقايق، أسهل)

١. روح https://www.notion.so/
٢. أنشئ صفحة جديدة عامة (Public)
٣. الصق محتوى `PRIVACY_POLICY.md`
٤. اضغط **Share** → **Publish to web**
٥. انسخ الرابط — هذا يصير privacy policy URL

---

## ✅ الخيار ٣ — Google Sites (٥ دقايق)

١. روح https://sites.google.com/
٢. أنشئ موقع جديد
٣. الصق المحتوى
٤. اضغط **Publish** — انسخ الرابط

---

## ⚠️ ملاحظات

- Play Console يفحص الرابط يدوياً — لازم يفتح بدون تسجيل دخول
- يجب أن يحتوي على نص "Privacy Policy" أو "سياسة الخصوصية"
- اسم التطبيق يجب يطابق ما بـPlay Console
- لا تستخدم PDF — لازم HTML صفحة ويب
