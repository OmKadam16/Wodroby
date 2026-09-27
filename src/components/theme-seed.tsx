"use client";

import { useEffect } from "react";
import { saveAccountTheme } from "@/app/theme-actions";
import { readTheme } from "@/lib/theme";

/**
 * Gives an account its first theme from the device it is opened on.
 *
 * Rendered only while signed in to an account with no saved theme — everyone
 * who picked a theme before themes were saved per account. Without it they
 * would keep seeing different palettes until they happened to pick again.
 * "System" is never sent: it is also what a device shows when nothing was
 * ever chosen, so it would let an untouched phone overrule a deliberate
 * choice on the laptop. The first device with a real choice decides.
 */
export function ThemeSeed() {
  useEffect(() => {
    const theme = readTheme();
    if (theme !== "system") void saveAccountTheme(theme).catch(() => {});
  }, []);
  return null;
}
