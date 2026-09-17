import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CloudSun, Droplets, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  JacketMark,
  ShoeMark,
  TeeMark,
  TrousersMark,
} from "@/components/landing/garment-marks";

export const dynamic = "force-dynamic";

/* The three things that actually happen, in order. Two columns and a zig-zag
   rather than a row of equal cards: the steps are sequential, and three
   identical boxes side by side say nothing about order. */
const STEPS = [
  {
    n: "01",
    title: "Photograph the pile",
    body: "Drop a folder in, or shoot straight from the camera. Add twenty things in one pass — the tagging happens after, not between shots.",
  },
  {
    n: "02",
    title: "Each photo gets read",
    body: "A vision model runs in your browser and proposes the garment, its sleeve length, how heavy it looks and its colour. Every field is a suggestion you can overrule, and when it is unsure it says so rather than guessing.",
  },
  {
    n: "03",
    title: "Dressed for the forecast",
    body: "Your local temperature picks what is wearable, then fixed rules assemble it. Every outfit has a top, something on the legs and shoes — jackets and accessories join when the weather earns them.",
  },
];

/* Stated as limits, because they are the interesting part. A wardrobe app that
   quietly edits your clothes would be easier to build and worse to use. */
const PROMISES = [
  {
    icon: Sparkles,
    title: "Your photo is never touched",
    body: "No background removal, no regeneration, no cropping. The file you took is the file that is stored — wrinkles, laundry basket and all.",
  },
  {
    icon: CloudSun,
    title: "No language model anywhere",
    body: "Outfits come out of arithmetic, not a chat completion. The same wardrobe and the same weather give the same looks every time.",
  },
  {
    icon: Droplets,
    title: "The analysis stays on your device",
    body: "The model downloads once, then runs locally. Your photos go to your own private storage and nowhere else — not to us, not to anyone's API.",
  },
];

