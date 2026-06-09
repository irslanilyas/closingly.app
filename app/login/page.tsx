"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-[420px]">
        <div className="mb-12">
          <div className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
            RevOps Builder
          </div>
          <h1 className="text-[28px] font-medium tracking-tight leading-tight">
            Sign in to your workbench
          </h1>
          <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
            We&apos;ll email you a magic link. No password required.
          </p>
        </div>

        {sent ? (
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
                setSent(false);
                setEmail("");
              }}
              className="mt-4 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[12.5px] font-medium">
                Email
              </Label>
              <Input
                id="email"
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
              disabled={sending || !email}
              className="w-full h-10 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90"
            >
              {sending ? "Sending link…" : "Send magic link"}
            </Button>
            <p className="text-[12px] text-muted-foreground text-center">
              Access restricted to whitelisted emails.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
