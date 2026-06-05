import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Topbar } from "./topbar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar email={user.email ?? "unknown"} />
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
