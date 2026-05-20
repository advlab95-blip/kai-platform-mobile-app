# 🐛 BUGS_FOUND.md — تقرير المرحلة 1: فحص جودة الكود
## تاريخ الفحص: 2026-04-15
## الملفات المفحوصة: 73 ملف + services + stores + hooks

---

## 📊 الإحصائيات العامة

| الخطورة | العدد | الوصف |
|---------|-------|-------|
| 🔴 CRITICAL | 12 | كراشات، تسريب مفاتيح، تسريب بيانات بين مؤسسات |
| 🟠 HIGH | 62+ | setLoading خارج finally، async بدون try/catch |
| 🟡 MEDIUM | 50+ | useEffect dependencies، empty catch، race conditions |
| 🟢 LOW | 25+ | أنواع any، setTimeout بدون cleanup |

---

## 🔴 CRITICAL — يجب إصلاحها فوراً

### C1: API Keys مكشوفة بالـ Client Bundle
- **services/cloudflare.ts:6** — `EXPO_PUBLIC_CLOUDFLARE_API_TOKEN` مكشوف بالتطبيق
- **services/bunny.ts:10-11** — `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` مكشوف
- **services/bunny.ts:78** — `EXPO_PUBLIC_BUNNY_STORAGE_PASSWORD` مكشوف
- **services/supabase.ts:44-45** — `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` مكشوف
- **student/ai-chat.tsx:94** — Gemini API key بالـ URL
- **student/ai-tools.tsx:79** — Gemini API key بالـ URL
- **student/content.tsx:808** — Gemini API key بالـ URL
- **التأثير**: أي شخص يحمّل التطبيق يقدر يستخرج المفاتيح ويستخدمها
- **الحل**: نقل الاستدعاءات لـ Edge Functions

### C2: Missing Platform Import — كراش فوري
- **teacher/voice.tsx:533** — `Platform` مستخدم بالـ StyleSheet لكن غير مستورد
- **التأثير**: التطبيق يكرش فوراً عند فتح صفحة الرسائل الصوتية
- **الحل**: إضافة `Platform` للـ import

### C3: Missing Alert Import — كراش عند الضغط
- **parent/academic.tsx:74** — `Alert.alert()` مستدعى لكن `Alert` غير مستورد
- **التأثير**: كراش عند محاولة تحميل شهادة PDF
- **الحل**: إضافة `Alert` للـ import

### C4: N+1 Queries — بطء شديد
- **admin/branches.tsx:40-42** — for loop تسلسلي لـ getBranchStats
- **admin/reports.tsx:83-101** — for loop تسلسلي بـ handleExportFullAnalytics
- **admin/users.tsx:392-394** — for loop تسلسلي لـ transferUser (100+ طلب!)
- **institute/schedule.tsx:163-183** — triple nested loop لـ upsertTimetableSlot (150+ طلب!)
- **التأثير**: الصفحات تعلق لدقائق مع بيانات كبيرة
- **الحل**: Promise.all أو bulk API

### C5: Cross-Tenant Notification Leak
- **services/pushNotifications.ts:224-230, 250-259** — `newAnnouncement` و `upcomingExam` لا تمرر `instituteId` لـ `getTokensForTarget`
- **التأثير**: إشعارات مؤسسة A تصل لمستخدمين بمؤسسة B
- **الحل**: تمرير `instituteId` إلزامياً

### C6: Unhandled Async — كراشات محتملة
- **institute/certificates.tsx:193** — `handlePreviewPDF` بدون try/catch
- **institute/certificates.tsx:217** — `handleExportPDF` بدون try/catch
- **institute/certificates.tsx:298** — revoke certificate بدون try/catch
- **التأثير**: أي خطأ يكرش التطبيق

### C7: Feature Flags Fail-Open
- **stores/featureFlagsStore.ts:263-269** — `isEnabled` ترجع `true` لو ما تحمّلت الـ flags
- **التأثير**: لو فشل تحميل الـ flags، كل الميزات تنفتح حتى المعطّلة
- **الحل**: ترجع `false` بدل `true` كـ default

