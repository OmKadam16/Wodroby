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
        <div className="flex h-14 items-center gap-2 px-4">
          <Shirt className="size-5" />
          <span className="font-semibold tracking-tight">Wardroby</span>
        </div>
      </header>

      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link
            href="/wardrobe"
            className="flex items-center gap-2 font-semibold"
          >
            <Shirt className="size-5" />
            Wardroby
          </Link>

          <nav className="flex items-center gap-1">
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

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <MobileTabBar />
    </>
  );
}
