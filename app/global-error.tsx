"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root-layout error boundary — catches a crash in the layout itself (a
 * provider throwing, a font/theme failure), which `app/error.tsx` can't:
 * that one wraps everything *under* the layout, not the layout.
 *
 * This replaces the entire document, `<html>`/`<body>` included, so it can't
 * lean on globals.css, Tailwind, or any component that assumes the app's own
 * providers are alive — the whole point is that they might not be. Inline
 * styles only, on purpose.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
          // The ground, ink, muted ink and border tokens from globals.css.
          background: "#fdfefb",
          color: "#1c1913",
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.03em", margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "#65625b",
              margin: "0 0 24px",
            }}
          >
            The app hit a problem it couldn&rsquo;t recover from on its own.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 4.8,
              border: "1px solid #ededed",
              background: "#ffffff",
              color: "#1c1913",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
