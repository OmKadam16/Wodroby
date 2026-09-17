import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CATEGORY_ENTRIES } from "@/lib/vision/prompts";
import { ThemeStack } from "@/components/landing/theme-stack";
import { StepStack } from "@/components/landing/step-stack";
import {
  Marquee,
  Reveal,
  RisingLines,
} from "@/components/landing/motion-primitives";

export const dynamic = "force-dynamic";

/* Read off the model's own vocabulary rather than typed out here, so the page
   cannot drift from what the classifier actually knows. */
const GARMENTS = CATEGORY_ENTRIES.map((e) => e.sub_category);

const STEPS = [
  {
    title: "Photograph what you own",
    body: "Drop in a folder or shoot straight from the camera. Add twenty pieces in one pass and tag them afterwards, not between shots.",
  },
  {
    title: "Confirm what it found",
    body: "The model names the garment, its sleeves, its weight and its colour, then works out the seasons. Every field is yours to correct, and it admits when it cannot tell.",
  },
  {
    title: "Wear the answer",
    body: "Today's temperature decides what is in play. Fixed rules do the rest, and no outfit reaches you without a top, a bottom and shoes.",
  },
];

const REFUSALS = [
  {
    title: "It will not touch your photo",
    body: "No background removal, no regeneration, no cropping. What you shot is what gets stored, creases and kitchen floor included.",
  },
  {
    title: "It will not ask a language model",
    body: "Outfits fall out of arithmetic. The same wardrobe on the same day gives the same looks, every time, for reasons you can follow.",
  },
  {
    title: "It will not upload your wardrobe",
    body: "The model comes to the photo. It downloads once, runs in your browser, and your pictures go to private storage only you can open.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/wardrobe");

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-10">
        <span className="display text-lg tracking-[0.02em]">Wardroby</span>
        <Link
          href="/login"
          className="tactile rounded-full border border-border px-4 py-2 text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 lg:px-10">
        {/* ============================================================== */}
        {/* Hero. Kinetic type against the palettes in Z space.            */}
        {/* ============================================================== */}
        <section className="grid items-center gap-16 pb-20 pt-10 sm:pt-16 lg:grid-cols-[1.06fr_0.94fr] lg:gap-10 lg:pb-28">
          <div className="lg:pr-6">
            <RisingLines
              lines={["Your closet,", "sorted by", "the weather."]}
              className="display text-[3rem] leading-[0.95] tracking-tight sm:text-[4rem] lg:text-[4.6rem]"
            />

            <Reveal
              as="p"
              delay={0.4}
              className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-muted-foreground"
            >
              Photograph what you own. Wardroby reads each piece on your device
              and builds complete outfits for today&rsquo;s forecast.
            </Reveal>

            <Reveal delay={0.5} className="mt-9 flex flex-wrap items-center gap-4">
              <Button
                asChild
                size="lg"
                className="tactile group h-12 px-6 text-[15px]"
              >
                <Link href="/signup">
                  Start my closet
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
              <span className="text-[13px] text-muted-foreground">
                Free, nothing to install.
              </span>
            </Reveal>
          </div>

          <ThemeStack />
        </section>

        {/* ============================================================== */}
        {/* Vocabulary. One marquee, carrying the real category list.      */}
        {/* ============================================================== */}
        <section className="border-t border-border py-14">
          <Reveal className="mb-7 max-w-[36ch] text-[15px] leading-relaxed text-muted-foreground">
            It knows {GARMENTS.length} kinds of garment on sight, and says so
            when the thing in front of it is not among them.
          </Reveal>
          <Marquee items={GARMENTS} />
        </section>

        {/* ============================================================== */}
        {/* Steps. They stack as you scroll, because they happen in order. */}
        {/* ============================================================== */}
        <section className="border-t border-border pt-16 sm:pt-24">
          <Reveal
            as="h2"
            className="display max-w-[16ch] text-[2rem] leading-tight tracking-tight sm:text-[2.75rem]"
          >
            From a pile on the bed to something to wear.
          </Reveal>
          <div className="mt-12">
            <StepStack steps={STEPS} />
          </div>
        </section>

        {/* ============================================================== */}
        {/* Refusals. Staggered baselines, hairlines, no containers.        */}
        {/* ============================================================== */}
        <section className="border-t border-border py-16 sm:py-24">
          <Reveal
            as="h2"
            className="display max-w-[20ch] text-[2rem] leading-tight tracking-tight sm:text-[2.75rem]"
          >
            Most of the work went into what it does not do.
          </Reveal>

          <div className="mt-14 grid gap-12 sm:gap-16 lg:grid-cols-3 lg:gap-10">
            {REFUSALS.map((item, i) => (
              <Reveal
                key={item.title}
                delay={i * 0.08}
                className="border-t border-clay-ink/30 pt-6 lg:[&:nth-child(2)]:mt-14 lg:[&:nth-child(3)]:mt-28"
              >
                <h3 className="display text-[1.35rem] leading-snug tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============================================================== */}
        {/* Close.                                                          */}
        {/* ============================================================== */}
        <section className="border-t border-border py-20 sm:py-28">
          <div className="grid gap-9 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <Reveal
              as="h2"
              className="display text-[2.3rem] leading-[1.02] tracking-tight sm:text-[3.2rem]"
            >
              Stop standing in front of an open wardrobe.
            </Reveal>
            <Reveal delay={0.1} className="lg:justify-self-end">
              <Button
                asChild
                size="lg"
                className="tactile group h-12 px-6 text-[15px]"
              >
                <Link href="/signup">
                  Start my closet
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
            </Reveal>
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
