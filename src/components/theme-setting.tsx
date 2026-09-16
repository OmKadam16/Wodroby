"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { readTheme, THEME_EVENT, type Theme } from "@/lib/theme";

const DESCRIPTION: Record<Theme, string> = {
  light: "Always light.",
  dark: "Always dark.",
  kitty: "Hello Kitty pastels.",
  kuromi: "Kuromi — dark and purple.",
  system: "Following your device.",
};

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function ThemeSetting() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Palette className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Theme</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {DESCRIPTION[theme]}
          </p>
        </div>
      </div>

      {/* Four previews need the full width, so they sit below the label at
          every size rather than squeezing into the row. */}
      <div className="mt-4">
        <ThemeToggle />
      </div>
    </section>
  );
}
