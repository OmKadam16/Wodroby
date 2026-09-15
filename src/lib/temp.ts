"use client";

export type TempUnit = "F" | "C";

const KEY = "wardroby_temp_unit";
const EVENT = "wardroby_temp_unit_change";

export function getStoredUnit(): TempUnit {
  try {
    return localStorage.getItem(KEY) === "C" ? "C" : "F";
  } catch {
    return "F";
  }
}

export function setStoredUnit(unit: TempUnit) {
  try {
    localStorage.setItem(KEY, unit);
  } catch {
    // private mode — preference just won't persist
  }
  window.dispatchEvent(new CustomEvent<TempUnit>(EVENT, { detail: unit }));
}

export function onUnitChange(listener: (unit: TempUnit) => void) {
  const custom = (e: Event) => listener((e as CustomEvent<TempUnit>).detail);
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) listener(e.newValue === "C" ? "C" : "F");
  };
  window.addEventListener(EVENT, custom);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, custom);
    window.removeEventListener("storage", storage);
  };
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** Display value for a canonical °F temperature. */
export function displayTemp(tempF: number, unit: TempUnit): number {
  return unit === "C" ? Math.round(fToC(tempF)) : Math.round(tempF);
}

/**
 * Rewrites engine copy like "Rated for 68°F" into the user's unit.
 * A "within 15°F of" tolerance is a delta, so it scales by 5/9 instead
 * of going through the absolute conversion.
 */
export function displayTempText(text: string, unit: TempUnit): string {
  if (unit === "F") return text;
  return text
    .replace(/within (-?\d+)°F of/g, (_, n: string) =>
      `within ${Math.round((Number(n) * 5) / 9)}°C of`,
    )
    .replace(/(-?\d+)°F/g, (_, n: string) => `${Math.round(fToC(Number(n)))}°C`);
}
