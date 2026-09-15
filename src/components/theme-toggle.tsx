"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  readTheme,
  writeTheme,
  THEME_EVENT,
  type Theme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function subscribe(onChange: () => void) {
  // `storage` covers other tabs; the custom event covers this one.
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/* The server has no localStorage, so it always renders "system". Reading the
   real value through useSyncExternalStore (rather than setting state in an
   effect) keeps the first client render consistent and avoids a hydration
   mismatch on the selected pill. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      /* Matches TempUnitToggle: a card track with a clay selection. A
         surface-coloured pill would not work here, because in dark mode
         --surface is darker than --sunken and the selection would read as a
         recess rather than a raised choice. */
      className="inline-flex h-11 shrink-0 items-center rounded-[10px] border border-border bg-card p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => writeTheme(value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
