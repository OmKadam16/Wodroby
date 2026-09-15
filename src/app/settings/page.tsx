import { redirect } from "next/navigation";
import { Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="display text-[32px] leading-none sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <section className="flex gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Shirt className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">How it works</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You tag each piece. Outfits are built from the weather — no AI.
            </p>
          </div>
        </section>

        <SignOutButton variant="outline" size="default" />
      </div>
    </main>
  );
}
