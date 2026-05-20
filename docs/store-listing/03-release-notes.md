# Release Notes — v1.0.0 (build 3)

## ملاحظات الإصدار (للستور — حد أقصى 500 حرف)

```
🎉 الإصدار الأول من منصة كاي

• تطبيق تعليمي متعدد الأدوار للمعاهد والمدارس
• إدارة شاملة للحضور والواجبات والدرجات
• محادثات صفية آمنة بين الأستاذ والطلاب
• إشعارات فورية لأولياء الأمور
• مساعد تعليمي بالذكاء الاصطناعي
• خدمات الكافتيريا والسجلات الطبية
```

(~290 حرف ✓)

---

## ملاحظات داخلية (للتوثيق — مو للستور)

### تغييرات نسبة لـ build 2:
- إصلاح race condition في تسجيل الخروج (router race مع AuthGuard)
- تصلب CORS لكل Edge Functions (allowlist بدل wildcard)
- حذف `services/cloudflare.ts` (orphan code) + إزالة الـ token من العميل
- service_role key مغلّف بـ `__DEV__` guard (Hermes يحذفه من production bundle)
- 7 Edge Functions جديدة بـ hardened CORS
- 8 scale indexes جديدة على القاعدة
