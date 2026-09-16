-- ============================================================
-- Seasons, as a season.
--
-- Until now "season" had no home: it was encoded lossily as a temperature
-- range plus a condition list, and four separate places in the app decoded it
-- differently. A garment now names its seasons directly.
--
-- The temperature range stays, because the outfit engine scores in degrees and
-- needs a continuous number rather than four buckets — but it is derived from
-- seasons at write time now, never typed in. Rain moves out of the season
-- vocabulary into its own column: it is orthogonal (a parka is winter *and*
-- rain-ready), and there is no longer a season for it to hide in.
--
-- Run this after 0004_outfit_persistence.sql.
-- ============================================================

alter table wardrobe_items
  add column if not exists seasons text[] not null default '{}'::text[],
  add column if not exists rain_ready boolean not null default false,
  add column if not exists sleeve_length text,
  add column if not exists apparent_weight text,
  add column if not exists warmth text;

comment on column wardrobe_items.seasons is
  'Seasons the piece is worn in, e.g. {spring,summer,fall}. Empty means
   unstated — the app falls back to reading min_temp_f/max_temp_f.';
comment on column wardrobe_items.rain_ready is
  'Survives rain. Replaces the "rainy" entry in suitable_conditions, which
   could not coexist with a calendar-season model.';
comment on column wardrobe_items.sleeve_length is
  'What the photo shows, not what the label says. Feeds the season suggestion.';
comment on column wardrobe_items.apparent_weight is
  'How heavy the fabric looks. A visual estimate — nothing here measures cloth.';
comment on column wardrobe_items.warmth is
  'How warm the piece is to wear, independent of how heavy it looks.';

-- ------------------------------------------------------------
-- Backfill, before the constraints go on, so they validate clean rows.
--
-- A season is claimed when the item's range covers at least 10°F of that
-- season's band. Tuned against the rows actually in this table, which came
-- from an earlier vision pass and sit on multiples of five: at 12 a 35-70
-- leather jacket loses winter, 50-80 jeans lose summer, and a 60-85 t-shirt
-- loses both shoulders. At 5 a 68-105 summer piece would wrongly claim spring.
-- Spring and fall share a band, so a range alone always claims them together.
--
-- Written for arbitrary ranges rather than for the four the current add dialog
-- produces, because the rows already here do not use those four at all.
--
-- Mirrored in TypeScript by seasonsFromTempRange() in src/lib/seasons.ts.
-- Change one, change the other.
-- ------------------------------------------------------------
update wardrobe_items
set seasons = coalesce(
  nullif(
    array_remove(array[
      case when least(max_temp_f,  70) - greatest(min_temp_f, 45) >= 10 then 'spring'::text end,
      case when least(max_temp_f, 105) - greatest(min_temp_f, 70) >= 10 then 'summer'::text end,
      case when least(max_temp_f,  70) - greatest(min_temp_f, 45) >= 10 then 'fall'::text   end,
      case when least(max_temp_f,  45) - greatest(min_temp_f, 15) >= 10 then 'winter'::text end
    ], null),
    '{}'::text[]
  ),
  -- Nothing overlapped enough (a narrow hand-set band like 60-65). Place it by
  -- its midpoint rather than leaving the row with no season at all.
  case
    when (min_temp_f + max_temp_f) / 2 < 45 then array['winter']::text[]
    when (min_temp_f + max_temp_f) / 2 > 72 then array['summer']::text[]
    else array['spring','fall']::text[]
  end
)
where cardinality(seasons) = 0;

-- Rain-readiness is the one thing the old "Rainy" season carried that the new
-- four cannot. Lift it out of suitable_conditions before anything forgets it.
update wardrobe_items
set rain_ready = true
where rain_ready = false
  and exists (
    select 1 from unnest(suitable_conditions) as c
    where lower(c) in ('rainy', 'rain', 'wet')
  );

-- ------------------------------------------------------------
-- Constraints. Dropped first so this file stays re-runnable, the same way the
-- policies in 0001 are.
--
-- Deliberately permissive about an empty seasons array: the deployed app does
-- not know about this column yet and inserts rows without it, so a NOT NULL
-- without a default or a cardinality > 0 check would turn every Add Item on
-- the live site into an error the moment this migration runs. Tighten in 0006
-- once the new client is deployed and no empty rows remain.
--
-- `<@` also accepts duplicates ({summer,summer}); a duplicate check needs a
-- subquery and CHECK constraints forbid those, so saveItem dedupes instead.
-- ------------------------------------------------------------
alter table wardrobe_items drop constraint if exists wardrobe_items_seasons_check;
alter table wardrobe_items add constraint wardrobe_items_seasons_check
  check (seasons <@ array['spring', 'summer', 'fall', 'winter']::text[]);

alter table wardrobe_items drop constraint if exists wardrobe_items_sleeve_length_check;
alter table wardrobe_items add constraint wardrobe_items_sleeve_length_check
  check (sleeve_length is null or sleeve_length in ('sleeveless', 'short', 'three_quarter', 'long'));

alter table wardrobe_items drop constraint if exists wardrobe_items_apparent_weight_check;
alter table wardrobe_items add constraint wardrobe_items_apparent_weight_check
  check (apparent_weight is null or apparent_weight in ('light', 'medium', 'heavy'));

alter table wardrobe_items drop constraint if exists wardrobe_items_warmth_check;
alter table wardrobe_items add constraint wardrobe_items_warmth_check
  check (warmth is null or warmth in ('low', 'medium', 'high'));

-- No index on seasons. Nothing queries it in SQL — the wardrobe page selects
-- every row for the user and filters the array in React, and the outfits
-- prefilter still rides wardrobe_items_temp_idx. At a few hundred rows per
-- user the planner would ignore a GIN index and it would cost a write on every
-- insert. When a .contains("seasons", ...) query appears, add it then:
--   create index wardrobe_items_seasons_idx on wardrobe_items using gin (seasons);

-- Cached outfits are JSON snapshots of rows taken before this migration, and
-- hydrateOutfitItemUrls only refreshes display_url — every other field would
-- stay frozen at its pre-migration shape indefinitely. It is a cache; clear it.
delete from outfit_cache;
