import type { PlaceKind } from "@/lib/ai/types";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { acceptYardMove, logSiteSuggestion } from "@/lib/yard/operations";

type MoveBody = {
  action?: "accept" | "dismiss";
  suggestionId?: string;
  visitId?: string;
  toKind?: PlaceKind;
  toId?: string;
  toName?: string;
  fromName?: string;
  reason?: string;
  kind?: "respot" | "door_swap";
  detentionMinutes?: number;
  dockIdleMinutes?: number;
  trailerNumber?: string;
  scac?: string;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MoveBody;
    const db = await getDatabase();
    if (!body.suggestionId) {
      return Response.json({ error: "Missing suggestion" }, { status: 400 });
    }
    if (body.action === "dismiss") {
      await logSiteSuggestion(db, {
        kind: "optimize",
        suggestionId: body.suggestionId,
        eventType: "ai.dismissed",
        source: "manual",
        trailerNumber: body.trailerNumber,
        scac: body.scac,
        location: body.fromName,
        payload: { toName: body.toName, reason: body.reason ?? "Skipped" },
      });
      return Response.json({ ok: true });
    }
    if (!body.visitId || !body.toId || !body.toKind) {
      return Response.json({ error: "Missing move" }, { status: 400 });
    }
    const result = await acceptYardMove(db, {
      visitId: body.visitId,
      toKind: body.toKind,
      toId: body.toId,
      toName: body.toName ?? "",
      fromName: body.fromName ?? "",
      suggestionId: body.suggestionId,
      reason: body.reason ?? "",
      kind: body.kind === "door_swap" ? "door_swap" : "respot",
      detentionMinutes: Number(body.detentionMinutes ?? 0),
      dockIdleMinutes: Number(body.dockIdleMinutes ?? 0),
      source: "manual",
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
