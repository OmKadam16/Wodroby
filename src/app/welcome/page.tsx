import { Suspense } from "react";
import { ThemePicker } from "@/components/theme-picker";

/**
 * Shown once, immediately after signing up. Nothing links here — the signup
 * form redirects to it, and signing in goes straight to the wardrobe, because
 * a returning user has already made this choice.
 */
export default function WelcomePage() {
  return (
    <Suspense>
      <ThemePicker />
    </Suspense>
  );
}
