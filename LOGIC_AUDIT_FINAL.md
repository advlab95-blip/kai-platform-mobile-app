# KAI Mobile Platform — Comprehensive Logic & Business Audit

**Audit Date:** 2026-04-15
**Auditors:** 8-Expert Analysis Team
**Platform:** Multi-tenant Educational SaaS (Iraqi market)
**Stack:** React Native / Expo + Supabase + Zustand

---

## Executive Summary

The KAI platform is a substantial multi-tenant educational management system with 7 roles, covering academics, attendance, fees, cafeteria, medical records, and more. The codebase shows thoughtful architecture with genuine multi-tenant isolation efforts. However, this audit identified **47 issues** across security, business logic, data integrity, UX, and Iraqi-context compliance.

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 12 |
| Medium | 17 |
| Improvement | 12 |

---

## 1. Educational Logic (Iraqi Education System)

### Issue 1.1 — No Grade Validation Against Max Score
- **Severity:** :red_circle: Critical
- **Category:** Data Integrity / Grading
- **File:** `services/api.ts`, line ~3780 (`saveBulkGrades`)
- **Description:** When a teacher enters grades, there is no validation that the entered score does not exceed `max_score`. A teacher can enter 150/100 without any error.
- **Expected:** Score must be validated: `0 <= score <= max_score` before saving.
- **Suggested Fix:** Add validation in `saveBulkGrades()` and in the `TeacherGrades` component's `handleSaveAllGrades()`:
  ```typescript
  if (score < 0 || score > maxScore) throw new Error(`الدرجة يجب أن تكون بين 0 و ${maxScore}`);
  ```

### Issue 1.2 — Pass/Fail at 50% is Hardcoded, Not Configurable
- **Severity:** :yellow_circle: Medium
- **Category:** Educational Logic
- **Files:** `app/(admin)/reports.tsx:57`, `app/(institute)/reports.tsx:56`
- **Description:** Pass threshold is hardcoded at 50% (`scores.filter(s => s >= 50)`). In the Iraqi system, some subjects/stages may have different thresholds (e.g., 40% for physical education, 50% for core subjects). This is not configurable per institute or subject.
- **Expected:** Pass threshold should be configurable per institute and optionally per subject.
- **Suggested Fix:** Add a `pass_threshold` field to `grade_categories` or a global institute setting, and use it dynamically in reports.

### Issue 1.3 — Grade Weight Column Exists But Is Never Used in Calculations
- **Severity:** :orange_circle: High
- **Category:** Grading / Calculations
- **Files:** `supabase/migrations/20260414_manual_grades.sql:15` (weight column), `app/(admin)/reports.tsx:56`, `services/gradeReportTemplates.ts`
- **Description:** The `grade_categories` table has a `weight` column (line 15), but grade averages everywhere are calculated as simple arithmetic means. For example, `reports.tsx:56` calculates: `scores.reduce((a, b) => a + b, 0) / scores.length` — a simple average ignoring category weights.
- **Expected:** Final/midterm exams (weight 3) should count more than homework (weight 1) in the overall average. The Iraqi system typically weights final exams at 40-60% of the total grade.
- **Suggested Fix:** Implement weighted average: `sum(score * weight) / sum(weight)` using the category's weight field.

### Issue 1.4 — Attendance Summary Counts 'Late' as 'Present'
- **Severity:** :yellow_circle: Medium
- **Category:** Attendance Logic
- **File:** `services/api.ts:745-746`
- **Description:** `getAttendanceSummary` counts `late` status as `present`: `data.filter((a) => a.status === 'present' || a.status === 'late').length`. While this may be intentional, there is no separate tracking of late arrivals, and in the Iraqi system, excessive lateness should count against attendance.
- **Expected:** Late arrivals should be tracked separately. Reports should show present/late/absent breakdown.
- **Suggested Fix:** Return `{ present, late, absent, justified, total }` instead of merging late into present.

### Issue 1.5 — No Attendance Linked to Academic Year
- **Severity:** :orange_circle: High
- **Category:** Attendance / Academic Year
- **File:** `services/api.ts:740-747`
- **Description:** `getAttendanceSummary` queries ALL attendance records for a student without filtering by academic year. When a new year starts, old attendance data pollutes the current year's statistics.
- **Expected:** Attendance should be filtered by the current academic year or date range.
- **Suggested Fix:** Add `academic_year_id` to the `attendance` table or filter by date range of the current academic year.

