-- ============================================================
-- Measured colour, and somewhere to record what the wearer thought.
-- Run after 0006_security.sql.
--
-- Two unrelated things in one migration because they ship together: the outfit
-- engine stops judging colour by name in the same change that starts recording
-- which outfits were kept.
-- ============================================================

-- ------------------------------------------------------------
-- wardrobe_items: the colour the reader actually measured
-- ------------------------------------------------------------
-- The pixel reader converts every sample to OKLab, snaps the winner to the
-- nearest name, and used to discard the coordinates. The name then had to be
-- matched against a hardcoded list of neutrals, which scored "olive green" and
-- "dark brown" as loud statement colours and "unknown" as one too. Chroma
-- answers that question for any colour, including ones the vocabulary has no
-- word for, so the numbers are kept.
--
-- All three are null together or set together; a partial triple describes no
-- colour. They are also null whenever the wearer picked the colour by hand,
-- which is what keeps a human correction ahead of a pixel average.
alter table wardrobe_items
  add column if not exists color_l real,
  add column if not exists color_c real,
  add column if not exists color_h real;

comment on column wardrobe_items.color_l is
  'Measured OKLCH lightness, 0..1. Null when set by hand or never measured.';
comment on column wardrobe_items.color_c is
  'Measured OKLCH chroma, 0..0.5. Decides neutral versus accent.';
comment on column wardrobe_items.color_h is
  'Measured OKLCH hue in degrees, 0..360. Decides which colours clash.';

alter table wardrobe_items drop constraint if exists wardrobe_items_color_l_check;
alter table wardrobe_items add constraint wardrobe_items_color_l_check
  check (color_l is null or (color_l >= 0 and color_l <= 1));

alter table wardrobe_items drop constraint if exists wardrobe_items_color_c_check;
alter table wardrobe_items add constraint wardrobe_items_color_c_check
  check (color_c is null or (color_c >= 0 and color_c <= 0.5));

alter table wardrobe_items drop constraint if exists wardrobe_items_color_h_check;
alter table wardrobe_items add constraint wardrobe_items_color_h_check
  check (color_h is null or (color_h >= 0 and color_h <= 360));

-- ------------------------------------------------------------
-- outfit_feedback: what the wearer did with a look
-- ------------------------------------------------------------
-- Nothing reads this yet, and that is the point. Colour harmony and weather fit
-- are closed-form problems and are solved as such; personal taste is not, and a
-- model that learns it needs examples that do not exist until someone starts
-- using the app. This table is where they accumulate.
--
-- The request that prompted it is answered without a model: this is only the
-- option to revisit that later on real data rather than on invented data.
create table if not exists outfit_feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- The engine's own id: the item ids, sorted and joined. Stable across
  -- regeneration, which is what makes a preference countable.
  outfit_id text not null,
  item_ids uuid[] not null,
  temp int not null,
  occasion text,
  is_rainy boolean not null default false,
  action text not null check (action in ('saved', 'dismissed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table outfit_feedback is
  'Kept or rejected outfits. Written only; no code reads it yet.';

create index if not exists outfit_feedback_user_id_idx on outfit_feedback (user_id);

alter table outfit_feedback enable row level security;

-- Deliberately the same shape as the other four tables. This is behavioural
-- data about a person and must never be readable by anyone else.
drop policy if exists "Users can manage their own outfit feedback" on outfit_feedback;
create policy "Users can manage their own outfit feedback"
on outfit_feedback for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
