"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Route-segment error boundary.
 *
 * Wraps everything under the root layout except the layout itself — a render
 * crash anywhere in the app shows this instead of a blank white screen or
 * Next's default stack trace. `unstable_retry` re-fetches and re-renders the
 * boundary's children without a full page reload; `reset` was the pre-16.2
 * name for a narrower version of the same idea.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // console.error keeps a trace in Vercel's function logs even if Sentry
    // itself is misconfigured; Sentry.captureException is what actually
    // pages someone instead of waiting for a tester to report it.
    console.error("[error boundary]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-[420px] text-center">
        <AlertTriangle
          className="size-6 mx-auto text-muted-foreground mb-4"
          strokeWidth={1.5}
        />
        <h1 className="text-[18px] font-medium tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2.5 text-[13.5px] text-muted-foreground leading-relaxed">
          That's on us, not you. Try again, or head back to the dashboard —
          nothing you were working on should be lost.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => unstable_retry()}
            className="h-9 text-[13px]"
          >
            Try again
          </Button>
          <Button asChild className="h-9 text-[13px]">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
