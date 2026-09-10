-- Outfit persistence: cache per request + explicit saves
-- Cache key is (user_id, temp, occasion, is_rainy). Same request returns
-- same outfits, with new wardrobe additions appended — avoids regenerating
-- from scratch and gives stable history.

create table if not exists outfit_cache (
  user_id uuid references auth.users(id) on delete cascade not null,
  temp int not null,
  occasion text,
  is_rainy boolean not null default false,
  outfits jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, temp, occasion, is_rainy)
);

create index if not exists outfit_cache_user_id_idx on outfit_cache (user_id);

alter table outfit_cache enable row level security;

drop policy if exists "Users can manage their own outfit cache" on outfit_cache;
create policy "Users can manage their own outfit cache"
on outfit_cache for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists saved_outfits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  outfit_id text not null,
  item_ids uuid[] not null,
  temp int not null,
  occasion text,
  is_rainy boolean not null default false,
  score numeric,
  match_level text,
  reasons text[] default '{}',
  compromises text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, outfit_id)
);

create index if not exists saved_outfits_user_id_idx on saved_outfits (user_id);

alter table saved_outfits enable row level security;

drop policy if exists "Users can manage their own saved outfits" on saved_outfits;
create policy "Users can manage their own saved outfits"
on saved_outfits for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
