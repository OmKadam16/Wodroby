"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";

/**
 * The one step between signing up and the app: pick a palette.
 *
 * `ThemeToggle` writes straight to localStorage and stamps `data-theme` on
 * <html>, so every tap repaints this page in the chosen theme — the preview
 * is the page itself, which is why there is no separate confirm step and no
 * state to carry forward. Continue is a plain link to wherever the person was
 * originally headed.
 */
export function ThemePicker() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="display text-xl tracking-[0.02em]">Wardroby</span>
      </div>

      <h1 className="display text-[32px] leading-none">Pick your look</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tap one to try it — the page changes as you go.
      </p>

      <div className="mt-8">
        {/* Three across at most: this column is narrow, and the labels have to
            stay readable rather than truncate. */}
        <ThemeToggle columns="grid-cols-2 sm:grid-cols-3" />
      </div>

      <Button asChild className="mt-8">
        <Link href={next}>Start my closet</Link>
      </Button>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        You can change this any time in Settings.
      </p>
    </div>
  );
}
