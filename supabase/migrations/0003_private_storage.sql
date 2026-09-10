-- ============================================================
-- Close the wardrobe bucket. Photos were world-readable to anyone holding a
-- URL; they are now reachable only through short-lived signed links that the
-- server mints for the owner. Run after 0002_wear_context.sql.
-- ============================================================

update storage.buckets set public = false where id = 'wardrobe';

-- Replace the blanket public read with an owner-only one. Signed URLs are
-- issued on the caller's behalf, so this policy still governs who can read.
drop policy if exists "Wardrobe images are publicly readable" on storage.objects;

drop policy if exists "Users can read their own wardrobe images" on storage.objects;
create policy "Users can read their own wardrobe images"
on storage.objects for select
using (
  bucket_id = 'wardrobe'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- image_url holds a bucket-relative path (<user-id>/<file>) from now on.
-- Existing rows keep their full public URL; the app strips the prefix when
-- signing, so both shapes work.
comment on column wardrobe_items.image_url is
  'Path within the private wardrobe bucket, e.g. <user-id>/1712-abc.jpg.';
