"use client";

import { Thermometer } from "lucide-react";
import { TempUnitToggle, useTempUnit } from "@/components/temp-unit-toggle";

export function TempUnitSetting() {
  const [unit, setUnit] = useTempUnit();

  return (
    <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Thermometer className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">Temperature unit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Weather, filters and outfit notes in °{unit}.
        </p>
      </div>
      <TempUnitToggle unit={unit} onChange={setUnit} />
    </section>
  );
}
