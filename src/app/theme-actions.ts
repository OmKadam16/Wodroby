"use server";

import { createClient } from "@/lib/supabase/server";
import { isTheme, type Theme } from "@/lib/theme";

/**
 * Saves the choice to the account. Signed out is not an error — the landing
 * page and login screen still let you try a theme, it just stays on that
 * device until there is an account to keep it.
 */
export async function saveAccountTheme(
  theme: Theme,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isTheme(theme)) return { ok: false, error: "Unknown theme." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update({ theme })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