const THEMES = [
  { label: "Light", canvas: "#fbf8f3", card: "#ffffff", accent: "#c0512c" },
  { label: "Dark", canvas: "#14120f", card: "#1e1b17", accent: "#e0703f" },
  { label: "Hello Kitty", canvas: "#ffffff", card: "#f5b8d0", accent: "#ffc72c" },
  { label: "Kuromi", canvas: "#514283", card: "#e1ddf4", accent: "#cac5ed" },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/wardrobe");

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* ---------------------------------------------------------------- */}
      {/* Top bar — the app's own nav renders only when signed in          */}
      {/* ---------------------------------------------------------------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
        <span className="display text-lg tracking-[0.02em]">Wardroby</span>
        <Link
          href="/login"
          className="tactile rounded-full border border-border px-4 py-2 text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 lg:px-10">
        {/* -------------------------------------------------------------- */}
        {/* Hero                                                           */}
        {/* -------------------------------------------------------------- */}
        <section className="grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
          <div>
            <p className="eyebrow rise" style={{ "--i": 0 } as React.CSSProperties}>
              Wardrobe · Weather · Outfits
            </p>

            <h1
              className="display rise mt-5 max-w-[15ch] text-balance text-[2.6rem] leading-[1.02] tracking-tight sm:text-[3.4rem] lg:text-[3.75rem]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              Your closet, sorted by the weather.
            </h1>

            <p
              className="rise mt-6 max-w-[54ch] text-base leading-relaxed text-muted-foreground"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Photograph what you own once. Wardroby reads each garment on your
              device, learns which seasons it belongs to, and puts complete
              outfits together against the temperature outside your window.
            </p>

            <div
              className="rise mt-9 flex flex-wrap items-center gap-3"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <Button asChild size="lg" className="tactile group">
                <Link href="/signup">
                  Start my closet
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <span className="text-[13px] text-muted-foreground">
                Free, and nothing to install.
              </span>
            </div>
          </div>

          {/* The composition: a look, the way the app draws one. Built from
              the design tokens rather than a screenshot, so it stays true in
              all four themes and costs no network. */}
          <div className="relative lg:pl-6" aria-hidden>
            <div className="drift relative mx-auto max-w-sm lg:max-w-none">
              <div className="sheen relative z-10 overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-[0_24px_60px_-28px_rgb(23_20_18_/_0.28)] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Look 01</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                    <CloudSun className="size-3.5" />
                    64°F · Cloudy
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[TeeMark, TrousersMark, ShoeMark, JacketMark].map(
                    (Mark, i) => (
                      <div
                        key={i}
                        className="garment-tile flex aspect-square items-center justify-center rounded-2xl p-6 text-clay-ink/70"
                      >
                        <Mark />
                      </div>
                    ),
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["Spring", "Fall", "Casual"].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {/* Offset behind the card — depth without a drop shadow doing
                  all the work. */}
              <div className="absolute -right-3 -top-3 z-0 hidden h-full w-full rounded-[2rem] border border-border/70 sm:block" />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* How it works — zig-zag                                          */}
        {/* -------------------------------------------------------------- */}
        <section className="border-t border-border py-16 sm:py-24">
          <h2 className="display max-w-[18ch] text-[1.9rem] leading-tight tracking-tight sm:text-4xl">
            Three steps, and the last one is automatic.
          </h2>

          <div className="mt-12 flex flex-col gap-12 sm:gap-16">
            {STEPS.map(({ n, title, body }, i) => {
              /* Alternating sides. Placed by explicit grid columns rather than
                 `order`, so the DOM sequence stays the reading sequence and a
                 screen reader hears 01, 02, 03 whichever side they sit on. */
              const flipped = i % 2 === 1;
              return (
                <article
                  key={n}
                  className="grid gap-x-10 gap-y-3 border-t border-border pt-7 sm:grid-cols-12"
                >
                  <span
                    className={`font-mono text-[13px] text-clay-ink sm:col-span-2 sm:row-start-1 ${
                      flipped ? "sm:col-start-11" : "sm:col-start-1"
                    }`}
                  >
                    {n}
                  </span>
                  <h3
                    className={`display text-xl tracking-tight sm:col-span-4 sm:row-start-1 ${
                      flipped ? "sm:col-start-7" : "sm:col-start-3"
                    }`}
                  >
                    {title}
                  </h3>
                  <p
                    className={`max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground sm:col-span-5 sm:row-start-2 ${
                      flipped ? "sm:col-start-2" : "sm:col-start-7"
                    }`}
                  >
                    {body}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Constraints                                                     */}
        {/* -------------------------------------------------------------- */}
        <section className="border-t border-border py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <h2 className="display text-[1.9rem] leading-tight tracking-tight sm:text-4xl lg:sticky lg:top-10 lg:self-start">
              What it refuses to do.
            </h2>

            <ul className="divide-y divide-border border-y border-border">
              {PROMISES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-5 py-7">
                  <Icon className="mt-0.5 size-5 shrink-0 text-clay-ink" />
                  <div>
                    <h3 className="text-[15px] font-semibold">{title}</h3>
                    <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Themes                                                          */}
        {/* -------------------------------------------------------------- */}
        <section className="border-t border-border py-16 sm:py-24">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="display max-w-[20ch] text-[1.9rem] leading-tight tracking-tight sm:text-4xl">
              Four palettes. Pick one on the way in.
            </h2>
            <p className="max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">
              Chosen when you sign up, changed whenever you like.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
            {THEMES.map(({ label, canvas, card, accent }) => (
              <div key={label} className="group">
                <div
                  className="tactile relative h-28 overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgb(128_128_128_/_0.3)] group-hover:-translate-y-1 sm:h-32"
                  style={{ background: canvas }}
                >
                  <span
                    className="absolute left-3 top-3 block h-7 w-[62%] rounded-lg"
                    style={{ background: card }}
                  />
                  <span
                    className="absolute bottom-3 left-3 block size-3.5 rounded-full"
                    style={{ background: accent }}
                  />
                </div>
                <p className="mt-2.5 text-[13px] text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Close                                                           */}
        {/* -------------------------------------------------------------- */}
        <section className="border-t border-border py-20 sm:py-28">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <h2 className="display text-[2.1rem] leading-[1.05] tracking-tight sm:text-[2.9rem]">
              Stop standing in front of an open wardrobe.
            </h2>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Button asChild size="lg" className="tactile group">
                <Link href="/signup">
                  Start my closet
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="tactile">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-border px-6 py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span className="display text-[15px] tracking-[0.02em] text-foreground">
          Wardroby
        </span>
        <span>Your photos stay yours.</span>
      </footer>
    </div>
  );
}
