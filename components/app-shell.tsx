import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShellFrame } from "./shell/shell-frame";

/**
 * Server shell. Resolves the session once on the server so a signed-out
 * request is redirected before any markup ships, rather than flashing an
 * empty app and bouncing on the client.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ShellFrame email={user.email ?? "unknown"}>{children}</ShellFrame>;
}
