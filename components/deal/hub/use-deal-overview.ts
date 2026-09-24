"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import type { Deal } from "@/lib/types";

export const overviewKey = (dealId: string) => ["deal", dealId, "overview"] as const;

class NotFound extends Error {}

/**
 * The deal page's data, in one cache entry.
 *
 * Every card on the page reads from this, so an edit made in one place (the
 * stage, the value, a sent follow-up) shows everywhere at once instead of each
 * card holding its own copy that drifts.
 */
export function useDealOverview(dealId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: overviewKey(dealId),
    queryFn: async (): Promise<DealOverview> => {
      const res = await fetch(`/api/deals/${dealId}/overview`);
      if (res.status === 404) throw new NotFound();
      if (!res.ok) throw new Error("overview_failed");
      return res.json();
    },
    retry: (count, error) => !(error instanceof NotFound) && count < 2,
  });

  /** Re-read everything, after an action whose effects reach several cards. */
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: overviewKey(dealId) }),
    [qc, dealId]
  );

  /**
   * Optimistic: the page reflects the edit immediately and rolls back if the
   * server refuses it. Anything derived server-side (probability, next action)
   * is refreshed once the write lands.
   */
  const patchDeal = useCallback(
    async (partial: Partial<Deal>) => {
      const key = overviewKey(dealId);
      const previous = qc.getQueryData<DealOverview>(key);
      qc.setQueryData<DealOverview>(key, (current) =>
        current ? { ...current, deal: { ...current.deal, ...partial } } : current
      );

      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }).catch(() => null);

      if (!res?.ok) {
        qc.setQueryData(key, previous);
        toast.error("Couldn't save that change.");
        return false;
      }

      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      return true;
    },
    [qc, dealId]
  );

  return {
    overview: query.data,
    loading: query.isPending,
    notFound: query.error instanceof NotFound,
    failed: query.isError && !(query.error instanceof NotFound),
    refresh,
    patchDeal,
  };
}
