import Link from "next/link";

/** The frame both auth pages share: wordmark, heading, form, switch link. */
export function AuthShell({
  title,
  subtitle,
  children,
  switchPrompt,
  switchLabel,
  switchHref,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  switchPrompt: string;
  switchLabel: string;
  switchHref: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="display text-xl tracking-[0.02em]">Wardroby</span>
      </div>

      <h1 className="display text-[32px] leading-none">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      {children}

      <p className="mt-6 text-sm text-muted-foreground">
        {switchPrompt}{" "}
        <Link href={switchHref} className="font-medium text-foreground underline">
          {switchLabel}
        </Link>
      </p>
    </div>
  );
}

export function FormMessage({ error, notice }: { error: string | null; notice?: string | null }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm rounded-lg border border-border bg-muted p-3 text-muted-foreground">
          {notice}
        </p>
      )}
    </>
  );
}
