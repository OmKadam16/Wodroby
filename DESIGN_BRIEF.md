# Wardroby — UI Redesign Brief

Design a complete visual system and every screen for **Wardroby**, a personal
digital wardrobe app. The app works today; it is functional but visually plain
and generic. I want it to feel like a considered fashion product — editorial,
warm, tactile — while staying fast and obvious to use on a phone.

Design **mobile-first**, then the desktop version of each screen.

---

## 1. What the app actually does

A user photographs each piece of clothing they own and tags it (category,
type, season). The app stores that wardrobe. Then, based on the **live weather
at their location** and an **occasion they pick**, it assembles complete
outfits out of clothes they actually own — top + bottom + shoes, or dress +
shoes, with outerwear layered when it is cold.

Two things to understand, because they shape the design:

- **There is no AI.** Outfits are built by fixed rules from the weather and
  the user's own tags. Do not design "AI magic" affordances — no sparkle
  loading states implying a model is thinking, no chat. This is a tool that
  arranges things the user owns. Confidence and clarity, not mysticism.
- **Every photo is user-taken and messy.** Different lighting, cluttered
  backgrounds, inconsistent framing, no background removal. The grid must
  make an inconsistent set of photos look deliberate. This is the single
  hardest visual problem in the app — solve it explicitly.

---

## 2. Who it is for

One person managing their own closet, mostly on a phone, often in a hurry
(getting dressed, packing). Age 18–35. They care how things look. They will
abandon the app if adding 20 garments is tedious.

**Tone:** quietly confident. Like a well-made paper notebook or a good
camera app. Not corporate SaaS, not playful-startup, not luxury-parody.

---

## 3. Visual direction

### Mood
Editorial fashion print meets a precise utility tool. Warm paper ground,
strong typographic hierarchy, generous negative space, photography treated as
the hero. Think a stylist's lookbook that happens to be an app.

Avoid: cold blue-grey SaaS palettes, glassmorphism, heavy gradients, drop
shadows everywhere, purple-to-pink AI gradients, stock-illustration empty
states.

### Color system

Build the palette on **warm neutrals with one confident accent**. Ship both
light and dark. Provide every value as a token.

**Light mode**

| Role | Hex | Use |
|---|---|---|
| Canvas | `#FBF8F3` | page background, warm paper |
| Surface | `#FFFFFF` | cards, sheets, dialogs |
| Surface sunken | `#F2EDE5` | garment tile backdrop, inputs |
| Border | `#E4DCD0` | hairlines, card edges |
| Ink | `#171412` | primary text |
| Ink muted | `#6B635B` | secondary text, labels |
| **Accent (clay)** | `#C0512C` | primary buttons, active chips, brand |
| Accent hover | `#A84424` | pressed/hover |
| Accent tint | `#F7E7E0` | selected chip fill, subtle badges |
| Olive (positive) | `#4A5340` | saved / bookmarked / "spot on" |
| Olive tint | `#E8EBE2` | positive badge fill |
| Destructive | `#B3261E` | delete, errors |

**Dark mode**

| Role | Hex |
|---|---|
| Canvas | `#14120F` |
| Surface | `#1E1B17` |
| Surface sunken | `#26221D` |
| Border | `#332E27` |
| Ink | `#F2EDE6` |
| Ink muted | `#A39A90` |
| Accent (clay) | `#E0703F` |
| Accent tint | `#3A241B` |
| Olive | `#8FA179` |
| Destructive | `#E5766C` |

**Weather semantics** — used for the weather header and season filters. Keep
them muted so they never compete with the clay accent:
sunny `#E0A43B` · cloudy `#8E9AA6` · rainy `#5B7A99` · snowy `#9FC3D4` ·
hot `#D4703A` · cold `#6E86A8`

Accent is **rare**. One primary action per screen. If three things on a
screen are clay, the design has failed.

### Typography

Two families:
- **Display** — a high-contrast serif with personality for page titles,
  temperature readouts, and outfit numbers. (Fraunces, Instrument Serif, or
  similar.)
