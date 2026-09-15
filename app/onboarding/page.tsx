import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const dynamic = "force-dynamic";

/**
 * Setup lives outside the app shell on purpose: there is nothing to navigate
 * to yet, and a rail full of empty destinations is a worse first impression
 * than a single question at a time.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, google_tokens")
    .eq("id", user.id)
    .maybeSingle();

  // Already set up. Re-running onboarding is a settings action, not a URL.
  if (profile?.onboarding_completed_at) redirect("/");

  return <OnboardingWizard calendarConnected={!!profile?.google_tokens} />;
}
