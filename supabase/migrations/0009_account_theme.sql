-- ============================================================
-- The theme belongs to the account, not to the browser.
-- Run after 0008_laundry.sql.
--
-- It lived only in localStorage, so the same person saw Hello Kitty on their
-- laptop and Light on their phone. Every device now follows this column, and
-- each device's own storage is only a cache of it for the first paint.
-- ============================================================

-- Null means "never chosen", which is not the same as "system": a device
-- that already has a theme may still offer it to an account that has none.
--
-- The list mirrors THEMES in src/lib/theme.ts. Adding a theme there means
-- adding it here, or saving it will be refused.
alter table profiles
  add column if not exists theme text
  check (theme in ('light', 'dark', 'kitty', 'kuromi', 'system'));

comment on column profiles.theme is
  'Chosen theme. Null until the account picks one; every device follows it.';