### C8: Memory Leak — Interval بدون Cleanup
- **institute/index.tsx:249-251** — `recordingTimer` interval ما ينمسح عند unmount
- **التأثير**: state updates على component ممسوح = crash أو memory leak

---

## 🟠 HIGH — setLoading/setState خارج finally (منهجي)

### النمط المتكرر بكل الملفات:
```
} catch (err) { console.error(err); }
setLoading(false); // ❌ خارج finally
```

### القائمة الكاملة:

#### Admin (15 موقع):
| # | الملف | الـ state | السطر |
|---|-------|----------|-------|
| H1 | ai-features.tsx | setLoading | 53 |
| H2 | ai-features.tsx | setSaving | 98 |
| H3 | archive.tsx | setLoading | 39 |
| H4 | archive.tsx | setExporting | 107 |
| H5 | branches.tsx | setLoading | 44 |
| H6 | branches.tsx | setCreating | 64 |
| H7 | chat.tsx | setLoading | 43 |
| H8 | chat.tsx | setSending | 118 |
| H9 | chat.tsx | setLoadingMsgs | 92, 103 |
| H10 | devices.tsx | setLoading | 53 |
| H11 | devices.tsx | setAdding | 80 |
| H12 | index.tsx | setSending | 81 |
| H13 | leave-requests.tsx | setLoading | 36 |
| H14 | settings.tsx | setLoading | 85 (NO try/catch!) |
| H15 | settings.tsx | setSendingReply | 107 |
| H16 | users.tsx | setLoading | 178 |
| H17 | users.tsx | setCreatingUser | 342 |
| H18 | users.tsx | setDeletingInst | 412 |
| H19 | fees.tsx | setCreating | 68 |
| H20 | finance.tsx | setSaving | 109 |
| H21 | finance.tsx | setSavingSubject | 142 |

#### Teacher (11 موقع):
| # | الملف | الـ state | ملاحظة |
|---|-------|----------|--------|
| H22 | ai-lessons.tsx | setLoading, setGenerating | 3 مواقع |
| H23 | ai-tools.tsx | setGenerating, setSaving | 4 مواقع |
| H24 | assignments.tsx | setLoading, setUploading | 3 مواقع |
| H25 | chat.tsx | setLoading, setSending | 3 مواقع |
| H26 | content.tsx | setLoading, setUploading | 3 مواقع |
| H27 | grades.tsx | setLoading, setSaving | 4 مواقع |
| H28 | index.tsx | setLoading, setSending | 3 مواقع |
| H29 | live.tsx | setLoading | 1 موقع |
| H30 | schedule.tsx | setLoading | 1 موقع |
| H31 | voice.tsx | setLoading | 1 موقع |

#### Student (12 موقع):
| # | الملف | الـ state |
|---|-------|----------|
| H32 | ai-chat.tsx | setLoading, setSending |
| H33 | ai-tools.tsx | setGenerating |
| H34 | assignments.tsx | setLoading |
| H35 | certificates.tsx | setLoading |
| H36 | content.tsx | setLoading, setChatSending |
| H37 | exams.tsx | setLoading, setSubmitting (x2) |
| H38 | index.tsx | setTaskSubmitting, setScanLoading |
| H39 | stats.tsx | setJustifySending, setExamSubmitting |

#### Parent (5 مواقع):
| # | الملف | الـ state |
|---|-------|----------|
| H40 | academic.tsx | setIsLoading, setRefreshing |
| H41 | attendance.tsx | setSending |
| H42 | chat.tsx | setLoadingMsgs, setSending, setStartingChat |
| H43 | finance.tsx | setRefreshing (no try/catch) |
| H44 | schedule.tsx | (console.error only, no user feedback) |

