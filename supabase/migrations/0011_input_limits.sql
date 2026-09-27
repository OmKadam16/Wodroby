-- ============================================================
-- Size limits on everything a user can write. Run after 0010_buy_next_snooze.sql.
--
-- The server actions validate their input, but they are not the only way in:
-- the anon key ships in the browser by design, so a signed-in user can write
-- to their own rows through the REST API directly and skip every check in
-- src/app. Row-level security already keeps them inside their own rows; these
-- constraints keep those rows a sane size, so one account cannot fill the
-- project's database with megabyte-long names.
--
-- Limits are generous. When this was written the longest item name was 36
-- characters and the most occasions on one item was 5. The same numbers are
-- mirrored in src/app/wardrobe/actions.ts so the app says what went wrong
-- instead of surfacing a constraint name. Change one, change the other.
--
-- Each constraint is dropped first so this file re-runs clean.
-- ============================================================

-- ------------------------------------------------------------
-- wardrobe_items
-- ------------------------------------------------------------
alter table wardrobe_items drop constraint if exists wardrobe_items_text_lengths_check;
alter table wardrobe_items add constraint wardrobe_items_text_lengths_check check (
  length(item_name) <= 80
  and length(sub_category) <= 60
  and length(primary_color) <= 40
  and (wear_notes is null or length(wear_notes) <= 500)
  and length(image_url) <= 500
  and (original_image_url is null or length(original_image_url) <= 500)
);

-- CHECK constraints cannot run a subquery over an array, so each list is
-- bounded by entry count and by its joined length rather than per entry.
alter table wardrobe_items drop constraint if exists wardrobe_items_array_sizes_check;
alter table wardrobe_items add constraint wardrobe_items_array_sizes_check check (
  (secondary_colors is null or (
    cardinality(secondary_colors) <= 8
    and length(array_to_string(secondary_colors, '')) <= 320))
  and (suitable_conditions is null or (
    cardinality(suitable_conditions) <= 10
    and length(array_to_string(suitable_conditions, '')) <= 200))
);

-- Mirrors OCCASIONS in src/types/wardrobe.ts. Adding an occasion there means
-- adding it here, or saving it will be refused.
alter table wardrobe_items drop constraint if exists wardrobe_items_occasions_check;
alter table wardrobe_items add constraint wardrobe_items_occasions_check check (
  occasions is null or occasions <@ array[
    'work', 'business_meeting', 'casual_outing', 'date_night', 'party',
    'wedding', 'formal_event', 'travel', 'gym', 'outdoor_activity', 'beach',
    'lounging', 'school', 'religious_service'
  ]::text[]
);

-- ------------------------------------------------------------
-- saved_outfits and outfit_feedback
-- ------------------------------------------------------------
-- Both take an outfit straight from the browser. An outfit id is its item ids
-- joined, and a look is a handful of pieces, so 12 items and 1000 characters
-- are far past anything the engine builds. toggleSaveOutfit writes '' for "no
-- occasion", so the empty string is allowed alongside null.
alter table saved_outfits drop constraint if exists saved_outfits_sizes_check;
alter table saved_outfits add constraint saved_outfits_sizes_check check (
  length(outfit_id) <= 1000
  and cardinality(item_ids) between 1 and 12
  and temp between -150 and 150
  and (occasion is null or length(occasion) <= 40)
  and (match_level is null or match_level in ('exact', 'close', 'alternative'))
  and (reasons is null or (
    cardinality(reasons) <= 20 and length(array_to_string(reasons, '')) <= 4000))
  and (compromises is null or (
    cardinality(compromises) <= 20 and length(array_to_string(compromises, '')) <= 4000))
);

alter table outfit_feedback drop constraint if exists outfit_feedback_sizes_check;
alter table outfit_feedback add constraint outfit_feedback_sizes_check check (
  length(outfit_id) <= 1000
  and cardinality(item_ids) between 1 and 12
  and temp between -150 and 150
  and (occasion is null or length(occasion) <= 40)
);

-- ------------------------------------------------------------
-- outfit_cache: read-only now
-- ------------------------------------------------------------
-- Nothing has written this table since outfits stopped being cached (see
-- generateOutfitsAction), but its policy still let any account store an
-- unbounded jsonb blob in it. Reads and deletes stay; writes go.
revoke insert, update on outfit_cache from anon, authenticated;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
-- Owners may update their own row, which includes the email copy.
alter table profiles drop constraint if exists profiles_email_length_check;
alter table profiles add constraint profiles_email_length_check
  check (length(email) <= 320);
