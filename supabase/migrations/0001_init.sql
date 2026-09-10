-- ============================================================
-- Wordroby — initial schema
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table profiles enable row level security;

drop policy if exists "Users can read their own profile" on profiles;
create policy "Users can read their own profile"
on profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
on profiles for update
using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- wardrobe_items
-- ------------------------------------------------------------
create table if not exists wardrobe_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  image_url text not null,
  original_image_url text,
  item_name text not null,
  category text not null check (category in ('top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory')),
  sub_category text not null,
  primary_color text not null,
  secondary_colors text[] default '{}',
  formality text not null check (formality in ('casual', 'business_casual', 'formal', 'athletic', 'lounge')),
  min_temp_f int not null default 30,
  max_temp_f int not null default 100,
  suitable_conditions text[] default '{}',
  layering_role text not null check (layering_role in ('base_layer', 'mid_layer', 'outerwear', 'standalone', 'footwear')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists wardrobe_items_user_id_idx on wardrobe_items (user_id);
create index if not exists wardrobe_items_temp_idx on wardrobe_items (min_temp_f, max_temp_f);

alter table wardrobe_items enable row level security;

drop policy if exists "Users can manage their own wardrobe items" on wardrobe_items;
create policy "Users can manage their own wardrobe items"
on wardrobe_items for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- storage: garment images
-- Images live at  wardrobe/<user_id>/<filename>
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', true)
on conflict (id) do nothing;

drop policy if exists "Wardrobe images are publicly readable" on storage.objects;
create policy "Wardrobe images are publicly readable"
on storage.objects for select
using (bucket_id = 'wardrobe');

drop policy if exists "Users can upload to their own wardrobe folder" on storage.objects;
create policy "Users can upload to their own wardrobe folder"
on storage.objects for insert
with check (
  bucket_id = 'wardrobe'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update their own wardrobe images" on storage.objects;
create policy "Users can update their own wardrobe images"
on storage.objects for update
using (
  bucket_id = 'wardrobe'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete their own wardrobe images" on storage.objects;
create policy "Users can delete their own wardrobe images"
on storage.objects for delete
using (
  bucket_id = 'wardrobe'
  and auth.uid()::text = (storage.foldername(name))[1]
);
