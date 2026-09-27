import { saveAccountTheme } from "@/app/theme-actions";
import { writeTheme, type Theme } from "@/lib/theme";

/**
 * What a tap on a theme does, wherever the picker is.
 *
 * The device repaints at once from localStorage; the account is told in the
 * background so every other device follows on its next load. A failed save
 * is not shown: the theme is already on screen here, and the worst case is
 * another device staying on the old one until the next change.
 */
export function chooseTheme(theme: Theme) {
  writeTheme(theme);
  void saveAccountTheme(theme).catch(() => {});
}
