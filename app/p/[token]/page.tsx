import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { ViewTracker } from "@/app/p/[token]/tracker";
import { coerceTheme, DEFAULT_THEME, themeVars } from "@/lib/proposal-theme";
import { toProposalData } from "@/lib/proposal-data";

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
      "id, proposal_data, share_expires_at, templates(design), deals(client_name, client_company), profiles(full_name, email)"
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

  const template = data.templates as unknown as { design: unknown } | null;
  const theme = template ? coerceTheme(template.design) : DEFAULT_THEME;

  return (
    // The template paints the whole page, not just the article. A themed
    // document floating on the app's own background would read as a widget
    // embedded in someone else's product — the opposite of the point.
    <div
      style={themeVars(theme)}
      className="min-h-screen bg-[var(--p-paper)] text-[color:var(--p-ink)]"
    >
      <ViewTracker token={token} />

      <main className="mx-auto max-w-[760px] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-16 md:py-24">
        <ProposalDocument
          data={toProposalData(data.proposal_data)}
          theme={theme}
          readOnly
          clientName={deal?.client_name}
          clientCompany={deal?.client_company}
          authorName={author?.full_name ?? author?.email}
        />

        <footer className="mt-12 pt-6 border-t border-[var(--p-rule)] flex flex-col items-start gap-3 sm:mt-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pt-8">
          <p className="text-[12.5px] text-[color:var(--p-muted)]">
            Questions? Just reply to the email this came from.
          </p>
          {/* Deliberately quiet — same muted color as the page, no logo, no
              brand accent. The point is findable, not promoted. */}
          <a
            href="/"
            className="text-[11px] text-[color:var(--p-muted)]/70 hover:text-[color:var(--p-muted)] transition-colors shrink-0"
          >
            Proposal built with Closingly
          </a>
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
