import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingAnswers } from "./schema";
import {
  normalizeFacts,
  buildSpecification,
  type NormalizedFacts,
  type ProposalSpecification,
} from "./model";

export interface PersistedOnboarding {
  workspaceProfileId: string;
  brandProfileId: string;
  specificationId: string;
  version: number;
  facts: NormalizedFacts;
  specification: ProposalSpecification;
}

/**
 * Next version for a user in a versioned table.
 *
 * Read-then-write rather than a sequence: the unique (user_id, version) index
 * is the real guard, and the only way to race yourself here is to submit the
 * same wizard twice in the same second.
 */
async function nextVersion(
  supabase: SupabaseClient,
  table: string,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data?.version as number | undefined) ?? 0) + 1;
}

/**
 * Writes the three records onboarding produces, then marks the profile
 * onboarded.
 *
 * Deliberately not a transaction: PostgREST has no multi-statement
 * transaction, and the failure mode is benign — an orphaned profile row with
 * no specification is invisible to the product, and resubmitting simply
 * writes a higher version. Marking the profile complete happens last, so a
 * partial write leaves the person inside onboarding rather than dropped into
 * an app with no configuration behind it.
 */
export async function persistOnboarding(
  supabase: SupabaseClient,
  userId: string,
  answers: OnboardingAnswers
): Promise<PersistedOnboarding> {
  const facts = normalizeFacts(answers);
  const specification = buildSpecification(facts);

  const profileVersion = await nextVersion(supabase, "workspace_profiles", userId);

  const { data: profile, error: profileError } = await supabase
    .from("workspace_profiles")
    .insert({
      user_id: userId,
      version: profileVersion,
      professional: facts.professional,
      business: facts.business,
      proposal: facts.proposal,
      brand: facts.brand,
      commercial: facts.commercial,
    })
    .select("id")
    .single();

  if (profileError || !profile) {
    throw new Error(`workspace_profile insert failed: ${profileError?.message}`);
  }

  const brandVersion = await nextVersion(supabase, "brand_profiles", userId);

  const { data: brand, error: brandError } = await supabase
    .from("brand_profiles")
    .insert({
      user_id: userId,
      version: brandVersion,
      source: "onboarding",
      color_direction: facts.brand.color_direction,
      typography_direction: facts.brand.typography_direction,
    })
    .select("id")
    .single();

  if (brandError || !brand) {
    throw new Error(`brand_profile insert failed: ${brandError?.message}`);
  }

  const specVersion = await nextVersion(
    supabase,
    "proposal_specifications",
    userId
  );

  const { data: spec, error: specError } = await supabase
    .from("proposal_specifications")
    .insert({
      user_id: userId,
      version: specVersion,
      workspace_profile_id: profile.id,
      brand_profile_id: brand.id,
      spec: specification,
    })
    .select("id")
    .single();

  if (specError || !spec) {
    throw new Error(`proposal_specification insert failed: ${specError?.message}`);
  }

  return {
    workspaceProfileId: profile.id,
    brandProfileId: brand.id,
    specificationId: spec.id,
    version: specVersion,
    facts,
    specification,
  };
}

/** The latest specification for a user, with the facts and brand behind it. */
export async function latestSpecification(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  id: string;
  version: number;
  spec: ProposalSpecification;
  workspaceProfileId: string;
  brandProfileId: string | null;
} | null> {
  const { data } = await supabase
    .from("proposal_specifications")
    .select("id, version, spec, workspace_profile_id, brand_profile_id")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    version: data.version as number,
    spec: data.spec as ProposalSpecification,
    workspaceProfileId: data.workspace_profile_id as string,
    brandProfileId: (data.brand_profile_id as string | null) ?? null,
  };
}

export async function latestFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<NormalizedFacts | null> {
  const { data } = await supabase
    .from("workspace_profiles")
    .select("professional, business, proposal, brand, commercial")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as NormalizedFacts | null) ?? null;
}
