export const THEMES = ["light", "dark", "kitty", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "wordroby_theme";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Private mode, or storage blocked — fall back to following the OS.
  }
  return "system";
}

/**
 * Reflect the choice on <html>. "system" removes the attribute entirely so the
 * prefers-color-scheme media query in globals.css takes over again.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function writeTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not persisting is survivable; the applied theme still holds for the session.
  }
  applyTheme(theme);
  // `storage` only fires in *other* tabs, so tell this one directly.
  window.dispatchEvent(new Event(THEME_EVENT));
}

export const THEME_EVENT = "wordroby:themechange";

/**
 * Runs before first paint, inlined into <head>, so the page never flashes the
 * wrong palette. Kept dependency-free and tiny because it blocks rendering.
 */
/** Every theme that pins an explicit palette. "system" is the absence of one. */
const EXPLICIT: Theme[] = THEMES.filter((t): t is Theme => t !== "system");

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(${JSON.stringify(EXPLICIT)}.indexOf(t)>-1){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
