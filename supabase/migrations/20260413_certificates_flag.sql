-- ═══════════════════════════════════════════════════
-- Digital Certificates — Feature Flag update
-- Already implemented: certificates table + 6 templates + PDF export
-- ═══════════════════════════════════════════════════

-- Just ensure flag exists for all institutes
INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
SELECT id, 'certificates', false FROM institutes
ON CONFLICT (institute_id, feature_key) DO NOTHING;
