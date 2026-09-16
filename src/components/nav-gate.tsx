"use client";

import { usePathname } from "next/navigation";

/**
 * Routes that own the whole screen.
 *
 * Onboarding is one step with one decision, and it runs while the person is
 * already signed in — so the nav would render, offering three other places to
 * go before they have a wardrobe to look at.
 */
const BARE_ROUTES = ["/welcome"];

export function NavGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.includes(pathname)) return null;
  return <>{children}</>;
}
