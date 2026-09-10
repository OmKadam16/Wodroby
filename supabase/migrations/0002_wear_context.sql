-- ============================================================
-- Wear context: what occasions a garment suits, in plain words.
-- Run this after 0001_init.sql.
-- ============================================================

alter table wardrobe_items
  add column if not exists occasions text[] default '{}',
  add column if not exists wear_notes text;

comment on column wardrobe_items.occasions is
  'Situations the piece works for, e.g. {work,date_night,travel}.';
comment on column wardrobe_items.wear_notes is
  'One-sentence guidance on where this works, written by the vision pass.';

-- Background removal was dropped, so only the photo as taken is stored.
-- original_image_url is left in place for existing rows but is no longer written.
comment on column wardrobe_items.original_image_url is
  'Unused since background removal was removed; image_url holds the photo.';
