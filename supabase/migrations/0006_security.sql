-- ============================================================
-- Security hardening. Run after 0005_seasons.sql.
--
-- Row-level security was already correct on every table; nothing here opens
-- anything up. These are the gaps around the edges of it: an UPDATE that
-- could write a row out of its own policy, a trigger function reachable as a
-- public API endpoint, and a storage bucket that accepted any file of any
-- size. Each statement is written to re-run clean.
-- ============================================================

-- ------------------------------------------------------------
-- profiles: an UPDATE must also land inside the policy
-- ------------------------------------------------------------
-- `using` alone decides which rows may be updated, not what they may be
-- updated *to*. Without a `with check`, the owner of a row could rewrite its
-- `id` to another user's — the primary key would usually stop that, but the
-- policy should not be relying on a constraint to hold the line.
drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
on profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- ------------------------------------------------------------
-- handle_new_user: not a public API endpoint
-- ------------------------------------------------------------
-- PostgREST exposes every function in `public` at /rest/v1/rpc/<name>, so this
-- SECURITY DEFINER trigger function was callable by anyone, signed in or not.
-- Calling it outside a trigger errors rather than inserting anything, but a
-- definer-rights function should not be reachable from the internet at all.
-- The trigger itself runs as the table owner and is unaffected.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------
-- storage: only images, and only small ones
-- ------------------------------------------------------------
-- The bucket took any MIME type and any size. The policies meant a user could
-- only write inside their own folder, so this was never a route to someone
-- else's data — but it did mean an account could park arbitrary files in the
-- project's storage. The app writes AVIF, WebP or JPEG after compressing in
-- the browser; PNG is here because earlier uploads used it. The largest object
-- in the bucket today is 1.4 MB, so 10 MiB is headroom, not a limit anyone
-- will meet honestly.
update storage.buckets
set allowed_mime_types = array['image/avif','image/webp','image/jpeg','image/png'],
    file_size_limit = 10485760
where id = 'wardrobe';
