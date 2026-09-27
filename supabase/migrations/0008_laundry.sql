-- ============================================================
-- Laundry: pieces the wearer owns but cannot put on today.
-- Run after 0007_color_and_signals.sql.
-- ============================================================

-- Null is clean. A timestamp rather than a boolean so the wardrobe can say how
-- long something has been in the wash, and so returning it automatically after
-- a few days stays a query rather than a second migration.
--
-- No new policy: "Users can manage their own wardrobe items" already scopes
-- every update to the owner.
alter table wardrobe_items
  add column if not exists in_wash_since timestamp with time zone;

comment on column wardrobe_items.in_wash_since is
  'When the piece went in the wash. Null when clean; outfits skip it otherwise.';
