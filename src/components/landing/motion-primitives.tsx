"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Entrance for anything that should arrive as it reaches the viewport.
 *
 * `once: true` matters: a reveal that replays every time you scroll past turns
 * a page into a fairground. The reveal is here to direct attention the first
 * time, and after that the content is simply there.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "h1" | "h2" | "p" | "section";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];

  return (
    <Tag
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * The headline, arriving a line at a time from behind its own baseline.
 *
 * Each line is masked by an `overflow-hidden` wrapper, so the words rise into
 * place rather than fading in flat. Splitting on lines rather than characters
 * is deliberate: per-letter animation on a serif display face reads as a
 * gimmick, and it makes the headline unreadable to a screen reader.
 */
export function RisingLines({
  lines,
  className,
}: {
  lines: string[];
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <h1 className={className}>
      {/* The whole headline as one string for assistive tech; the animated
          copy below is decorative and hidden from it. */}
      <span className="sr-only">{lines.join(" ")}</span>
      {lines.map((line, i) => (
        <span key={line} aria-hidden className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className="block"
            initial={reduce ? false : { y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 + i * 0.11, ease: EASE }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/**
 * The garment vocabulary, moving past.
 *
 * Forty-eight names is too many to read and exactly the right number to feel,
 * which is what a marquee is for. Duplicated once so the loop has something to
 * scroll into, and the copy is hidden from assistive tech so the list is not
 * announced twice.
 */
export function Marquee({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const run = [...items, ...items];

  return (
    <div
      className="relative flex overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <motion.div
        className="flex shrink-0 gap-3 pr-3"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 48, ease: "linear", repeat: Infinity }}
      >
        {run.map((item, i) => (
          <span
            key={`${item}-${i}`}
            aria-hidden={i >= items.length}
            className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-[13px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
