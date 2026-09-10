# Wardroby

A digital wardrobe: photograph your clothes, tag them yourself in bulk, then
get outfit suggestions that match the weather outside.

Manual tagging, no AI. Add many photos at once — from your gallery or straight
from your phone camera — pick the season (Summer / Winter / Rainy / All Season)
and where you will wear it. Outfit recommendations come from a SQL temperature
query plus a fixed scoring function in
[`src/lib/outfit-engine.ts`](src/lib/outfit-engine.ts), so the same wardrobe
and the same inputs always produce the same looks in the same order.

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, hand-rolled shadcn-style primitives on Radix |
| Data / auth / storage | Supabase (Postgres + Auth + Storage) |
| Weather | Open-Meteo (free, no API key) |

## Setup

### 1. Create a Supabase project

Then run the files in [`supabase/migrations/`](supabase/migrations) in order in
the SQL editor — `0001_init.sql`, `0002_wear_context.sql`, then
`0003_private_storage.sql`. Afterwards run
[`supabase/verify-security.sql`](supabase/verify-security.sql) to confirm RLS
and the private bucket are actually in force.
`0001_init.sql` It creates `profiles` and `wardrobe_items`, the RLS policies,
a trigger that provisions a profile row on sign-up, and the public `wardrobe`
storage bucket with per-user folder policies.

For local development it's easiest to turn **off** email confirmation
(Authentication → Providers → Email), otherwise a new account has to confirm by
email before it can sign in.

### 2. Fill in the environment

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |

There is no OpenAI key in the environment on purpose — see below.

### 3. Run it

```bash
npm run dev
```

## Security

| Concern | How it's handled |
| --- | --- |
| Secrets in git | `.gitignore` covers `.env*` except the template; a `pre-commit` hook blocks env files and secret-shaped strings. Run `rm .git/hooks/pre-commit` to drop it. |
| Supabase anon key | Public by design — it ships in the browser bundle. Safe because RLS is on for every table; the **service_role** key must never be added to this project, as it bypasses RLS. |
| Row Level Security | Declared in the migrations. Verify it on the live database with [`supabase/verify-security.sql`](supabase/verify-security.sql) — every row should read OK. |
| Garment photos | The `wardrobe` bucket is **private**. Images reach the browser only through signed links minted per request and valid for an hour, and storage policies scope every object to its owner's folder. |
| XSS | A Content Security Policy plus `nosniff`, `DENY` framing, a strict referrer policy and HSTS are set in [`next.config.ts`](next.config.ts). |

## Mobile

The layout is built mobile-first and verified at 375 px:

- navigation is a bottom tab bar on phones and a top bar from `md:` up;
- **Add item** is a floating button above the tab bar, within thumb reach;
- dialogs are bottom sheets on phones and centred modals on desktop;
- inputs are 16 px on mobile so iOS Safari doesn't zoom on focus, and controls
  are at least 44 px tall;
- `viewport-fit=cover` plus `env(safe-area-inset-*)` keeps content clear of the
  notch and home indicator;
- the delete control on a garment card is always visible on touch, since there
  is no hover to reveal it;
- outfit cards set their column count from the piece count, so a three-piece
  look never leaves an empty cell.

## How a garment gets added

1. Tap **Add items** — drop many photos at once, choose from your gallery, or
   use **Take photo** on your phone to shoot several in a row. Pending photos
   show as a grid; tap **Done clicking pictures** when finished.
2. Each photo is shown for manual tagging: give it a name, pick a category
   (Top / Bottom / One piece / Outerwear / Shoes / Accessory), then:
   - **Which season is this for?** — Summer / Winter / Rainy / All Season
   - **Where will you wear this?** — same four season choices (second
     question, as requested). Both map to a temperature range and to
     `suitable_conditions` (`hot/sunny`, `cold/snowy`, `rainy/cloudy`, etc.).
3. Photos are compressed client-side to AVIF/WebP (640px) before upload to
   `wardrobe/<user-id>/…` in a private bucket. Only the path is stored; the
   app signs a one-hour link whenever an image needs to be displayed.
4. Nothing is written until you confirm — hit **Save** and all tagged items
   are uploaded and written in one go.

## How outfits are assembled

Input: temperature (auto-detected via geolocation, editable), the occasion
you're dressing for, and a rain toggle.

1. **Candidates** — a SQL query returns pieces rated within 15 °F of today's
   temperature. The band is deliberately wider than the weather so a piece that
   is slightly off can still be offered as an alternative.
2. **Assembly** — either `top + bottom + footwear` or `one_piece + footwear`,
   with outerwear optionally layered on top.
3. **Scoring** — every outfit starts at a base score and loses points for each
   compromise: not tagged for the occasion, the wrong register of dress, rated
   outside today's temperature, no layer below 60 °F, not rain-safe when it's
   wet. Colour harmony and formality cohesion add points back. Ties break on
   outfit id, so ordering is stable.
4. **Honesty** — each outfit is labelled **Spot on** (no compromises),
   **Close match**, or **Alternative**, and lists what is off about it: *"No
   layer for 50°F — you'll want a jacket over this"*, *"Nothing here is meant
   for gym"*. When nothing is a clean match, a banner above the results says
   why: nothing tagged for the occasion, no outerwear that fits, and so on.

**The only hard requirement is the shape of the outfit.** Nothing is filtered
out for being off-occasion or a few degrees off, so a wardrobe holding a shirt,
a pair of trousers and shoes always gets suggestions — flagged, but never an
empty screen. Generation returns nothing only when a slot is genuinely absent
(no shoes at all) or nothing is within 15 °F of the weather, and the message
says which.

## Cost

No AI, no per-garment cost. The only external call is Open-Meteo for weather
(free, no key). Storage is Supabase — photos are 640px AVIF/WebP, roughly
35–60 KB each.

## Project layout

```
src/
  app/
    api/weather/          Open-Meteo proxy
    wardrobe/             grid page + save/delete server actions
    outfits/              generator page + generate server action
    settings/             account screen
  components/
    ui/                   Radix-based primitives
    wardrobe/             bulk upload dialog (camera + gallery), item card, grid
    outfits/              generator, outfit card, weather icon
  lib/
    image.ts              AVIF/WebP compression (640px)
    storage.ts            private-bucket paths and signed links
    outfit-engine.ts      deterministic recommendation logic
    weather.ts            Open-Meteo client
    supabase/             browser, server and proxy clients
supabase/migrations/      schema, RLS and storage policies
supabase/verify-security.sql  one-shot audit of the live database
```
