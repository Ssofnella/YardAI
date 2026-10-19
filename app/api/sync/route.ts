import { getDatabase } from "@/lib/db/client";
import { YardError } from "@/lib/db/types";
import { clearReeferFlag, performCheckIn, performCheckOut, type CheckInInput } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SyncItem = {
  id?: string;
  kind?: string;
  body?: Record<string, unknown>;
  deviceTime?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as { items?: SyncItem[] };
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 50) : [];
  const db = await getDatabase();
  const results: { id: string; status: "accepted" | "duplicate" | "rejected"; reason?: string; visitId?: string | null }[] = [];

  for (const item of items) {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) {
      results.push({ id: "", status: "rejected", reason: "Missing event id" });
      continue;
    }
    const body = item.body ?? {};
    try {
      if (item.kind === "check_in") {
        const result = await performCheckIn(db, {
          ...(body as CheckInInput),
          commandId: id,
          deviceTime: item.deviceTime,
          source: "manual",
        });
        results.push({
          id,
          status: result.duplicate ? "duplicate" : "accepted",
          visitId: result.visitId,
        });
      } else if (item.kind === "check_out") {
        const result = await performCheckOut(db, {
          visitId: String(body.visitId ?? ""),
          sealOut: typeof body.sealOut === "string" ? body.sealOut : null,
          role: typeof body.role === "string" ? body.role : null,
          commandId: id,
          source: "manual",
        });
        results.push({
          id,
          status: result.duplicate ? "duplicate" : "accepted",
          visitId: result.visitId,
        });
      } else if (item.kind === "clear_flag") {
        const result = await clearReeferFlag(db, {
          visitId: String(body.visitId ?? ""),
          role: String(body.role ?? ""),
          reason: String(body.reason ?? ""),
          commandId: id,
          source: "manual",
        });
        results.push({
          id,
          status: result.duplicate ? "duplicate" : "accepted",
          visitId: result.visitId,
        });
      } else {
        results.push({ id, status: "rejected", reason: "Unknown outbox kind" });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Rejected";
      const status = error instanceof YardError ? error.status : 400;
      results.push({ id, status: "rejected", reason: status === 500 ? "Could not save" : reason });
    }
  }

  return Response.json({ results });
}
