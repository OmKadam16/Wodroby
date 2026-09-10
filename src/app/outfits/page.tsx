import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OutfitGenerator } from "@/components/outfits/outfit-generator";

export const dynamic = "force-dynamic";

export default async function OutfitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Outfit inspirations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weather-aware combinations drawn from what you actually own.
        </p>
      </div>

      <OutfitGenerator />
    </main>
  );
}
