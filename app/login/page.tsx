"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const onSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep("otp");
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setBusy(false);
    if (error) {
      toast.error("Invalid or expired code. Try requesting a new one.");
      return;
    }
    router.push("/");
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
            {step === "email"
              ? "Enter your email and we'll send a 6-digit code."
              : `Enter the code we sent to ${email}.`}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={onSendCode} className="space-y-5">
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
              disabled={busy || !email}
              className="w-full h-10 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90"
            >
              {busy ? "Sending…" : "Send code"}
            </Button>
            <p className="text-[12px] text-muted-foreground text-center">
              Access restricted to whitelisted emails.
            </p>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-[12.5px] font-medium">
                Sign-in code
              </Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="12345678"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                className="h-10 tracking-[0.3em] text-center text-[18px]"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full h-10 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90"
            >
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); }}
              className="w-full text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