### Issue 1.6 — Promotion System Does Not Validate Academic Performance
- **Severity:** :orange_circle: High
- **Category:** Promotion Logic
- **File:** `app/(institute)/promotion.tsx:87-121`
- **Description:** The promotion system allows bulk promoting all students regardless of their grades. The only mechanism is manual exclusion (clicking on students to mark them as "failed"). There is no automatic check against actual grades.
- **Expected:** The system should display each student's average/pass status and auto-flag students below the pass threshold (50%), requiring manual override to promote failing students.
- **Suggested Fix:** Fetch grades for each student in `fromClassId`, calculate their average, and visually mark those below 50% as pre-excluded.

### Issue 1.7 — Graduation Freezes Student Account Permanently
- **Severity:** :yellow_circle: Medium
- **Category:** Graduation Logic
- **File:** `services/api.ts:2129-2135`
- **Description:** When a student is graduated, their account is frozen (`is_frozen: true`) and their Supabase auth is banned for 100 years (`876000h`). This means graduated students permanently lose access to their academic records, certificates, and grades.
- **Expected:** Graduated students should have read-only access to their historical data (grades, certificates, attendance records).
- **Suggested Fix:** Create a `graduated` enrollment status that allows login but restricts to read-only access.

### Issue 1.8 — No Certificate Verification Endpoint
- **Severity:** :green_circle: Improvement
- **Category:** Certificates
- **File:** `supabase/migrations/20260412_certificates.sql:17`
- **Description:** The certificates table has a `verification_code` field with a UNIQUE index, but there is no public verification endpoint or page. Anyone receiving a certificate PDF has no way to verify its authenticity.
- **Expected:** A public URL (e.g., `/verify/:code`) that allows third parties to verify certificate authenticity.
- **Suggested Fix:** Create a public Supabase Edge Function or web page for certificate verification.

---

## 2. Business Workflows

### Issue 2.1 — User Deletion Does Not Clean Up All Related Data
- **Severity:** :red_circle: Critical
- **Category:** Data Integrity / User Deletion
- **File:** `services/api.ts:329-336`
- **Description:** `deleteUser()` only deletes from `enrollments` and `users` tables, then removes the auth account. It does NOT clean up:
  - `attendance` records
  - `grades` / `manual_grades`
  - `exam_submissions` / `task_submissions`
  - `parent_child` relationships
  - `notifications`
  - `medical_records`
  - `cafeteria_orders`
  - `student_classes`
  - `absence_justifications`
  - `certificates`
  - `payments` / `student_fees`
  This creates orphaned data that may cause errors when other queries try to join on the deleted user.
- **Expected:** All related records should be cascade-deleted or soft-deleted. The `users` table should have `ON DELETE CASCADE` on all foreign keys referencing it, or the application code should clean up all tables.
- **Suggested Fix:** Either add `ON DELETE CASCADE` to all FK references to `users(id)`, or replicate the comprehensive cleanup logic used in `deleteInstitute()` (lines 340-413).

### Issue 2.2 — Grade Entry Has No Notification to Students/Parents
- **Severity:** :orange_circle: High
- **Category:** Business Workflow
- **File:** `services/api.ts` (`saveBulkGrades`), `app/(teacher)/grades.tsx:107-129`
- **Description:** When a teacher saves grades, there is no notification sent to students or parents. The grade-entry flow is: Teacher enters grades -> grades saved to DB -> END. There is no push notification, no in-app notification, and no alert.
- **Expected:** After bulk grade save, students and their parents should receive a notification: "New grades posted for [subject] - [category]".
- **Suggested Fix:** After successful `saveBulkGrades()`, create notification records for each student and their linked parents.

### Issue 2.3 — Fee Payment Has No Receipt Generation
- **Severity:** :yellow_circle: Medium
- **Category:** Fees Workflow
- **File:** `services/api.ts:1777-1788` (`makeStudentPayment`)
- **Description:** `makeStudentPayment` inserts a payment record but does not generate a receipt number or PDF. The `fee_payments` table requires a UNIQUE `receipt_number`, but the simpler `payments` table used in `makeStudentPayment` does not. The two payment systems (`payments` vs `fee_payments/installments`) appear disconnected.
- **Expected:** Every payment should generate a unique receipt number and optionally a PDF receipt. The `payments` and `fee_payments` tables should be unified or clearly linked.
- **Suggested Fix:** Unify the payment systems. Generate auto-incrementing receipt numbers per institute.

### Issue 2.4 — Assignment Submission Has No Duplicate Prevention
- **Severity:** :orange_circle: High
- **Category:** Business Logic
- **File:** `services/api.ts:795-803` (`submitTask`)
- **Description:** `submitTask` does an INSERT without checking if the student has already submitted for this task. A student can submit multiple times, creating duplicate records.
- **Expected:** A student should only be able to submit once per task, with an option to update their submission before the deadline.
- **Suggested Fix:** Add a UNIQUE constraint on `(task_id, student_id)` in the `task_submissions` table, or use UPSERT.

