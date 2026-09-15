import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddItemDialog } from "@/components/wardrobe/add-item-dialog";
import { WardrobeGrid } from "@/components/wardrobe/wardrobe-grid";
import { withSignedUrls } from "@/lib/storage";
import type { WardrobeItem } from "@/types/wardrobe";

export const dynamic = "force-dynamic";

export default async function WardrobePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // The bucket is private: each photo gets a short-lived signed link.
  const items = await withSignedUrls(supabase, (data ?? []) as WardrobeItem[]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 2xl:max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="display text-[32px] leading-none sm:text-4xl">
            Wardrobe
          </h1>
        </div>
        <AddItemDialog />
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive">
          Couldn&apos;t load your wardrobe. {error.message}
        </p>
      )}

      <WardrobeGrid items={items} />
    </main>
  );
}
