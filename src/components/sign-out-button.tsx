"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  variant = "ghost",
  size = "icon",
  className,
  label = "Sign out",
}: {
  variant?: "ghost" | "outline";
  size?: "icon" | "sm" | "default";
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      // 1. Clear the browser-side session (cookies + local state).
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // fall through to the server route regardless
      }
      // 2. Hit the server route so HttpOnly chunk cookies are expired on
      //    the redirect response itself, then hard-navigate to /login.
      //    A full reload (not router.replace) guarantees the proxy sees
      //    the cleared cookies on the very next request.
      try {
        await fetch("/auth/signout", { method: "POST", redirect: "manual" });
      } catch {
        // network failure — the client signOut above already cleared lots
      }
      // Full reload (not router.push): guarantees the proxy sees the
      // cleared cookies on the very next request.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    });
  }

  const iconOnly = size === "icon";

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : size}
      title={label}
      onClick={handleClick}
      disabled={pending}
      className={cn(iconOnly ? undefined : "w-full sm:w-auto", className)}
    >
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
}
