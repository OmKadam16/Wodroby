import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isTheme, type Theme } from "@/lib/theme";

/**
 * The signed-in account's theme. Null when signed out; `theme: null` when
 * signed in but never chosen — the one case a device may fill in.
 *
 * Read by the root layout on every server render, so a phone opened after a
 * change on the laptop paints in the new theme from its first frame. Server
 * only — it reads the session cookie — and cached for the one request.
 */
export const getAccountTheme = cache(async (): Promise<{ theme: Theme | null } | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("theme")
    .eq("id", user.id)
    .maybeSingle();
  return { theme: isTheme(data?.theme) ? data.theme : null };
});