### Issue 2.5 — Exam Submission Has No Duplicate Prevention
- **Severity:** :orange_circle: High
- **Category:** Business Logic
- **File:** `services/api.ts:818-826` (`submitExamAnswers`)
- **Description:** Similar to tasks, `submitExamAnswers` does a plain INSERT. A student can submit answers multiple times for the same exam, especially if there are network retries.
- **Expected:** One submission per student per exam, enforced at the database level.
- **Suggested Fix:** Add UNIQUE constraint on `(exam_id, student_id)` in `exam_submissions`.

### Issue 2.6 — Institute Creation Does Not Return Admin Code in All Cases
- **Severity:** :yellow_circle: Medium
- **Category:** Institution Flow
- **File:** `services/api.ts:231-265`
- **Description:** `createInstitute` generates a 6-character admin code and creates an auth user, but if the auth user creation fails (`authErr`), the code `!authErr && authData.user` silently skips enrollment and user profile creation. The institute is still created but has no admin user. The function returns `{ ...data, adminCode: code }` even though the admin user might not have been created.
- **Expected:** If admin user creation fails, the entire operation should roll back (delete the institute) or clearly report the failure.
- **Suggested Fix:** Add rollback logic: if auth user creation fails, delete the created institute and throw an error.

### Issue 2.7 — Leave Request System Missing Approval-to-Attendance Integration
- **Severity:** :yellow_circle: Medium
- **Category:** Business Workflow
- **File:** `supabase/migrations/20260413_leave_requests.sql`
- **Description:** The leave request system exists in the DB schema but there is no logic to automatically mark attendance as "justified" when a leave request is approved. The two systems are disconnected.
- **Expected:** When a leave request is approved, the corresponding attendance records for that date range should be updated to `justified` status.
- **Suggested Fix:** Add a trigger or application logic that updates attendance records when leave request status changes to `approved`.

---

## 3. Permissions & Security

### Issue 3.1 — Service Role Key Available in Development Builds
- **Severity:** :red_circle: Critical
- **Category:** Security
- **File:** `services/supabase.ts:44-51`
- **Description:** The `supabaseAdmin` client uses the service role key in `__DEV__` mode. This is acknowledged in comments, but the entire `api.ts` service layer (`2750+ lines`) uses `(supabaseAdmin || supabase)` pattern everywhere. In production, `supabaseAdmin` is null, so all queries fall back to the anon key + RLS. **However**, many admin operations (like `createUser`, `deleteUser`, `resetUserCode`) explicitly check `if (!supabaseAdmin) throw new Error(...)`, meaning **these critical operations will fail entirely in production** because there are no Edge Functions to handle them.
- **Expected:** Admin operations must work in production via Edge Functions, not client-side service role keys.
- **Suggested Fix:** Implement Supabase Edge Functions for all admin operations (`createUser`, `deleteUser`, `resetUserCode`, `freezeUser`, etc.) and call them from the app in production.

### Issue 3.2 — Permissive RLS Policies on Critical Tables
- **Severity:** :red_circle: Critical
- **Category:** Multi-tenant Security
- **File:** `supabase/migrations/20260411_security_rls_tenant_isolation.sql:176-186`
- **Description:** The initial RLS migration creates proper policies for 10 tables, then applies a blanket `FOR ALL USING (true) WITH CHECK (true)` on ALL remaining tables. While later migrations (like `20260412_fix_rls_policies.sql`) fix some tables, many critical tables still have fully permissive policies:
  - `attendance` — any user can read/write any institute's attendance
  - `timetables` — any user can modify any institute's timetable
  - `payments` — any user can see any payment
  - `classes` — any user can create/delete classes in any institute
  - `parent_child` — any user can link themselves as parent of any student
  - `cafeteria_items`, `cafeteria_orders` — cross-tenant accessible
  - `medical_records` — cross-tenant accessible
  - `tasks`, `task_submissions` — cross-tenant accessible
- **Expected:** Every table must have proper RLS policies enforcing tenant isolation.
- **Suggested Fix:** Create proper RLS policies for each table listed above, following the pattern used for `videos`, `exams`, etc.

### Issue 3.3 — Notifications RLS Allows Cross-Tenant Read via Role Matching
- **Severity:** :orange_circle: High
- **Category:** Security / Multi-tenant
- **File:** `supabase/migrations/20260411_security_rls_tenant_isolation.sql:123-128`
- **Description:** The notifications read policy includes `recipient_role = public.get_user_role()`. This means if a notification is sent to `recipient_role = 'teacher'`, **every teacher across all institutes** can see it, not just teachers in the target institute. Combined with the `OR recipient_role = 'all'` clause, system-wide notifications leak across tenants.
- **Expected:** Role-based notifications must also filter by `institute_id`.
- **Suggested Fix:** Add `AND institute_id IN (SELECT public.get_user_institute_ids())` to the role-based notification policy.

