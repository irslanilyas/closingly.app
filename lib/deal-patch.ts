import { z } from "zod";
import { field } from "@/lib/validate";
import { STAGE_ORDER, type DealStage } from "@/lib/types";

/**
 * The fields a person may edit, and nothing else. Unknown keys are dropped, so
 * the transcript, source and ownership columns cannot be written through here.
 */
export const DealPatch = z
  .object({
    client_name: field.text(200).nullable(),
    client_company: field.text(200).nullable(),
    client_email: z
      .union([z.email().max(320), z.literal(""), z.null()])
      .transform((value) => value || null),
    pain_point: field.text(4000).nullable(),
    budget_signal: field.text(1000).nullable(),
    timeline: field.text(1000).nullable(),
    decision_maker: field.text(500).nullable(),
    fit_score: z.number().int().min(0).max(10).nullable(),
    stage: z.enum(STAGE_ORDER as [DealStage, ...DealStage[]]),
    proposed_amount: field.money.nullable(),
    estimated_hours: z.number().finite().min(0).max(100_000).nullable(),
    start_date: field.isoDate.nullable(),
    target_end_date: field.isoDate.nullable(),
    competitor_mentioned: field.text(200).nullable(),
    competitive_note: field.text(2000).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nothing to update",
  });

export type DealPatchInput = z.infer<typeof DealPatch>;
