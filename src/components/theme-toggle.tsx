"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { readTheme, writeTheme, THEME_EVENT, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/* Swatch colours are written as literals, not tokens: each preview has to show
   its own palette while a different theme is active. Keep these in step with
   the blocks in globals.css. */
type Swatch = { canvas: string; card: string; accent: string };

const OPTIONS: { value: Theme; label: string; swatch: Swatch; split?: Swatch }[] =
  [
    {
      value: "light",
      label: "Light",
      swatch: { canvas: "#fbf8f3", card: "#ffffff", accent: "#c0512c" },
    },
    {
      value: "dark",
      label: "Dark",
      swatch: { canvas: "#14120f", card: "#1e1b17", accent: "#e0703f" },
    },
    {
      value: "kitty",
      label: "Hello Kitty",
      swatch: { canvas: "#faf3b4", card: "#e6a8c6", accent: "#c9b5e3" },
    },
    {
      value: "system",
      label: "System",
      swatch: { canvas: "#fbf8f3", card: "#ffffff", accent: "#c0512c" },
      split: { canvas: "#14120f", card: "#1e1b17", accent: "#e0703f" },
    },
  ];

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function Preview({ swatch, split }: { swatch: Swatch; split?: Swatch }) {
  return (
    <span
      aria-hidden
      className="relative block h-12 w-full overflow-hidden rounded-lg border border-black/10"
      style={{ background: swatch.canvas }}
    >
      <span
        className="absolute left-1.5 top-1.5 block h-5 w-[60%] rounded"
        style={{ background: swatch.card }}
      />
      <span
        className="absolute bottom-1.5 left-1.5 block size-3 rounded-full"
        style={{ background: swatch.accent }}
      />
      {/* "System" shows both halves, because it is whichever the OS picks. */}
      {split && (
        <span
          className="absolute inset-y-0 right-0 block w-1/2 border-l border-black/10"
          style={{ background: split.canvas }}
        >
          <span
            className="absolute right-1.5 top-1.5 block h-5 w-[70%] rounded"
            style={{ background: split.card }}
          />
          <span
            className="absolute bottom-1.5 right-1.5 block size-3 rounded-full"
            style={{ background: split.accent }}
          />
        </span>
      )}
    </span>
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
    >
      {OPTIONS.map(({ value, label, swatch, split }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => writeTheme(value)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              active
                ? "border-primary ring-2 ring-primary"
                : "border-border hover:bg-accent",
            )}
          >
            <Preview swatch={swatch} split={split} />
            <span className="flex items-center gap-1 px-0.5 text-[13px] font-medium">
              {/* Selection is shown by the ring AND a tick, so it never rests
                  on colour alone. */}
              {active && <Check className="size-3.5 shrink-0" />}
              <span className="truncate">{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
