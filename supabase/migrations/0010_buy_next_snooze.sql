-- ============================================================
-- "What to buy next" can be closed, and comes back three days later.
-- Run after 0009_account_theme.sql.
--
-- On the account rather than in the browser for the same reason as the theme:
-- closing it on the phone should not leave it open on the laptop.
-- ============================================================

-- Null, or a time already passed, means show it.
alter table profiles
  add column if not exists buy_next_hidden_until timestamp with time zone;

comment on column profiles.buy_next_hidden_until is
  'The "What to buy next" card stays hidden until this time. Null shows it.';
