-- ═══════════════════════════════════════════════════
-- Feature Flag: admin_view_user_codes
-- Per-institute opt-in: when enabled, the platform admin's User Detail sheet
-- shows the editable login code field for users belonging to that institute.
-- When disabled (default), the code field is hidden — admin can still reset
-- a user's code via the dedicated "reset code" flow but cannot view existing codes.
-- ═══════════════════════════════════════════════════

-- 1. Register the feature in the catalog
INSERT INTO available_features (
  feature_key, feature_name_ar, feature_name_en, description_ar,
  category, icon_name, color, target_interfaces, route_by_interface,
  is_core, institute_only, school_only, display_order
) VALUES (
  'admin_view_user_codes',
  'عرض رموز الدخول للمستخدمين',
  'Show User Login Codes',
  'السماح بعرض وتعديل رمز دخول المستخدم في تفاصيله. عند التعطيل يبقى زر إعادة التعيين متاح فقط.',
  'admin',
  'key',
  '#7C3AED',
  '{"admin"}'::text[],
  '{}'::jsonb,
  false,    -- not core
  false,    -- both institutes and schools
  false,
  16
)
ON CONFLICT (feature_key) DO NOTHING;

-- 2. Auto-seed feature_flags rows for all existing institutes (default: disabled)
INSERT INTO feature_flags (institute_id, feature_key, is_enabled, feature_id)
SELECT i.id, 'admin_view_user_codes', false, af.id
FROM institutes i
CROSS JOIN available_features af
WHERE af.feature_key = 'admin_view_user_codes'
ON CONFLICT (institute_id, feature_key) DO NOTHING;

-- 3. Update the auto-seed trigger to include admin_view_user_codes for new institutes
-- (already covered by seed_feature_flags_for_institute() because the catalog
--  WHERE clause excludes only the static core/admin keys; this one is non-core
--  so it'll be picked up automatically. No trigger change required.)

-- ═══════════════════════════════════════════════════
-- DONE
-- After applying:
--   - Each institute has a feature_flags row with is_enabled=false
--   - Platform admin can toggle this per-institute from /admin/features
--   - app/(admin)/users.tsx checks the flag for the user's institute_id
--     before exposing the editable code field
-- ═══════════════════════════════════════════════════
