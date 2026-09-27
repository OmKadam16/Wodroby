-- ============================================================
-- Usernames. Run after 0011_input_limits.sql.
--
-- New accounts pick a username, an email and a password; signing back in
-- takes the username and password only. Supabase Auth itself only knows
-- emails, so signing in means looking up the email behind a username. That
-- lookup is the sensitive part: if the browser could do it, anyone could type
-- a username and read back that person's email. So it runs on the server,
-- and the database answers it only when the call carries a key that only the
-- server holds (LOGIN_LOOKUP_KEY on Render). Only a hash of that key is
-- stored here.
-- ============================================================

-- ------------------------------------------------------------
-- profiles.username
-- ------------------------------------------------------------
-- Stored lowercase, so "Om_Kadam" and "om_kadam" are the same name and a
-- plain unique index is enough. 3-20 characters, starting with a letter,
-- then letters, digits or underscores. Mirrored by USERNAME_PATTERN in
-- src/lib/username.ts. Change one, change the other.
alter table profiles add column if not exists username text;

alter table profiles drop constraint if exists profiles_username_format_check;
alter table profiles add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z][a-z0-9_]{2,19}$');

create unique index if not exists profiles_username_key on profiles (username);

comment on column profiles.username is
  'Lowercase sign-in name, unique. Null only for accounts made outside the app.';

-- Backfill the accounts made before usernames existed, from the part of
-- their email before the @: lowercased, anything outside [a-z0-9_] turned
-- into _, a leading "u" if it does not start with a letter, padded to 3 and
-- cut to 16 characters, with a number added if the name is already taken.
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.username is null
    order by u.created_at
  loop
    base := regexp_replace(lower(split_part(coalesce(r.email, ''), '@', 1)), '[^a-z0-9_]', '_', 'g');
    if base !~ '^[a-z]' then base := 'u' || base; end if;
    -- rpad also truncates, so it only runs on names that are too short.
    if length(base) < 3 then base := rpad(base, 3, '0'); end if;
    base := left(base, 16);
    candidate := base;
    n := 1;
    while exists (select 1 from public.profiles where username = candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    update public.profiles set username = candidate where id = r.id;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- New accounts carry their username in from sign-up
-- ------------------------------------------------------------
-- The sign-up form sends it as user metadata. The unique index is the real
-- guard against two people claiming one name at the same moment: the second
-- insert fails, Supabase reports "Database error saving new user", and the
-- form says the name was just taken.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Owners may change their theme and snooze, not their identity
-- ------------------------------------------------------------
-- The update policy lets an owner write any column of their own row. The app
-- only ever writes these two; username and email stay as sign-up set them.
revoke update on profiles from anon, authenticated;
grant update (theme, buy_next_hidden_until) on profiles to authenticated;

-- ------------------------------------------------------------
-- The server's key, kept where the API cannot see it
-- ------------------------------------------------------------
-- The `private` schema is not exposed by PostgREST, and nothing outside the
-- definer function below can read it. The hash is set separately, once, so
-- the key never appears in a migration file:
--   insert into private.settings (key, value)
--   values ('login_lookup_key_sha256', '<sha256 hex of LOGIN_LOOKUP_KEY>')
--   on conflict (key) do update set value = excluded.value;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

-- ------------------------------------------------------------
-- username -> email, for the server only
-- ------------------------------------------------------------
-- Callable over the API, because the server calls it before anyone is signed
-- in, but it returns null unless p_key hashes to the stored value. Wrong key,
-- unknown username and missing hash all look the same from outside.
create or replace function public.login_email_for(p_username text, p_key text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  expected text;
  found text;
begin
  select value into expected from private.settings where key = 'login_lookup_key_sha256';
  if expected is null or p_key is null
     or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> expected then
    return null;
  end if;

  select u.email into found
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(trim(p_username));
  return found;
end;
$$;

revoke all on function public.login_email_for(text, text) from public;
grant execute on function public.login_email_for(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Is a username free? For the sign-up form.
-- ------------------------------------------------------------
-- Says only yes or no, never whose it is. Anyone can learn that a username
-- exists — the same as any site with usernames — but not the email behind it.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where username = lower(trim(p_username))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
