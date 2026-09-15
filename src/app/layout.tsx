import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The display serif: page titles, temperatures, outfit numbers.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Wardroby — your digital wardrobe",
  description:
    "Photograph your clothes and get weather-aware outfit suggestions.",
  appleWebApp: { capable: true, title: "Wardroby", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page paint behind the notch and home indicator; the safe-area
  // insets below keep content clear of them.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* The font variables must sit on <html>, not <body>: Tailwind's `@theme`
       emits --font-sans/--font-display on :root, and a :root declaration
       cannot read a variable defined on a descendant. */
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
      // The blocking theme script above stamps data-theme before hydration,
      // so the DOM legitimately differs from SSR HTML. React never manages
      // that attribute — ignore it during hydration instead of erroring.
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved theme before first paint, so switching pages or
            reloading never flashes the wrong palette. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Nav />
        {/* Clears the fixed bottom tab bar on mobile. */}
        <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
      </body>
    </html>
  );
}
