"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormMessage } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Supabase won't send another email to the same address within a minute. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * "Enter the code we emailed you." Used after signing up, and when someone
 * who never confirmed tries to sign in.
 *
 * A code rather than a link: it works on whichever device reads the email,
 * and doesn't depend on the browser that signed up still holding a cookie.
 *
 * Supabase's codes are 6 digits by default and can be set up to 10 under
 * Authentication -> Emails, so any 6-10 digits are accepted here.
 */
export function CodeEntry({
  sentTo,
  onVerify,
  onResend,
  onBack,
}: {
  /** Shown as "We sent a code to …" — a full address or a masked hint. */
  sentTo: string;
  /** Resolves to an error message, or null once signed in. */
  onVerify: (code: string) => Promise<string | null>;
  /** Resolves to an error message, or null once a new code is on its way. */
  onResend: () => Promise<string | null>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Counts down from the moment this screen opens, because a code was just sent.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 10) {
      setError("Enter the code from the email. It's 6 digits.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const problem = await onVerify(digits).catch(() => "Something went wrong. Try again.");
    // On success the page is already navigating away; leave the button busy.
    if (problem) {
      setError(problem);
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const problem = await onResend().catch(() => "Couldn't send a new code. Try again.");
    if (problem) setError(problem);
    else setNotice("A new code is on its way. Only the newest code works.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        We sent a code to <span className="font-medium text-foreground">{sentTo}</span>.
        Enter it to confirm your email. It can take a minute to arrive, so check your spam folder too.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          autoFocus
          required
          className="text-lg tracking-[0.3em] sm:text-lg"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <FormMessage error={error} notice={notice} />

      <Button type="submit" disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" />}
        Confirm
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground underline underline-offset-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="font-medium underline underline-offset-2 disabled:no-underline disabled:opacity-60"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
