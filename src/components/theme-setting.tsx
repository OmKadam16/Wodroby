"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { readTheme, THEME_EVENT, type Theme } from "@/lib/theme";

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
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-3 sm:contents">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Palette className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {theme === "system"
              ? "Following your device."
              : `Always ${theme}.`}
          </p>
        </div>
      </div>
      {/* Three pills need more room than a phone row has, so they drop below
          the label on mobile and sit inline from sm: up. */}
      <div className="sm:shrink-0">
        <ThemeToggle />
      </div>
    </section>
  );
}
