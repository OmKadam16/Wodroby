"use client";

import { useRef, useSyncExternalStore } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { Check } from "lucide-react";
import { readTheme, writeTheme, THEME_EVENT, type Theme } from "@/lib/theme";

/**
 * The four palettes as physical cards, and the control that switches between
 * them.
 *
 * The hero showed these as decoration first. Making them the real switch costs
 * nothing extra and answers the question a palette swatch always raises, which
 * is what the whole thing looks like in that colour: pick one and the page you
 * are standing on repaints. The choice is written to the same key the app
 * reads, so it survives into signup and the picker there opens on it already.
 *
 * Pointer position lives in motion values, never in React state. State here
 * would re-render this subtree on every pointer frame and fall over on a phone;
 * motion values write straight to the transform outside the render cycle.
 */

type Card = {
  value: Exclude<Theme, "system">;
  label: string;
  canvas: string;
  panel: string;
  accent: string;
  /* Label colour, picked for contrast against that card's own `panel` rather
     than derived from `canvas`. Deriving it looked tidy and gave white on
     white for Light, near-black on near-black for Dark, and white on pink for
     Hello Kitty: three unreadable labels out of four. */
  ink: string;
};

const CARDS: Card[] = [
  {
    value: "kuromi",
    label: "Kuromi",
    canvas: "#514283",
    panel: "#e1ddf4",
    accent: "#cac5ed",
    ink: "#2b2350",
  },
  {
    value: "kitty",
    label: "Hello Kitty",
    canvas: "#ffffff",
    panel: "#f5b8d0",
    accent: "#ffc72c",
    ink: "#6b2740",
  },
  {
    value: "dark",
    label: "Dark",
    canvas: "#14120f",
    panel: "#1e1b17",
    accent: "#e0703f",
    ink: "#e6e0d6",
  },
  {
    value: "light",
    label: "Light",
    canvas: "#fbf8f3",
    panel: "#ffffff",
    accent: "#c0512c",
    ink: "#171412",
  },
];

const SPRING = { stiffness: 110, damping: 18, mass: 0.6 };
const SETTLE = { type: "spring" as const, stiffness: 190, damping: 24 };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function ThemeStack() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "system" as Theme,
  );

  // -0.5 to 0.5 across the element, both axes.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  /*
   * Tilt is deliberately gentle. These cards are buttons before they are
   * scenery: a steeper angle skews the labels and shrinks the far edge of the
   * stack, which is the edge holding the card you are least likely to be able
   * to hit on a phone. Enough rotation to read as depth, and no more.
   */
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-8, 8]), SPRING);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), SPRING);

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    px.set((event.clientX - box.left) / box.width - 0.5);
    py.set((event.clientY - box.top) / box.height - 0.5);
  }

  function onLeave() {
    px.set(0);
    py.set(0);
  }

  /*
   * The chosen palette comes to the front, the rest keep their order behind
   * it. On "system", which is what a first visit reads, nothing is selected
   * and the stack sits in its declared order.
   *
   * Motion's `layout` prop animates the reshuffle from the two positions, so
   * the card travels to the front rather than teleporting there.
   */
  const ordered = [
    ...CARDS.filter((c) => c.value !== theme),
    ...CARDS.filter((c) => c.value === theme),
  ];

  // Under reduced motion the stack still reads as a stack and still switches
  // themes; the depth is layout, only the reaction to a pointer is motion.
  const interactive = !reduce;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={ref}
        onPointerMove={interactive ? onMove : undefined}
        onPointerLeave={interactive ? onLeave : undefined}
        className="relative w-full max-w-[22rem] sm:max-w-[26rem]"
        style={{ perspective: 1200 }}
      >
        <motion.div
          style={{
            rotateX: interactive ? rotateX : 0,
            rotateY: interactive ? rotateY : 0,
            transformStyle: "preserve-3d",
          }}
          className="relative aspect-[4/5]"
          role="radiogroup"
          aria-label="Preview a theme"
        >
          {ordered.map((card, i) => {
            const active = card.value === theme;
            return (
              <motion.button
                key={card.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => writeTheme(card.value)}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0 } : SETTLE}
                whileHover={reduce ? undefined : { y: -8 }}
                whileTap={reduce ? undefined : { scale: 0.985 }}
                className="absolute inset-x-0 cursor-pointer overflow-hidden rounded-[1.75rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  background: card.canvas,
                  top: `${i * 15}%`,
                  height: "55%",
                  // Later cards sit further forward, so the selected one, which
                  // sorts last, is unambiguously the card on top. Given to
                  // Motion as `z` rather than a `transform` string: Motion
                  // composes the transform from its own values, and a literal
                  // transform here would be overwritten the moment hover or
                  // tap animated y or scale.
                  z: i * 22,
                  // One declaration, because an inline boxShadow replaces the
                  // utility rather than adding to it: the hairline keeps each
                  // card's edge visible whatever theme the page is in, the cast
                  // shadow separates it from the card behind.
                  boxShadow:
                    "inset 0 0 0 1px rgb(128 128 128 / 0.28), 0 26px 50px -30px rgb(0 0 0 / 0.55)",
                }}
              >
                {/* Everything identifying sits in the top band, because that is
                    the only part of a card behind another one that you can see.
                    A label on the lower half would be legible on the front card
                    and hidden on the other three. */}
                <span
                  className="absolute left-5 top-5 block h-7 w-[44%] rounded-lg"
                  style={{ background: card.panel }}
                />
                <span
                  className="absolute right-5 top-5 flex h-7 items-center gap-1.5 rounded-full pl-1 pr-3"
                  style={{ background: card.panel }}
                >
                  <span
                    className="flex size-5 items-center justify-center rounded-full"
                    style={{ background: card.accent }}
                  >
                    {active && (
                      <Check
                        className="size-3"
                        strokeWidth={3}
                        style={{ color: card.canvas }}
                      />
                    )}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: card.ink }}
                  >
                    {card.label}
                  </span>
                </span>
                <span
                  className="absolute left-5 top-[4.5rem] block h-2.5 w-[30%] rounded-full opacity-60"
                  style={{ background: card.panel }}
                />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <p className="text-[13px] text-muted-foreground">
        Tap a palette to try it on.
      </p>
    </div>
  );
}
