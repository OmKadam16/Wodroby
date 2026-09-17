/**
 * Line-drawn garments for the hero composition.
 *
 * Drawn rather than photographed for two reasons. The content security policy
 * allows images only from this origin and the user's own storage, so stock
 * photography could not load even if it belonged here — and a landing page for
 * a wardrobe app showing someone else's clothes would be a strange first
 * impression. These inherit `currentColor`, so they carry every theme.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-full" {...stroke}>
      {children}
    </svg>
  );
}

export function TeeMark() {
  return (
    <Frame>
      <path d="M18 9 9 13l3 7 4-1.5V39h16V18.5l4 1.5 3-7-9-4" />
      <path d="M18 9c0 3 2.7 4.5 6 4.5S30 12 30 9" />
    </Frame>
  );
}

export function TrousersMark() {
  return (
    <Frame>
      <path d="M16 8h16l1.5 31h-7L24 22l-2.5 17h-7z" />
      <path d="M16 14h16" />
    </Frame>
  );
}

export function ShoeMark() {
  return (
    <Frame>
      <path d="M8 31v-8h6l5 4 7 1 9 3.5c2 .8 3 2 3 3.5v2H8z" />
      <path d="M14 23l3 4M8 37h30" />
    </Frame>
  );
}

export function JacketMark() {
  return (
    <Frame>
      <path d="M19 9 10 13v26h28V13l-9-4" />
      <path d="M19 9l5 8 5-8M24 17v22" />
    </Frame>
  );
}
