"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Three steps that stack physically as you scroll.
 *
 * The motion is doing narrative work rather than decoration: the steps happen
 * in order, so each one holds the screen, recedes in Z, and lets the next
 * arrive over it. Reading the page performs the sequence it describes.
 *
 * Built on CSS `position: sticky` with Motion reading scroll progress, rather
 * than GSAP ScrollTrigger pinning. Sticky needs no measurement, survives
 * resize with no refresh call, and keeps one animation library in this tree.
 */

type Step = { title: string; body: string };

function Card({
  step,
  index,
  total,
}: {
  step: Step;
  index: number;
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Progress of this card travelling from its resting place to the top of the
  // viewport and out the other side.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.35]);

  const last = index === total - 1;

  return (
    <div
      ref={ref}
      className="sticky top-[12vh] sm:top-[16vh]"
      style={{ zIndex: index }}
    >
      <motion.article
        style={
          reduce || last
            ? undefined
            : { scale, y, opacity, transformOrigin: "50% 0%" }
        }
        className="rounded-[2rem] border border-border bg-card p-7 shadow-[0_28px_70px_-45px_rgb(0_0_0_/_0.5)] sm:p-10"
      >
        <span className="font-mono text-[12px] text-clay-ink">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="display mt-3 text-[1.6rem] leading-tight tracking-tight sm:text-[2.1rem]">
          {step.title}
        </h3>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
          {step.body}
        </p>
      </motion.article>
    </div>
  );
}

export function StepStack({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-6 pb-[18vh]">
      {steps.map((step, i) => (
        <Card key={step.title} step={step} index={i} total={steps.length} />
      ))}
    </div>
  );
}
