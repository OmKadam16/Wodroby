import Link from "next/link";
import { Settings, Shirt, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLink } from "@/components/nav-link";
import { MobileTabBar } from "@/components/mobile-tab-bar";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <>
      {/* Mobile: a slim brand bar; navigation lives in the bottom tabs. */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur md:hidden">
        <div className="flex h-12 items-center justify-center px-4">
          <span className="display text-lg tracking-[0.02em]">Wardroby</span>
        </div>
      </header>

      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8 2xl:max-w-7xl">
          <Link
            href="/wardrobe"
            className="display text-lg tracking-[0.02em]"
          >
            Wardroby
          </Link>

          <nav className="flex shrink-0 items-center gap-1">
            <NavLink href="/wardrobe">
              <Shirt className="size-4" />
              Wardrobe
            </NavLink>
            <NavLink href="/outfits">
              <Sparkles className="size-4" />
              Outfits
            </NavLink>
            <NavLink href="/settings">
              <Settings className="size-4" />
              Settings
            </NavLink>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden max-w-[22ch] truncate text-sm text-muted-foreground lg:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <MobileTabBar />
    </>
  );
}
