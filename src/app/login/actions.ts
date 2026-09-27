"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeUsername, USERNAME_PATTERN } from "@/lib/username";

export type SignInResult =
  | { ok: true }
  | { ok: false; error: string }
  /** Right password, email never confirmed. A code has been sent. */
  | { ok: false; needsCode: true; emailHint: string; error?: undefined };

export type ActionResult = { ok: true } | { ok: false; error: string };

/** One message for every wrong-credentials case, so the form never reveals
 *  which usernames exist. */
const WRONG = "That username and password don't match.";
const UNAVAILABLE = "Sign-in isn't available right now. Try again later.";
const BUSY = "Too many attempts. Wait a few minutes and try again.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/*
 * Why all of this runs on the server: Supabase Auth only signs in by email,
 * so the email behind a username is looked up first — and that lookup must
 * never reach a browser, or anyone could turn a username into an email
 * address. The database only answers it when LOGIN_LOOKUP_KEY comes with the
 * call, and that key lives only in this server's environment. The email is
 * used for calls to Supabase and never sent back; the code screen gets a
 * masked hint at most.
 *
 * Because every call now reaches Supabase from this server's IP, Supabase's
 * own per-IP limits cannot tell one guesser from everyone else. The limits
 * below stand in for them: per visitor IP, and per username so a single
 * account cannot be guessed at from many IPs.
 */

async function visitorIp(): Promise<string> {
  // Render puts the visitor's address first in X-Forwarded-For.
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** The email behind a username, or null. Throws when the lookup itself is broken. */
async function lookupEmail(supabase: Supabase, username: string): Promise<string | null> {
  const key = process.env.LOGIN_LOOKUP_KEY;
  if (!key) throw new Error("LOGIN_LOOKUP_KEY is not set; username sign-in cannot work.");
  const { data, error } = await supabase.rpc("login_email_for", {
    p_username: username,
    p_key: key,
  });
  if (error) throw new Error(`login_email_for failed: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

/** "om4kadam@gmail.com" -> "o••••••m@gmail.com": enough to recognise, not to reuse. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  const shown = local.length <= 2 ? local[0] : `${local[0]}${"•".repeat(local.length - 2)}${local.at(-1)}`;
  return `${shown}@${domain}`;
}

function limited(...checks: [string, number, number][]): boolean {
  return checks.some(([key, limit, windowMs]) => !rateLimit(key, limit, windowMs).ok);
}

/**
 * Signs in with a username and password. The session cookies are written by
 * the server client, so the browser is signed in once this returns ok.
 *
 * An account that never confirmed its email gets a fresh code sent instead,
 * and the form moves to the code screen. Supabase only reports "not
 * confirmed" once the password has checked out, so a stranger holding just a
 * username never reaches that branch.
 */
export async function signInWithUsername(
  rawUsername: string,
  password: string,
): Promise<SignInResult> {
  const username = normalizeUsername(String(rawUsername ?? ""));
  if (!USERNAME_PATTERN.test(username) || typeof password !== "string" || !password) {
    return { ok: false, error: WRONG };
  }

  const ip = await visitorIp();
  if (
    limited(
      [`login-ip:${ip}`, 20, 5 * 60_000],
      [`login-user:${username}`, 10, 15 * 60_000],
    )
  ) {
    return { ok: false, error: BUSY };
  }

  const supabase = await createClient();
  let email: string | null;
  try {
    email = await lookupEmail(supabase, username);
  } catch (err) {
    console.error(err);
    return { ok: false, error: UNAVAILABLE };
  }
  if (!email) return { ok: false, error: WRONG };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
      // A resend can be refused for arriving within a minute of the last one;
      // the earlier code still works then, so the code screen opens anyway.
      await supabase.auth.resend({ type: "signup", email });
      return { ok: false, needsCode: true, emailHint: maskEmail(email) };
    }
    return { ok: false, error: WRONG };
  }
  if (!data.session) return { ok: false, error: "Could not create a session. Try again." };
  return { ok: true };
}

/**
 * Confirms the email with the emailed code, which also signs them in.
 * Limited hard: a 6-digit code is a million guesses, and this is the only
 * thing standing between a username and those guesses.
 */
export async function confirmWithCode(
  rawUsername: string,
  code: string,
): Promise<ActionResult> {
  const username = normalizeUsername(String(rawUsername ?? ""));
  const token = String(code ?? "").replace(/\D/g, "");
  if (!USERNAME_PATTERN.test(username) || token.length < 6 || token.length > 10) {
    return { ok: false, error: "That code isn't right. Check the email and try again." };
  }

  const ip = await visitorIp();
  if (
    limited(
      [`confirm-ip:${ip}`, 20, 15 * 60_000],
      [`confirm-user:${username}`, 5, 15 * 60_000],
    )
  ) {
    return { ok: false, error: BUSY };
  }

  const supabase = await createClient();
  let email: string | null;
  try {
    email = await lookupEmail(supabase, username);
  } catch (err) {
    console.error(err);
    return { ok: false, error: UNAVAILABLE };
  }
  if (!email) return { ok: false, error: "That code isn't right. Check the email and try again." };

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error || !data.session) {
    return {
      ok: false,
      error:
        error?.code === "otp_expired"
          ? "That code has expired or was replaced by a newer one. Send a new code."
          : "That code isn't right. Check the email and try again.",
    };
  }
  return { ok: true };
}

/**
 * Sends another code. Takes the password too, and checks it the same way
 * sign-in does, so nobody can make the app email a stranger over and over
 * just by knowing their username.
 */
export async function resendConfirmationCode(
  rawUsername: string,
  password: string,
): Promise<ActionResult> {
  const username = normalizeUsername(String(rawUsername ?? ""));
  if (!USERNAME_PATTERN.test(username) || typeof password !== "string" || !password) {
    return { ok: false, error: WRONG };
  }
  if (limited([`resend-user:${username}`, 3, 15 * 60_000])) {
    return { ok: false, error: BUSY };
  }

  const supabase = await createClient();
  let email: string | null;
  try {
    email = await lookupEmail(supabase, username);
  } catch (err) {
    console.error(err);
    return { ok: false, error: UNAVAILABLE };
  }
  if (!email) return { ok: false, error: WRONG };

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (!signInError) return { ok: true }; // Confirmed in the meantime; signed in now.
  if (signInError.code !== "email_not_confirmed" && !/not confirmed/i.test(signInError.message)) {
    return { ok: false, error: WRONG };
  }

  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return {
      ok: false,
      error: /rate|seconds/i.test(error.message)
        ? "A code was sent a moment ago. Wait a minute before asking for another."
        : "Couldn't send a new code. Try again.",
    };
  }
  return { ok: true };
}
