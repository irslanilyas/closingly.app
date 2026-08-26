/**
 * Shown when a share token doesn't resolve — the link was revoked, mistyped,
 * or never existed. This page is opened by the recipient (a prospect), not
 * the user, so it stays calm and branded rather than dumping them on Next's
 * bare default 404.
 *
 * Mirrors the tone of the <Expired /> state in [token]/page.tsx so the two
 * "link isn't usable" cases read as the same product, not two different bugs.
 */
export default function ShareNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-[420px] text-center">
        <h1 className="text-[20px] font-medium tracking-tight">
          This link isn&rsquo;t available
        </h1>
        <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
          It may have been turned off, or the address might be off by a
          character. Ask whoever sent it to share a fresh link.
        </p>
      </div>
    </div>
  );
}
