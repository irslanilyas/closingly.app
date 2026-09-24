"use client";

import { use } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { DealHub } from "@/components/deal/hub/deal-hub";

export default function DealPage({ params }: { params: Promise<{ deal_id: string }> }) {
  const { deal_id } = use(params);
  return (
    <AppShellClient>
      <DealHub dealId={deal_id} />
    </AppShellClient>
  );
}
