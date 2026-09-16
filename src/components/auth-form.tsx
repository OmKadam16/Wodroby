"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  /*
   * Where a brand-new account goes: one screen to pick a theme, then on to
   * wherever they were headed. Only the two paths below that actually create
   * an account use this. Signing in — including the fallback further down,
   * where the email turns out to be registered already — goes straight to
   * `next`, because that person chose a theme when they signed up.
   *
   * Every destination here is reached with a full page load rather than a
   * client navigation, as the sign-in paths already were. The session cookie
   * has just been written, and the server components that read it — the nav,
   * and the pages themselves — have to render against the signed-in state,
   * not the signed-out tree this component is currently part of.
   */
  const afterSignup = `/welcome?next=${encodeURIComponent(next)}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) {
          const msg = error.message.toLowerCase();
          if (
            msg.includes("already registered") ||
            msg.includes("already exists") ||
            msg.includes("user already")
          ) {
            const { data: signInData, error: signInError } =
              await supabase.auth.signInWithPassword({
                email: trimmedEmail,
                password,
              });
            if (signInError) {
              setError(
                "That email is already registered. Sign in instead — if the password doesn't match, use password reset in Supabase.",
              );
              setPending(false);
              return;
            }
            if (signInData.session) {
              window.location.assign(next);
              return;
            }
          } else {
            setError(error.message);
            setPending(false);
            return;
          }
        } else if (data.session) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see afterSignup above
          window.location.assign(afterSignup);
          return;
        } else if (data.user) {
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            });
          if (!signInError && signInData.session) {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see afterSignup above
            window.location.assign(afterSignup);
            return;
          }
          setNotice(
            "Account created but no session came back. Email confirmation may be on — check your inbox, then sign in.",
          );
          setPending(false);
          return;
        }
        setError("Sign up failed. Please try again.");
        setPending(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      if (!data.session) {
        setError("Could not create session. Try again.");
        setPending(false);
        return;
      }
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="display text-xl tracking-[0.02em]">Wardroby</span>
      </div>

      <h1 className="display text-[32px] leading-none">
        {mode === "signup" ? "Create your closet" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "signup"
          ? "Photograph your clothes once, get outfits for any forecast."
          : "Sign in to your digital wardrobe."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm rounded-lg border border-border bg-muted p-3 text-muted-foreground">{notice}</p>}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending && <Loader2 className="animate-spin" />}
          {mode === "signup" ? "Sign up" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline"
            >
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
