import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AssistantDock } from "./assistant-dock";

/**
 * The frame every signed-in page is drawn inside: a fixed rail on the left, a
 * sticky bar above, and a single scrolling column of work between them.
 *
 * The rail is `fixed`, so the content column is inset by its width rather than
 * sharing a flex row with it — that keeps the main column the page's own
 * scroll container and stops long tables from dragging the rail off-screen.
 * Both sides read `--rail` from globals.css: the rail is a client component
 * and this is a server component, so a shared TS constant would cross the
 * boundary and arrive here as a client-reference stub.
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
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
            {children}
          </div>
        </main>
      </div>

      <AssistantDock />
    </div>
  );
}
