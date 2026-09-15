"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { GOOGLE_SCOPES } from "@/lib/google/scopes";
import { Wordmark } from "@/components/shell/wordmark";

const ERROR_COPY: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in. Try again when you're ready.",
  missing_code: "Google didn't send back a sign-in code. Try again.",
  exchange_failed: "We couldn't complete sign-in. Try again.",
  auth: "Something went wrong signing you in. Try again.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const message =
    failure ??
    (errorParam ? ERROR_COPY[errorParam] ?? ERROR_COPY.auth : null);

  const signIn = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
          scopes: GOOGLE_SCOPES,
          queryParams: {
            // Without both of these Google returns no refresh token, and
            // calendar sync dies an hour after login with no visible cause.
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        setFailure(error.message);
        setSubmitting(false);
      }
      // On success the browser navigates to Google — no need to reset state.
    } catch {
      setFailure("Couldn't reach Google. Check your connection and try again.");
      setSubmitting(false);
    }
  }, [submitting]);

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8">
        <Wordmark href={null} className="mb-7" />
        <h1 className="text-[30px] sm:text-[34px] tracking-[-0.02em] leading-[1.12]">
          Sign in to your workbench
        </h1>
        <p className="mt-3.5 text-[14px] text-muted-foreground leading-relaxed text-pretty">
          Closingly reads your calendar to spot client calls, and sends follow-ups from
          your own address. Nothing is recorded unless you switch it on for a
          specific meeting.
        </p>
      </div>

      {message && (
        <div className="mb-5 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          {message}
        </div>
      )}

      <Button
        variant="brand"
        onClick={signIn}
        disabled={submitting}
        className="w-full h-11 gap-3 text-[14px]"
      >
        <GoogleMark />
        {submitting ? "Opening Google…" : "Continue with Google"}
      </Button>

      <p className="mt-5 text-[12px] text-muted-foreground leading-relaxed">
        Signing in creates your workspace. It takes about two minutes to set up.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
        transform="scale(0.5)"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        transform="scale(0.5)"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        transform="scale(0.5)"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.1 35.6 44 30.5 44 24c0-1.3-.1-2.6-.4-3.9z"
        transform="scale(0.5)"
      />
    </svg>
  );
}
