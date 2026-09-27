/**
 * What a username may be: 3-20 characters, starting with a letter, then
 * letters, digits or underscores. Compared lowercase, so "Om_Kadam" and
 * "om_kadam" are the same name.
 *
 * Mirrors profiles_username_format_check in
 * supabase/migrations/0012_usernames.sql. Change one, change the other.
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Null when the name is fine, otherwise what to fix, in plain words. */
export function usernameProblem(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < 3) return "Usernames are at least 3 characters.";
  if (name.length > 20) return "Usernames are at most 20 characters.";
  if (!/^[a-z]/.test(name)) return "Start your username with a letter.";
  if (!USERNAME_PATTERN.test(name)) {
    return "Use only letters, numbers and underscores.";
  }
  return null;
}
