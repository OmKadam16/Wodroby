import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

async function signOut(request: Request) {
  const cookieStore = await cookies();

  // Build the redirect first so cleared cookies land on THIS response.
  // (The old code relied on `cookieStore.set` propagating to a brand-new
  // redirect response, which is unreliable — the session survived and the
  // proxy bounced /login straight back to /wardrobe, looking like logout
  // did nothing.)
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // ignore — response.cookies below is the reliable path
          }
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.signOut();

  // Belt and braces: expire any sb-* auth cookies supabase didn't name
  // (chunked .0/.1 cookies, code verifier). Deleting a non-existent
  // cookie is a no-op.
  const all = cookieStore.getAll();
  for (const { name } of all) {
    if (name.startsWith("sb-") && name.includes("-auth-")) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }

  return response;
}

export async function POST(request: Request) {
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}
