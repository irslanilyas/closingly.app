import { createAdminClient } from "@/lib/supabase/admin";

/** Set by /api/demo/reset, read once by the auth callback. */
export const DEMO_RESET_COOKIE = "closingly_demo_reset";

/**
 * Sends the signed-in user back through setup.
 *
 * Only the completion flag is cleared. The versioned workspace records stay
 * where they are, and finishing the wizard again writes a new version rather
 * than overwriting the old one, so a demo run never destroys real answers.
 */
export async function replayOnboarding(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: null })
    .eq("id", userId);

  if (error) throw new Error(`Failed to reset onboarding: ${error.message}`);
}
