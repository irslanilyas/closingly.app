"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [submitting, setSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handlePasswordLogin = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password || submitting) return;

      setSubmitting(true);
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Signed in successfully!");
        router.push("/");
        router.refresh();
      } catch (err) {
        console.error("Login error:", err);
        toast.error("Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, submitting, router]
  );

  const handleMagicLink = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const trimmedEmail = email.trim();
      if (!trimmedEmail || submitting) return;

      setSubmitting(true);
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          },
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        setMagicSent(true);
      } catch (err) {
        console.error("Magic link error:", err);
        toast.error("Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-8">
          <div className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
            RevOps Builder
          </div>
          <h1 className="text-[28px] font-medium tracking-tight leading-tight">
            Sign in to your workbench
          </h1>
          <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
            {mode === "password"
              ? "Enter your email and password to sign in."
              : "We'll email you a magic link. No password required."}
          </p>
        </div>

        {magicSent ? (
          <div className="rounded-md border border-border bg-card p-6">
            <div className="text-[13px] font-medium mb-2">Check your inbox</div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              A sign-in link was sent to{" "}
              <span className="text-foreground">{email}</span>. Open it on this
              device to continue.
            </p>
            <button
              type="button"
              onClick={() => {
                setMagicSent(false);
                setEmail("");
              }}
              className="mt-4 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : mode === "password" ? (
          <form
            onSubmit={handlePasswordLogin}
            action="javascript:void(0)"
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[12.5px] font-medium">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[12.5px] font-medium">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full h-10 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>

            <div className="flex items-center justify-between text-[12.5px] pt-2">
              <button
                type="button"
                onClick={() => setMode("magic")}
                className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Sign in with Magic Link instead
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleMagicLink}
            action="javascript:void(0)"
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email-magic" className="text-[12.5px] font-medium">
                Email
              </Label>
              <Input
                id="email-magic"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !email}
              className="w-full h-10 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
            >
              {submitting ? "Sending link…" : "Send magic link"}
            </Button>

            <div className="flex items-center justify-between text-[12.5px] pt-2">
              <button
                type="button"
                onClick={() => setMode("password")}
                className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Sign in with Password instead
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
