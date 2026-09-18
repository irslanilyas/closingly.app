import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces, DM_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

/**
 * Every face here is fetched and self-hosted at build by next/font — no CDN
 * at runtime, no flash of a platform fallback, and the CSS `size-adjust`
 * metrics are generated so the fallback occupies the same space as the real
 * face while it loads.
 */

/** Body and UI. Humanist with soft terminals — warm where Inter is neutral. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Display voice. Fraunces is an old-style serif with deliberate softness in
 * its curves, and it is the single clearest signal that this interface was
 * not assembled out of a component gallery. Used on headings only.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  // Loaded variable rather than as fixed weights: the SOFT and WONK axes are
  // where its warmth lives, and next/font rejects custom axes alongside a
  // fixed weight list. Variable also gives the whole weight range for one
  // file rather than three.
  weight: "variable",
  axes: ["SOFT", "WONK"],
  display: "swap",
});

/** Reserved for measurement: tabular figures and metadata. */
const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Closingly",
  description: "Turn client calls into priced proposals, automatically.",
};

/**
 * `viewport-fit: cover` lets the bottom bar paint behind the home indicator
 * and then pad itself clear of it, instead of the browser leaving a dead band.
 * The theme colours are the two `--background` tokens, so the browser chrome
 * on a phone reads as part of the page rather than a grey frame around it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#121517" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${fraunces.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="closingly-theme"
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster
              position="bottom-right"
              offset={{ bottom: "var(--toast-bottom)", right: "20px" }}
              mobileOffset={{
                bottom: "var(--toast-bottom)",
                left: "12px",
                right: "12px",
              }}
              toastOptions={{ className: "text-sm" }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
