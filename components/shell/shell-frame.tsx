import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { AssistantDock } from "./assistant-dock";

/**
 * The frame every signed-in page is drawn inside: a fixed rail on the left on
 * desktop, a thumb bar along the bottom below that, a sticky bar above, and a
 * single scrolling column of work between them.
 *
 * The rail is `fixed`, so the content column is inset by its width rather than
 * sharing a flex row with it — that keeps the main column the page's own
 * scroll container and stops long tables from dragging the rail off-screen.
 * Both sides read `--rail` from globals.css: the rail is a client component
 * and this is a server component, so a shared TS constant would cross the
 * boundary and arrive here as a client-reference stub.
 *
 * Below the rail breakpoint the column is padded clear of the bottom bar and
 * the Ask button, so the last row of any list can always be scrolled into
 * reach. Side padding respects the notch in landscape.
 */
export function ShellFrame({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar email={email} />

      <div className="lg:pl-[var(--rail)]">
        <Topbar email={email} />
        <main>
          <div className="mx-auto max-w-[1180px] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 pb-[calc(var(--mobile-nav-h)+5.5rem)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-9 lg:px-8 lg:pb-12">
            {children}
          </div>
        </main>
      </div>

      <MobileNav email={email} />
      <AssistantDock />
    </div>
  );
}
