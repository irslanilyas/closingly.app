"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [id, setId] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setId(data.user?.id ?? "");
    });
  }, []);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <AppShellClient>
      <PageHeader eyebrow="Settings" title="Account" />
      <div className="max-w-[540px] space-y-5">
        <Row label="Email" value={email} />
        <Row label="User ID" value={id} mono />
        <div className="pt-4">
          <Button
            onClick={onLogout}
            variant="outline"
            className="h-9 text-[12.5px]"
          >
            Sign out
          </Button>
        </div>
      </div>
    </AppShellClient>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-3 border-b border-border">
      <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
        {label}
      </div>
      <div className={`text-[13px] ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}
