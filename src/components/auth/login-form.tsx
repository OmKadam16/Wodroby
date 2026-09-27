"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  confirmWithCode,
  resendConfirmationCode,
  signInWithUsername,
} from "@/app/login/actions";
import { CodeEntry } from "@/components/auth/code-entry";
import { AuthShell, FormMessage } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";

/**
 * Signing back in: username and password. The email is never asked for
 * here — the server looks it up (see signInWithUsername).
 *
 * Someone who signed up but never entered their code lands on the code
 * screen after a correct password, with a fresh code already sent.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const signupHref = next === "/wardrobe" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  /** Set when the account still needs its email confirmed: the masked address. */
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("confirm") === "failed"
      ? "That confirmation link didn't work. It may have expired, or been opened in a different browser from the one you signed up in. Try signing in, or sign up again for a fresh link."
      : null,
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await signInWithUsername(username, password);
      if (!result.ok) {
        if ("needsCode" in result) setCodeSentTo(result.emailHint);
        else setError(result.error);
        setPending(false);
        return;
      }
      // A full load, not a client navigation: the server components have to
      // render against the session cookie that was just written.
      window.location.assign(next);
    } catch {
      setError("Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your digital wardrobe."
      switchPrompt="No account yet?"
      switchLabel="Sign up"
      switchHref={signupHref}
    >
      {codeSentTo ? (
        <CodeEntry
          sentTo={codeSentTo}
          onVerify={async (code) => {
            const result = await confirmWithCode(username, code);
            if (!result.ok) return result.error;
            window.location.assign(next);
            return null;
          }}
          onResend={async () => {
            const result = await resendConfirmationCode(username, password);
            return result.ok ? null : result.error;
          }}
          onBack={() => setCodeSentTo(null)}
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <FormMessage error={error} />

        <Button type="submit" disabled={pending} className="mt-2">
          {pending && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>
      )}
    </AuthShell>
  );
}
