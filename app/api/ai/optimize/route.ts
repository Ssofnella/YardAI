import { activeProvider } from "@/lib/ai/provider";
import { optimizeInput } from "@/lib/ai/snapshot";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { readClock, requireSite } from "@/lib/yard/context";
import { logSiteSuggestion } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const db = await getDatabase();
    const site = await requireSite(db);
    const clock = await readClock(db, site.id);
    const plan = await activeProvider().optimize(await optimizeInput(db, clock.asOf));
    const suggestionId = `opt:${crypto.randomUUID()}`;
    await logSiteSuggestion(db, {
      kind: "optimize",
      suggestionId,
      source: "manual",
      occurredAt: clock.asOf,
      payload: {
        provider: plan.provider,
        reason: plan.moves[0]?.reason ?? "No moves suggested.",
        moveCount: plan.moves.length,
        moves: plan.moves,
      },
    });
    return Response.json({ suggestionId, provider: plan.provider, moves: plan.moves });
  } catch (error) {
    return apiError(error);
  }
}
