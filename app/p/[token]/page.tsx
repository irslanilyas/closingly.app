import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { ViewTracker } from "@/app/p/[token]/tracker";
import type { ProposalData } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Public proposal page.
 *
 * No authentication — the share token is the credential. Read with the service
 * role because the viewer is a client with no Supabase session, and the query
 * is scoped by the token itself.
 */
export default async function SharedProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("proposals")
    .select(
      "id, proposal_data, share_expires_at, deals(client_name, client_company), profiles(full_name, email)"
    )
    .eq("share_token", token)
    .single();

  if (!data) notFound();

  if (data.share_expires_at && new Date(data.share_expires_at) < new Date()) {
    return <Expired />;
  }

  const deal = data.deals as unknown as {
    client_name: string | null;
    client_company: string | null;
  } | null;

  const author = data.profiles as unknown as {
    full_name: string | null;
    email: string | null;
  } | null;

  return (
    <div className="min-h-screen bg-background">
      <ViewTracker token={token} />

      <main className="mx-auto max-w-[760px] px-6 py-16 sm:py-24">
        <ProposalDocument
          data={data.proposal_data as ProposalData}
          readOnly
          clientName={deal?.client_name}
          clientCompany={deal?.client_company}
        />

        <footer className="mt-16 pt-8 border-t border-border">
          <p className="text-[12.5px] text-muted-foreground">
            Prepared by {author?.full_name ?? author?.email ?? "your consultant"}.
            Questions? Just reply to the email this came from.
          </p>
        </footer>
      </main>
    </div>
  );
}

function Expired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-[420px] text-center">
        <h1 className="text-[20px] font-medium tracking-tight">
          This link has expired
        </h1>
        <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
          Ask whoever sent it for a fresh link and they can share it again.
        </p>
      </div>
    </div>
  );
}
