-- Add phone column to users table — needed so admins and institute managers
-- can see and contact users via WhatsApp. Previously phone was only saved to
-- AsyncStorage (device-local), which broke cross-device visibility.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill from auth.users.user_metadata where phone was already written by
-- bulk creation and saveUserPhone, so existing data isn't lost.
UPDATE public.users u
SET phone = (au.raw_user_meta_data ->> 'phone')
FROM auth.users au
WHERE u.id = au.id
  AND u.phone IS NULL
  AND (au.raw_user_meta_data ->> 'phone') IS NOT NULL;

-- Index to speed up phone lookups (rare today, but likely to grow — e.g.
-- parent dedup on bulk import, duplicate-phone checks).
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;
