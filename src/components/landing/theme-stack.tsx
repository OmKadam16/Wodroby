"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

/**
 * The hero's visual: the four palettes as physical cards in Z space, tilting
 * under the pointer.
 *
 * It is a preview of something real rather than a mock of something that does
 * not exist. These are the actual theme values, the same ones the picker shows
 * after signup, so the hero is showing the product instead of illustrating it.
 *
 * Pointer position lives in motion values, never in React state. State here
 * would re-render this subtree on every pointer frame and fall over on a phone;
 * motion values write straight to the transform outside the render cycle.
 */

/* `ink` is the label colour, picked for contrast against that card's own
   `panel` rather than derived from `canvas`. Deriving it looked tidy and gave
   white on white for Light, near-black on near-black for Dark, and white on
   pink for Hello Kitty: three unreadable labels out of four. */
const CARDS = [
  {
    label: "Kuromi",
    canvas: "#514283",
    panel: "#e1ddf4",
    accent: "#cac5ed",
    ink: "#2b2350",
  },
  {
    label: "Hello Kitty",
    canvas: "#ffffff",
    panel: "#f5b8d0",
    accent: "#ffc72c",
    ink: "#6b2740",
  },
  {
    label: "Dark",
    canvas: "#14120f",
    panel: "#1e1b17",
    accent: "#e0703f",
    ink: "#e6e0d6",
  },
  {
    label: "Light",
    canvas: "#fbf8f3",
    panel: "#ffffff",
    accent: "#c0512c",
    ink: "#171412",
  },
];

const SPRING = { stiffness: 110, damping: 18, mass: 0.6 };

export function ThemeStack() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // -0.5 to 0.5 across the element, both axes.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-16, 16]), SPRING);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [12, -12]), SPRING);

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

  // Under reduced motion the stack still reads as a stack, it simply holds
  // still: the depth is layout, only the reaction to the pointer is motion.
  const interactive = !reduce;

  return (
    <div
      ref={ref}
      onPointerMove={interactive ? onMove : undefined}
      onPointerLeave={interactive ? onLeave : undefined}
      className="relative mx-auto w-full max-w-[22rem] select-none sm:max-w-[26rem]"
      style={{ perspective: 1200 }}
      aria-hidden
    >
      <motion.div
        style={{
          rotateX: interactive ? rotateX : 0,
          rotateY: interactive ? rotateY : 0,
          transformStyle: "preserve-3d",
        }}
        className="relative aspect-[4/5]"
      >
        {CARDS.map((card, i) => {
          // Each card sits further forward and lower than the one behind it.
          const depth = (CARDS.length - 1 - i) * 56;
          return (
            <motion.div
              key={card.label}
              initial={reduce ? false : { opacity: 0, y: 40, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{
                delay: 0.15 + i * 0.09,
                duration: 0.8,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="absolute inset-x-0 overflow-hidden rounded-[1.75rem]"
              style={{
                background: card.canvas,
                top: `${i * 13}%`,
                height: "58%",
                transform: `translateZ(${depth}px)`,
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
                className="absolute left-5 top-5 block h-7 w-[46%] rounded-lg"
                style={{ background: card.panel }}
              />
              <span
                className="absolute right-5 top-5 flex h-7 items-center gap-2 rounded-full pl-1 pr-3"
                style={{ background: card.panel }}
              >
                <span
                  className="block size-5 rounded-full"
                  style={{ background: card.accent }}
                />
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
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
