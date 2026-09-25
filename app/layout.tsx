import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DM_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

/**
 * Every face here is self-hosted and served from our own origin with the
 * rest of the build's static assets: no font CDN at runtime, nothing a
 * crawler or a strict CSP has to reach elsewhere for. next/font generates a
 * metric-matched fallback (`size-adjust` and friends on a local Arial), so
 * text is readable immediately (`swap`) and barely moves when the real face
 * lands.
 */

/**
 * General Sans (Indian Type Foundry, via Fontshare): every role, headings
 * included. Only the styles the app uses ship, converted from the supplied
 * OpenType files to WOFF2 (see app/fonts/general-sans/README.md). There is
 * no 700: nothing asks for it, and bold falls to the 600.
 */
const generalSans = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/general-sans/GeneralSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/general-sans/GeneralSans-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/general-sans/GeneralSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/general-sans/GeneralSans-Semibold.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
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
    { media: "(prefers-color-scheme: light)", color: "#fdfefb" },
    { media: "(prefers-color-scheme: dark)", color: "#13120f" },
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
      className={`${generalSans.variable} ${dmMono.variable} h-full antialiased`}
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
