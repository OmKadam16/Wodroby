import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { safeNext } from "@/lib/safe-next";

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Where the "confirm your email" link lands.
 *
 * With email confirmation on, signUp returns no session; the session is only
 * created once this route trades the link's one-time secret for it. Two link
 * shapes are accepted:
 *
 * - `?code=` — Supabase's default template. The code only works in the same
 *   browser that signed up, because the other half of it (the PKCE verifier)
 *   is a cookie that browser holds.
 * - `?token_hash=&type=` — if the email template is changed to link here
 *   directly. Works from any device, e.g. signing up on a laptop and tapping
 *   the email on a phone.
 *
 * `next` goes through the same same-site check as the login form, so this
 * route cannot be turned into an open redirect either.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // The session cookies are collected and written onto the redirect itself,
  // for the reason given in auth/signout: cookies set through cookies() do
  // not reliably reach a brand-new redirect response.
  const cookieStore = await cookies();
  const pending: CookieToSet[] = [];
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && (type === "signup" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
  }

  const destination = failed ? new URL("/login?confirm=failed", request.url) : new URL(next, request.url);
  const response = NextResponse.redirect(destination, { status: 303 });
  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  return response;
}
