import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudSun, Scan, Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Scan,
    title: "Snap it",
    body: "Bulk drop or use your camera — take many photos, tap Done, then tag them yourself.",
  },
  {
    icon: Shirt,
    title: "Tag manually",
    body: "For each photo pick the season — Summer, Winter, Rainy or All Season — and where you will wear it. No AI, just your choices.",
  },
  {
    icon: CloudSun,
    title: "Dressed for the forecast",
    body: "Outfits are assembled by fixed rules against your local weather — no guessing, no language model.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/wardrobe");

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Wardroby
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Your closet, sorted by the weather.
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted-foreground">
        Photograph what you own — bulk upload or straight from your camera.
        Tag the season and occasion yourself and get outfits that actually suit
        the temperature outside.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/signup">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="size-5" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
