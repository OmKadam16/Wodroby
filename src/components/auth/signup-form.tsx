"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, FormMessage } from "@/components/auth/auth-shell";
import { CodeEntry } from "@/components/auth/code-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";
import { normalizeUsername, usernameProblem } from "@/lib/username";

/**
 * New passwords only. Sign-in accepts whatever the account already has, so
 * anyone who signed up under the old 6-character minimum can still get in.
 * Keep in step with Supabase -> Authentication -> Providers -> Email ->
 * Minimum password length, which is what actually enforces it.
 */
const MIN_NEW_PASSWORD = 8;

type NameCheck = "idle" | "checking" | "free" | "taken";

/**
 * Creating an account: username, email and password. The email is only
 * needed here — it is where the confirmation code goes — and signing back in
 * uses the username.
 *
 * With "Confirm email" on, signUp returns no session; the form moves to the
 * code screen, and the account is confirmed and signed in once the emailed
 * code checks out. The code step runs in the browser: this person typed the
 * email themselves, so there is nothing to hide from them.
 */
export function SignupForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const loginHref = next === "/wardrobe" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  /*
   * Where a brand-new account goes: one screen to pick a theme, then on to
   * wherever they were headed. Reached with a full page load, because the
   * session cookie has just been written and the server components have to
   * render against it.
   */
  const afterSignup = `/welcome?next=${encodeURIComponent(next)}`;

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameCheck, setNameCheck] = useState<NameCheck>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the account exists and is waiting for its code. */
  const [codeFor, setCodeFor] = useState<string | null>(null);

  /** Yes or no only; the database never says whose a name is. */
  async function isFree(name: string): Promise<boolean> {
    const { data, error } = await createClient().rpc("username_available", {
      p_username: name,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async function checkName() {
    const name = normalizeUsername(username);
    if (usernameProblem(name)) {
      setNameCheck("idle");
      return;
    }
    setNameCheck("checking");
    try {
      setNameCheck((await isFree(name)) ? "free" : "taken");
    } catch {
      setNameCheck("idle");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const name = normalizeUsername(username);
    const problem = usernameProblem(name);
    if (problem) return setError(problem);
    if (password.length < MIN_NEW_PASSWORD) {
      return setError(`Use at least ${MIN_NEW_PASSWORD} characters for your password.`);
    }

    setPending(true);
    try {
      if (!(await isFree(name))) {
        setNameCheck("taken");
        setError("That username is taken. Try another.");
        setPending(false);
        return;
      }

      const { data, error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Read by the handle_new_user trigger into profiles.username.
          data: { username: name },
          // Only matters if the confirmation email carries a link as well as
          // the code: /auth/confirm signs them in from that link instead.
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(afterSignup)}`,
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          setError("That email already has an account. Sign in with your username instead.");
        } else if (msg.includes("database error saving new user")) {
          // The unique index caught someone claiming the name a moment ago.
          setNameCheck("taken");
          setError("That username was just taken. Try another.");
        } else {
          setError(error.message);
        }
        setPending(false);
        return;
      }

      if (data.session) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see afterSignup above
        window.location.assign(afterSignup);
        return;
      }

      // No session: the account is waiting for its code. (Supabase answers
      // the same way for an email that is already registered, so as not to
      // reveal it; that person gets no code and should sign in instead.)
      setCodeFor(email.trim());
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your closet"
      subtitle="Photograph your clothes once, get outfits for any forecast."
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchHref={loginHref}
    >
      {codeFor ? (
        <CodeEntry
          sentTo={codeFor}
          onVerify={async (code) => {
            const { data, error } = await createClient().auth.verifyOtp({
              email: codeFor,
              token: code,
              type: "signup",
            });
            if (error || !data.session) {
              return error?.code === "otp_expired"
                ? "That code has expired or was replaced by a newer one. Send a new code."
                : "That code isn't right. Check the email and try again.";
            }
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see afterSignup above
            window.location.assign(afterSignup);
            return null;
          }}
          onResend={async () => {
            const { error } = await createClient().auth.resend({ type: "signup", email: codeFor });
            if (!error) return null;
            return /rate|seconds/i.test(error.message)
              ? "A code was sent a moment ago. Wait a minute before asking for another."
              : "Couldn't send a new code. Try again.";
          }}
          onBack={() => setCodeFor(null)}
        />
      ) : (
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
            aria-describedby="username-hint"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setNameCheck("idle");
            }}
            onBlur={checkName}
          />
          <p id="username-hint" className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {nameCheck === "free" ? (
              <>
                <Check className="size-3.5" /> {normalizeUsername(username)} is free.
              </>
            ) : nameCheck === "taken" ? (
              <span className="text-destructive">That username is taken.</span>
            ) : nameCheck === "checking" ? (
              "Checking…"
            ) : (
              "3–20 letters, numbers or underscores. You'll sign in with this."
            )}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
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
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_NEW_PASSWORD}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <FormMessage error={error} />
        <p className="text-[13px] text-muted-foreground">
          We&apos;ll email you a code to confirm it&apos;s you.
        </p>

        <Button type="submit" disabled={pending} className="mt-2">
          {pending && <Loader2 className="animate-spin" />}
          Sign up
        </Button>
      </form>
      )}
    </AuthShell>
  );
}
