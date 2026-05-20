-- Add `category` (and `image_url`) to cafeteria_items.
--
-- Why: AddItemSheet collects a category string and an optional image URL,
-- and api.addCafeteriaItem includes them in the insert payload, but the
-- columns never existed on the table — so every "add product" call with a
-- non-empty category was failing with `column "category" does not exist`.
-- MenuItemRow already renders `item.category` as a chip and `item.image_url`
-- as a thumbnail, so the UI was wired up before the schema landed.
--
-- Multi-tenant safety: existing RLS policies on cafeteria_items
-- (cafeteria_items_read / cafeteria_items_write — see 20260416_rls_lockdown_v2)
-- already enforce institute_id isolation. Adding a column does not change
-- row visibility, so no new policy is required. RLS stays enabled.

ALTER TABLE public.cafeteria_items
  ADD COLUMN IF NOT EXISTS category TEXT NULL;

ALTER TABLE public.cafeteria_items
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

-- Defense-in-depth: keep RLS on (it already is — this is a no-op safety net).
ALTER TABLE public.cafeteria_items ENABLE ROW LEVEL SECURITY;