#### Institute (18 موقع):
| # | الملف | الـ state |
|---|-------|----------|
| H45 | archive.tsx | setLoading |
| H46 | certificates.tsx | setLoading, setIssuing, setUploadingStamp, setUploadingSig |
| H47 | index.tsx | setLoadingAttendance, setLoadingVoice, setSending, setSendingVoice, setLoadingPromotion, setPromoting |
| H48 | promotion.tsx | setLoading, setLoadingStudents, setProcessing, setCreatingYear |
| H49 | reports.tsx | setLoading, setExporting (x2) |
| H50 | schedule.tsx | setLoading, setSaving, setGenerating, setPublishing |
| H51 | settings.tsx | setLoading + 7 loading states أخرى |

#### Cafeteria + Medical (6 مواقع):
| H52-H57 | orders, menu, records, reports, index | متعددة |

#### Stores (7 مواقع):
| H58 | authStore.ts | isLoading |
| H59 | medicalStore.ts | isLoading |
| H60 | connectivityStore.ts | isSyncing |
| H61 | notificationStore.ts | isLoading |
| H62 | dataStore.ts | isFetching |
| H63 | featureFlagsStore.ts | isLoading |
| H64 | parentStore.ts, studentStore.ts, teacherStore.ts | isLoading |

---

## 🟠 HIGH — State Mutation
- **student/ai.tsx:83-84** — `.push()` على array من الـ state (يخرّب React state)

## 🟠 HIGH — Audio Memory Leak
- **student/content.tsx:172, 244-287** — `soundRef` ما ينمسح عند unmount

## 🟠 HIGH — Stale Closure بالـ Timer
- **student/exams.tsx:50-58** — `timeLeft` بالـ deps يعيد إنشاء interval كل ثانية
- **student/stats.tsx:209-232** — `handleSubmitExam` stale closure بالـ timer

---

## 🟡 MEDIUM — Empty Catch Blocks (25+ موقع)
أماكن `catch {}` أو `catch { }` بدون أي معالجة عبر كل التطبيق.

## 🟡 MEDIUM — useEffect Missing Dependencies (30+ موقع)
دوال مستدعاة داخل useEffect لكن غير موجودة بالـ dependency array.

## 🟡 MEDIUM — Race Conditions (5+ مواقع)
- admin/chat.tsx — فتح محادثتين بسرعة
- cafeteria/settings.tsx — كتابة سريعة تسبب concurrent writes
- stores/adminStore.ts — toggleSetting optimistic update
- stores/cafeteriaStore.ts — toggleAvailability

## 🟡 MEDIUM — Weak Security
- **services/offlineStorage.ts:16-28** — "encryption" هي base64 فقط، مو تشفير حقيقي

---

## 🟢 LOW
- `any` types مستخدمة بكثرة بكل الـ stores والصفحات
- setTimeout بدون cleanup (10+ مواقع)
- sounds.ts — دوال فارغة (click, success, error, send)

---

## 📋 ملخص الأولويات للإصلاح

### الأولوية 1 — CRITICAL (يجب أول):
1. C2: Missing Platform import (voice.tsx) — **كراش فوري**
2. C3: Missing Alert import (academic.tsx) — **كراش عند الضغط**
3. C5: Cross-tenant notification leak — **تسريب بيانات**
4. C7: Feature flags fail-open — **أمان**
5. C8: Memory leak interval — **كراش**
6. C6: Unhandled async crashes — **كراش**
7. C4: N+1 queries — **بطء شديد**
8. C1: API keys مكشوفة — **أمان** (يحتاج Edge Functions)

### الأولوية 2 — HIGH (بعد الـ Critical):
1. كل الـ setLoading خارج finally (62+ موقع)
2. State mutation (ai.tsx)
3. Audio memory leak (content.tsx)
4. Stale closure بالـ timer (exams.tsx, stats.tsx)

### الأولوية 3 — MEDIUM:
1. Empty catch blocks
2. useEffect dependencies
3. Race conditions