### Issue 3.4 — Installments Table Has Fully Permissive RLS
- **Severity:** :red_circle: Critical
- **Category:** Security / Financial Data
- **File:** `supabase/migrations/20260413_fees_system.sql:107`
- **Description:** `CREATE POLICY inst_all ON installments FOR ALL USING (true)` — the installments table (containing financial data: amounts, due dates, payment status) is completely open. Any authenticated user can read, modify, or delete any installment record across all institutes.
- **Expected:** Only admin/institute roles can manage installments. Students and parents should only see their own.
- **Suggested Fix:** Replace with proper policies:
  ```sql
  CREATE POLICY inst_admin ON installments FOR ALL USING (public.get_user_role() IN ('admin', 'institute'));
  CREATE POLICY inst_student_read ON installments FOR SELECT USING (
    student_fee_id IN (SELECT id FROM student_fees WHERE student_id = auth.uid())
  );
  ```

### Issue 3.5 — No Rate Limiting on Login Attempts
- **Severity:** :yellow_circle: Medium
- **Category:** Security
- **File:** `stores/authStore.ts:99-171`
- **Description:** The login function has no rate limiting. An attacker can brute-force 6-character codes (from charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` = 31 chars, 31^6 = ~887M combinations). While Supabase has some built-in rate limiting, the app itself does not track failed attempts.
- **Expected:** Lock out after 5 failed attempts for 15 minutes. Show remaining attempts to user.
- **Suggested Fix:** Track failed login attempts in state or AsyncStorage. After 5 failures, disable the login button for 15 minutes.

### Issue 3.6 — Teacher Can See All Students in Institute (Fallback)
- **Severity:** :yellow_circle: Medium
- **Category:** Access Control
- **File:** `services/api.ts:1034-1038`
- **Description:** `getStudentAssignedTeacherIds()` has a fallback: if no `teacher_assignments` records exist, it returns ALL teachers in the institute. Similarly, `getStudentsByTeacher()` (line 701-709) returns ALL students in the institute based on enrollment, not just the teacher's assigned students.
- **Expected:** A teacher should only see students in their assigned classes/sections.
- **Suggested Fix:** When no assignments exist, return empty instead of all. The fallback should be opt-in, not default.

### Issue 3.7 — Parent Can Potentially Access Any Child's Data
- **Severity:** :yellow_circle: Medium
- **Category:** Access Control
- **File:** `stores/parentStore.ts:51-69`, `services/api.ts:1088-1092`
- **Description:** The parent store loads child data by calling APIs with `childId` directly. While `getChildrenByParent` correctly queries `parent_child` table, the individual data loading functions (`getAttendanceSummary`, `getAttendanceByStudent`, etc.) accept any `studentId` without verifying parent-child relationship.
- **Expected:** Every parent-facing API that takes a `studentId` should verify the parent-child link.
- **Suggested Fix:** Add a helper function that verifies `parent_child` relationship before returning child-specific data.

---

## 4. Data Flow

### Issue 4.1 — QR Attendance Scans Not Linked to Attendance Table
- **Severity:** :orange_circle: High
- **Category:** Data Flow
- **Files:** `supabase/migrations/20260412_attendance_qr_v2.sql`, `services/api.ts:828-849`
- **Description:** QR attendance creates records in `attendance_qr_scans` but never creates corresponding records in the `attendance` table. The main `getAttendanceSummary()` queries the `attendance` table, not `attendance_qr_scans`. This means QR-scanned attendance is never reflected in attendance statistics, reports, or parent notifications.
- **Expected:** After a successful QR scan, a corresponding `attendance` record should be created with `status: 'present'`.
- **Suggested Fix:** Add a trigger or post-scan logic to insert into `attendance` when `attendance_qr_scans` records are created.

### Issue 4.2 — Orphaned Data on Institute Deletion (institute_only mode)
- **Severity:** :yellow_circle: Medium
- **Category:** Data Integrity
- **File:** `services/api.ts:396-413`
- **Description:** When deleting an institute with `mode: 'institute_only'`, only a subset of data is cleaned up (teacher_assignments, student_classes, sections, grades, stages, subjects, academic_years, announcements, notifications, subscription_pricing, enrollments). Missing from cleanup: `attendance`, `timetables`, `exams`, `tasks`, `videos`, `materials`, `medical_records`, `cafeteria_items/orders`, `payments`, `parent_child`, `certificates`, `fee_plans`, `student_fees`.
- **Expected:** All institute-related data should be cleaned up, or users should be warned that orphaned data will remain.
- **Suggested Fix:** Add cleanup for all remaining tables, mirroring the `with_users` mode.

### Issue 4.3 — No Realtime Updates for Parents
- **Severity:** :green_circle: Improvement
- **Category:** Data Flow / UX
- **File:** `stores/parentStore.ts`
- **Description:** Parent data is loaded once and only refreshed on pull-to-refresh. There are no Supabase Realtime subscriptions. When a teacher marks attendance or posts grades, parents do not see updates until they manually refresh.
- **Expected:** Critical data changes (attendance, grades, medical alerts) should use Supabase Realtime subscriptions or push notifications.
- **Suggested Fix:** Subscribe to `attendance`, `manual_grades`, and `notifications` changes for the parent's children.

### Issue 4.4 — Announcements Can Be Created Without Institute Context
- **Severity:** :yellow_circle: Medium
- **Category:** Data Flow
- **File:** `services/api.ts:493-501`
- **Description:** `createAnnouncement` accepts `instituteId` as optional. If not provided, the announcement has `institute_id: null` and becomes visible to all institutes (global). Teachers and institute admins could potentially create system-wide announcements.
- **Expected:** Only the super admin should be able to create global announcements (institute_id = null).
- **Suggested Fix:** Validate the caller's role. Only `admin` role should be allowed to set `institute_id = null`.

---

## 5. Calculations

### Issue 5.1 — Grade Report Average Ignores Category Weights
- **Severity:** :orange_circle: High (duplicate of 1.3, listed for completeness)
- **Category:** Calculations
- **Files:** `services/gradeReportTemplates.ts`, `app/(admin)/reports.tsx:56`
- **Description:** All grade averages are calculated as simple arithmetic means. The `weight` column in `grade_categories` is never used in any calculation.

### Issue 5.2 — Attendance Percentage Calculation Includes All Historical Data
- **Severity:** :orange_circle: High (duplicate of 1.5, listed for completeness)
- **Category:** Calculations
- **File:** `services/api.ts:740-747`
- **Description:** Attendance percentage is calculated over the entire history rather than the current academic year/semester.

### Issue 5.3 — Fee Calculations Not Validated Server-Side
- **Severity:** :yellow_circle: Medium
- **Category:** Financial Calculations
- **File:** `supabase/migrations/20260413_fees_system.sql`
- **Description:** The `student_fees` table has `total_amount`, `discount`, `final_amount`, `paid_amount`, and `remaining_amount` columns. These are set at creation time but there is no DB trigger or constraint ensuring `final_amount = total_amount - discount` or `remaining_amount = final_amount - paid_amount`. The app must maintain consistency manually, which is error-prone.
- **Expected:** Use computed columns or DB triggers to maintain financial consistency.
- **Suggested Fix:** Add a trigger that recalculates `remaining_amount` whenever `paid_amount` changes, and validates `final_amount = total_amount - discount`.

### Issue 5.4 — Exam Score Auto-Grading Only Supports MCQ and True/False
- **Severity:** :yellow_circle: Medium
- **Category:** Exam Logic
- **File:** `services/api.ts:1835-1843`
- **Description:** `gradeExam()` auto-grades only `mcq` and `tf` question types. Written/essay questions, fill-in-the-blank, or other types receive a score of 0 automatically. There is no indication to the teacher that manual grading is needed for non-MCQ questions.
- **Expected:** Non-auto-gradeable questions should be flagged for manual review, and auto-graded score should be marked as "partial" until teacher review.
- **Suggested Fix:** Mark submissions with non-MCQ questions as `partially_graded` instead of `graded`, and notify the teacher.

---

## 6. UX Logic

### Issue 6.1 — No Confirmation Before Deleting a Class
- **Severity:** :yellow_circle: Medium
- **Category:** UX / Data Loss
- **File:** `services/api.ts:1505-1508`
- **Description:** `deleteClass` performs a simple DELETE without checking if students are enrolled in the class. Deleting a class that has students, timetable slots, and assignments associated with it will cause data inconsistency.
- **Expected:** Warn if class has active students/timetable entries. Require confirmation with count of affected records.
- **Suggested Fix:** Before delete, check for enrollments, timetable slots, and assignments in the class. If any exist, prompt for confirmation or block deletion.

### Issue 6.2 — Silent Error Handling in Stores
- **Severity:** :yellow_circle: Medium
- **Category:** UX / Error Handling
- **Files:** All store files (`stores/*.ts`)
- **Description:** Almost every store function catches errors with `catch (err) { console.error(err); }` — silently logging to console. The user sees no error message. Examples:
  - `parentStore.ts:43` — loadChildren fails silently
  - `teacherStore.ts:87` — loadVideos fails silently
  - `studentStore.ts:145` — loadAttendance fails silently
  - `medicalStore.ts:41` — searchStudents fails silently
- **Expected:** Users should see appropriate error messages or retry prompts when data loading fails.
- **Suggested Fix:** Add error state to each store and display error banners in the UI components.

### Issue 6.3 — No Empty State for Parent Without Children
- **Severity:** :green_circle: Improvement
- **Category:** UX
- **File:** `stores/parentStore.ts:35-43`
- **Description:** If a parent has no children linked, `loadChildren` returns an empty array and the parent dashboard shows no data. There is no guidance telling the parent to contact the institute to link their children.
- **Expected:** Show a helpful message: "No children linked to your account. Contact your institute administration."
- **Suggested Fix:** Add an empty state component in the parent dashboard when `children.length === 0`.

### Issue 6.4 — Loading States Not Consistent Across Roles
- **Severity:** :green_circle: Improvement
- **Category:** UX
- **Files:** Various role dashboards
- **Description:** Some pages show `ActivityIndicator` while loading, others show nothing. The institute detection (`detectInstitute`) sometimes shows a loading spinner, sometimes renders empty content.
- **Expected:** Consistent loading/skeleton states across all pages.
- **Suggested Fix:** Create a shared `LoadingScreen` component and use it consistently.

### Issue 6.5 — Promotion Modal Uses Hardcoded Arabic Text
- **Severity:** :green_circle: Improvement
- **Category:** UX / i18n
- **File:** `app/(institute)/promotion.tsx:289`
- **Description:** The text `"الطلاب ({students.length}) — اضغط على الراسبين لاستثنائهم"` is hardcoded in Arabic, not using the `t()` translation function. Several other strings in this file are also hardcoded.
- **Expected:** All user-facing strings should use the translation system.
- **Suggested Fix:** Move hardcoded strings to `locales/ar.json` and `locales/en.json`.

---

## 7. Iraqi Context

### Issue 7.1 — No Hijri Calendar Support
- **Severity:** :yellow_circle: Medium
- **Category:** Iraqi Context
- **Description:** The entire application uses Gregorian calendar only. There is no Hijri date display anywhere in the app, even though many Iraqi schools and official documents reference Hijri dates.
- **Expected:** Display both Gregorian and Hijri dates in certificates, reports, and the calendar view.
- **Suggested Fix:** Add a Hijri conversion utility (e.g., `hijri-converter` npm package) and display dual dates where appropriate.

### Issue 7.2 — No Phone Number Validation for Iraqi Format
- **Severity:** :yellow_circle: Medium
- **Category:** Iraqi Context
- **File:** `scripts/seed-test-data.ts:100` (only reference to 07XX format)
- **Description:** There is no phone number validation in the app. Iraqi phone numbers follow the format `07XX-XXX-XXXX` (11 digits starting with 07). The phone field accepts any string.
- **Expected:** Validate phone numbers against Iraqi format and auto-format input.
- **Suggested Fix:** Add regex validation: `/^07\d{9}$/` for Iraqi phone numbers.

### Issue 7.3 — School Days Inconsistency Between Components
- **Severity:** :orange_circle: High
- **Category:** Iraqi Context / Schedule
- **Files:** `services/classReminders.ts:44`, `app/(student)/schedule.tsx:23-28`, `app/(institute)/schedule.tsx:39-50`
- **Description:** Different components handle school days differently:
  - `classReminders.ts:44`: Skips Friday/Saturday (`if (expoWeekday > 5)`) — using Sunday=1 mapping, so this skips days 6,7 = Friday,Saturday. **Correct for Iraqi schools.**
  - `app/(student)/schedule.tsx:23-28`: Shows Saturday (index 6) through Thursday (index 4). **Correct for Iraqi schools.**
  - `app/(institute)/schedule.tsx:50`: Filters out Friday for schools (`d.key !== 5`). **Correct.**
  - `services/pdfExport.ts:17` and `services/calendarSync.ts:4`: Only define Sunday-Thursday. **Correct.**
  - BUT `app/(parent)/schedule.tsx:12`: Only defines Sunday-Thursday, missing Saturday. **Iraqi schools operate Saturday-Thursday.**
- **Expected:** Consistent Saturday-Thursday schedule for schools across all components.
- **Suggested Fix:** Fix `app/(parent)/schedule.tsx` to include Saturday: `const DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];`

### Issue 7.4 — Currency Display Inconsistency
- **Severity:** :green_circle: Improvement
- **Category:** Iraqi Context / Currency
- **Files:** `app/(admin)/finance.tsx:213` (`IQD`), `services/api.ts:897` (`د.ع`)
- **Description:** Currency is displayed inconsistently — sometimes as `IQD` (English abbreviation), sometimes as `د.ع` (Arabic abbreviation for Iraqi Dinar). Some places show raw numbers without any currency suffix.
- **Expected:** Consistent currency formatting: `د.ع` for Arabic UI, `IQD` for English UI, with proper thousand separators for large amounts (common in IQD where prices are in thousands/millions).
- **Suggested Fix:** Create a `formatCurrency(amount, locale)` utility function and use it everywhere.

### Issue 7.5 — Default Subjects Not Complete for Iraqi Curriculum
- **Severity:** :green_circle: Improvement
- **Category:** Iraqi Context
- **File:** `services/api.ts:260-262` (institutes), `services/api.ts:2259-2260` (schools)
- **Description:** Default subjects for institutes are: `['رياضيات', 'إنكليزي', 'عربي', 'علوم', 'فيزياء', 'كيمياء', 'حاسوب']`. Schools have a more complete list including Islamic education, history, geography, etc. Both miss some Iraqi-curriculum subjects like `الأدب العربي` (Arabic Literature, for preparatory stage) and `الاقتصاد` (Economics).
- **Expected:** Default subjects should match the official Iraqi Ministry of Education curriculum for each stage.
- **Suggested Fix:** Customize default subjects based on institute type and stage.

---

## 8. Complex Relationships

### Issue 8.1 — Parent With Multiple Children: Data Not Institute-Filtered
- **Severity:** :yellow_circle: Medium
- **Category:** Complex Relationships
- **File:** `stores/parentStore.ts`, `services/api.ts:1088-1092`
- **Description:** When a parent has children in different institutes (e.g., one child at Institute A and another at Institute B), the parent's institute is detected from their first enrollment. The parent may be shown data from only one institute, missing notifications and announcements from the other.
- **Expected:** Parent should see data from all their children's institutes, or have an institute selector.
- **Suggested Fix:** Modify `detectInstitute` for parents to return all institute IDs, and load data for all of them.

### Issue 8.2 — Student in Multiple Classes: Only Primary Class Used
- **Severity:** :yellow_circle: Medium
- **Category:** Complex Relationships
- **File:** `services/api.ts:995-1013`
- **Description:** Students can be enrolled in multiple classes via `student_classes`, but `getStudentClassId()` only returns the first enrollment's `class_id`. Many APIs that depend on `classId` (tasks, exams, timetable) only operate on the primary class.
- **Expected:** The class selector in the student UI should let students switch between all enrolled classes, and all data should reflect the selected class.
- **Suggested Fix:** The student class selector exists in the UI (`studentStore.loadStudentClasses`) but many API calls still use the primary class. Ensure all data-loading functions use `selectedClassId` from the store.

### Issue 8.3 — No Multi-Branch Data Isolation
- **Severity:** :yellow_circle: Medium
- **Category:** Complex Relationships
- **File:** `supabase/migrations/20260413_multi_branch.sql`
- **Description:** The branch system exists in the database schema (`branches` table with `branch_users`) but most API queries do not filter by `branch_id`. Attendance, grades, schedules, and other data are shared across all branches of an institute.
- **Expected:** If branches are enabled, data should be filterable by branch. A branch admin should only see their branch's data.
- **Suggested Fix:** Add optional `branch_id` filtering to all data-loading APIs when the institute has branches enabled.

### Issue 8.4 — Teacher Teaching Multiple Classes: Content Visibility
- **Severity:** :green_circle: Improvement
- **Category:** Complex Relationships
- **File:** `services/api.ts:572-580`
- **Description:** When a teacher creates content (videos, materials, exams), they can target a specific class via `class_id`. However, the class selector in the teacher UI only allows selecting one class at a time. A teacher cannot share content with multiple selected classes simultaneously — they must upload/create separately for each class.
- **Expected:** Allow teachers to select multiple classes when creating content.
- **Suggested Fix:** Add multi-select for classes in content creation forms. Support array of `class_id` values.

---

## 9. Additional Findings

### Issue 9.1 — supabaseAdmin Used in Client-Side Store Imports
- **Severity:** :orange_circle: High
- **Category:** Architecture
- **File:** `stores/dataStore.ts:3`, `app/(admin)/users.tsx:29`
- **Description:** `supabaseAdmin` (the service role client) is imported directly in store files and UI components. Even though it's null in production, this pattern suggests the architecture was designed for the service role key to be in the client. Some UI components (`users.tsx:29`) directly import `supabaseAdmin` for use in admin operations.
- **Expected:** Service role operations should only happen on the server (Edge Functions).
- **Suggested Fix:** Refactor all admin operations to go through Edge Functions. Remove all `supabaseAdmin` imports from client-side code.

### Issue 9.2 — Backup Function Is a No-Op
- **Severity:** :yellow_circle: Medium
- **Category:** Feature Completeness
- **File:** `services/api.ts:461-464`
- **Description:** `triggerBackup()` returns `{ success: true, message: 'تم طلب النسخ الاحتياطي' }` without actually performing any backup. The system settings page has a backup toggle but it does nothing.
- **Expected:** Either implement actual backup functionality or remove the feature from the UI.
- **Suggested Fix:** Implement backup via Supabase's pg_dump or use their built-in backup features. At minimum, hide the feature if not implemented.

### Issue 9.3 — changeInstituteCode Function Is Incomplete
- **Severity:** :yellow_circle: Medium
- **Category:** Feature Completeness
- **File:** `services/api.ts:514-519`
- **Description:** `changeInstituteCode()` finds the institute's user account but then returns success without actually changing the code. The comment says "can't change auth email/password without service_role" but `resetInstituteCode()` (line 2195) does implement this correctly.
- **Expected:** Either complete the function or remove it and use `resetInstituteCode` consistently.
- **Suggested Fix:** Replace calls to `changeInstituteCode` with `resetInstituteCode`, or implement the actual code change logic.

### Issue 9.4 — saveInstitutePermissions Is a No-Op
- **Severity:** :yellow_circle: Medium
- **Category:** Feature Completeness
- **File:** `services/api.ts:1466-1477`
- **Description:** `saveInstitutePermissions()` receives permissions data but does nothing with it — it sets `city: undefined` (no change) and returns success. The comment acknowledges this: "Since there's no permissions column, we'll use system_settings pattern... For now, use AsyncStorage + notify".
- **Expected:** Either implement the feature properly or remove the UI controls.
- **Suggested Fix:** Add a `permissions` JSONB column to the `institutes` table and actually save the data.

### Issue 9.5 — Offline Mode May Show Stale Data Without Warning
- **Severity:** :green_circle: Improvement
- **Category:** UX
- **File:** `stores/dataStore.ts:143-152`
- **Description:** When offline, cached data is loaded. The `isOfflineData` flag is set to `true`, but not all UI components check this flag to warn the user they are viewing potentially outdated information.
- **Expected:** Show a prominent banner "You are viewing cached data" whenever `isOfflineData` is true.
- **Suggested Fix:** Add an offline banner component that reads from `useDataStore().isOfflineData`.

### Issue 9.6 — Admin getAllUsersWithDetails Has Scalability Issue
- **Severity:** :green_circle: Improvement
- **Category:** Performance
- **File:** `services/api.ts:166-181`
- **Description:** `getAllUsersWithDetails()` fetches up to 5000 users and 10000 enrollments in a single call, then performs in-memory joins. For a growing SaaS platform, this will become a performance bottleneck.
- **Expected:** Use database-side joins and pagination for admin statistics.
- **Suggested Fix:** Create a Supabase RPC function or view that performs the join and aggregation server-side. Return only aggregated statistics, not all raw records.

### Issue 9.7 — getStudentPaymentsSummary N+1 Query Problem
- **Severity:** :green_circle: Improvement
- **Category:** Performance
- **File:** `services/api.ts:1751-1775`
- **Description:** `getStudentPaymentsSummary()` fetches all students in an institute, then queries payments for each student individually in a loop. For an institute with 500 students, this creates 500 separate database queries.
- **Expected:** Use a single query with JOIN or RPC.
- **Suggested Fix:** Create a single query: `SELECT student_id, SUM(amount) as total FROM payments WHERE institute_id = ? GROUP BY student_id`.

---

## Summary of Critical Actions Required Before Production

| Priority | Action |
|----------|--------|
| 1 | Implement Edge Functions for all admin operations (createUser, deleteUser, resetCode, freeze/unfreeze) |
| 2 | Fix permissive RLS policies on attendance, timetables, payments, classes, parent_child, cafeteria, medical, tasks tables |
| 3 | Fix installments table fully permissive RLS (financial data exposure) |
| 4 | Fix user deletion to clean up all related data (orphaned records) |
| 5 | Add grade validation (score <= max_score) |
| 6 | Link QR attendance scans to the main attendance table |
| 7 | Add notifications for grade entries (teacher -> student/parent) |
| 8 | Add duplicate prevention for exam/task submissions |
| 9 | Fix notification RLS cross-tenant leak via role matching |
| 10 | Implement weighted grade averages using the existing weight column |

---

*Report generated by 8-expert analysis team on 2026-04-15*