- **UI** — a clean geometric/neutral sans for everything else. (Inter, Geist,
  or similar.)

Scale: page title 32/36px, section 20px, body 15px, label 13px uppercase with
0.06em tracking, micro 11px. Real hierarchy — do not make everything 14px grey.

### Shape, depth, motion
- Radii: cards 16px, garment tiles 12px, chips fully rounded, buttons 10px.
- Depth from **borders and warm tonal shifts**, not shadows. At most one soft
  shadow on floating elements (FAB, dialogs).
- Motion is quick and physical: 150–200ms, ease-out. Tap states scale to 0.97.
  No slow fades, no bouncing.

### Solving the messy-photo problem
Give every garment tile a consistent treatment so the grid reads as a set:
a fixed square aspect ratio, `object-fit: cover`, the sunken warm tone behind
it, a 1px inset border at low opacity, and identical 12px radius. Consider a
very subtle unifying warmth overlay. Show this working in the mockups with
**deliberately inconsistent photos** — a bright white-background shoe next to
a dim photo of jeans on a bed. If it only looks good with perfect product
shots, it is not solving the real problem.

---

## 4. Screens to design

Design all of these, mobile and desktop, in both light and dark where noted.

### 4.1 Landing page (signed out) — `/`
Single scroll. Hero with the product promise, one screenshot-style visual of
the outfits screen, three short value points (photograph your clothes · tag
once · get outfits for today's weather), sign-up CTA. Honest and specific —
no "AI-powered" language, because there is none.

### 4.2 Sign in — `/login` · 4.3 Sign up — `/signup`
Email + password only. No social login. Warm, calm, centered. Wordmark,
one-line context, the two fields, primary button, link to the other page,
inline error state. Show the error state.

### 4.4 Wardrobe — `/wardrobe` — **primary screen**
The user's whole closet as a photo grid.

Must contain:
- Page title, and an **Add** action (desktop: button in the header; mobile: a
  floating action button above the bottom tab bar).
- **Category tabs**, horizontally scrollable on mobile:
  All · Tops · Bottoms · One pieces · Outerwear · Shoes · Accessories
- **Season filter chips** with icons: Any · Summer · Winter · Rainy
- A quiet count, e.g. "12 of 38"
- The grid: 2 columns mobile, 3 tablet, 4 desktop.
- Each tile: the photo, and a **delete control** that is always visible on
  touch but only appears on hover on desktop.

Design these states: **full grid**, **empty wardrobe** ("Tap + to add your
first piece"), and **filtered-to-nothing** ("Try another filter").

### 4.5 Add garments — modal / bottom sheet, two steps
Adding 20 items must not feel like filling in 20 forms.

**Step 1 — Pick.** A drag-and-drop zone (desktop) plus two buttons: *Gallery*
and *Take photo*. Multi-select. Show the chosen photos as a thumbnail strip
with a count and a Clear action. Design the **drag-hover state**.

**Step 2 — Tag.** A list of every picked photo, each row needing only:
optional Name, **Category**, **Type**, and **Season** (required). Season is
the only mandatory field and should be a one-tap chip, not a dropdown. Show a
Remove per row, and a single *Save N to wardrobe* button.

**Step 3 — Saving.** Progress: "Saving 3 of 12…".

This flow is where the app is won or lost. Make bulk tagging feel fast.

### 4.6 Outfits — `/outfits` — **the showcase screen**
Top to bottom:

1. **Weather header.** The hero moment. Large display-serif temperature
   (`68°F`), a weather icon, condition + feels-like, and a small season pill
   ("Summer", "Summer · Rain"). Tint it with the weather semantic color. Also
   design the *loading* and *location denied* variants — denied must offer
   "Use my location" and manual entry without feeling like an error.
2. **Occasion picker.** 15 pill chips: *Anything* plus Work, Business meeting,
   Casual outing, Date night, Party, Wedding, Formal event, Travel, Gym,
   Outdoor activity, Beach, Lounging, School, Religious service. Fifteen chips
   is a lot — solve the density problem (scrollable row, two-line wrap, or a
   sheet). Only one is selected at a time.
3. **Controls row.** Temperature number input, a *Raining* toggle, a
   *Shuffle* button.
4. **Tabs:** Generated · Saved (N)
5. **Outfit grid.** 1 column mobile, 2 tablet, 3 desktop.

**The outfit card** is the most important component in the app:
- Header: "Look 1", a **match badge**, and a **bookmark** toggle.
- The garments: 2, 3, or 4 photos. The column count must follow the piece
  count so a 3-piece look never leaves an empty cell — design the 2-piece
  (dress + shoes), 3-piece (top + bottom + shoes) and 4-piece (with
  outerwear) layouts explicitly.
- Each garment shows its name and category in small type.
- Below: up to 3 **reasons** (check icon) and any **compromises** (warning
  icon), e.g. "No jacket — below 60°F a layer is expected" or "Not tagged for
  Date night, but the formality fits."

**Three match levels**, visually distinct at a glance without relying on color
alone: **Spot on** (solid clay), **Close match** (olive tint), **Alternative**
(neutral outline). The alternative badge is important — it is how the app
admits it is compromising, and it should read as honest, not as a failure.

States: results grid, **saved tab empty** ("Nothing saved yet"), **no outfits
possible** (explains what is missing, e.g. "You have no shoes tagged for this
temperature"), and **nothing generated yet**.

### 4.7 Settings — `/settings`
Minimal. Signed-in email, a short "How it works" card, Sign out. Do not pad it
with fake settings.

### 4.8 Navigation
- **Mobile:** fixed bottom tab bar, 3 tabs — Wardrobe, Outfits, Settings —
  icon + label, clear active state, safe-area padding. Plus a slim top bar
  with the wordmark.
- **Desktop:** sticky top bar — wordmark, the 3 links, user email, sign out.

---

## 5. Component inventory

Buttons (primary / outline / ghost / icon / destructive, with hover, pressed,
disabled, loading) · pill chips (idle / selected / with icon) · tabs ·
text input · number input · select · textarea · labels · badges (3 match
levels) · cards · garment tile · outfit card · dialog / bottom sheet ·
dropzone · FAB · bottom tab bar · top nav · toggle · empty state · inline
error · loading spinner · progress text · weather icons (sunny, cloudy, rainy,
snowy, windy, hot, cold).

---

## 6. Non-negotiable constraints

- **Mobile-first.** Touch targets ≥ 44px. Nothing critical hidden behind
  hover. The bottom tab bar must never cover content or the FAB.
- **Light and dark**, both fully designed. Dark is not an inverted
  afterthought — keep the warmth.
- **Accessible.** Body text ≥ 4.5:1. Never signal state by color alone —
  match levels and selected chips need shape, weight, or an icon too.
- **Real content.** Use plausible garment names ("Blue denim jacket", "White
  cotton tee", "Brown leather boots") and realistic messy photos. No lorem
  ipsum, no perfect studio cutouts.
- **Almost no prose.** I just stripped this UI from 67 words down to 21. Do
  not reintroduce explanatory paragraphs. Labels, not sentences. If a screen
  needs a paragraph to explain itself, redesign the screen.
- Built with Tailwind v4 CSS-variable tokens, Radix primitives and Lucide
  icons — stay within what those can express, and deliver the palette as
  tokens I can drop into `@theme`.

---

## 7. Deliverables

1. A **style tile**: full color palette (light + dark) with tokens, type
   scale, radii, spacing, and the icon set.
2. Every screen in section 4, **mobile and desktop**.
3. The **component inventory** from section 5 as a sheet, with states.
4. The key **empty, loading and error states** called out above.
5. The **outfit card** at all three match levels and all three piece counts.

Start with the style tile and the Outfits screen — if the weather header and
the outfit card are right, the rest of the app follows.
