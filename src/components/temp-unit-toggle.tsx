"use client";

import { useEffect, useState } from "react";
import {
  getStoredUnit,
  onUnitChange,
  setStoredUnit,
  type TempUnit,
} from "@/lib/temp";
import { cn } from "@/lib/utils";

export function useTempUnit(): [TempUnit, (unit: TempUnit) => void] {
  const [unit, setUnit] = useState<TempUnit>("F");

  useEffect(() => {
    const t = setTimeout(() => setUnit(getStoredUnit()), 0);
    const off = onUnitChange(setUnit);
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);

  return [
    unit,
    (next) => {
      setUnit(next);
      setStoredUnit(next);
    },
  ];
}

export function TempUnitToggle({
  unit,
  onChange,
  className,
}: {
  unit: TempUnit;
  onChange: (unit: TempUnit) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-[10px] border border-border bg-card p-1",
        className,
      )}
    >
      {(["F", "C"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={cn(
            "flex h-full min-w-11 items-center justify-center rounded-[7px] px-3 text-[13px] font-medium transition active:scale-95",
            unit === u
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          °{u}
        </button>
      ))}
    </div>
  );
}
