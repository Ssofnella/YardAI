import { asIso } from "@/lib/db/json";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { listEvents } from "@/lib/yard/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
    const rows = await listEvents(await getDatabase(), limit);
    return Response.json({
      events: rows.map((row) => ({
        id: String(row.id),
        eventType: String(row.event_type),
        trailerId: row.trailer_id ? String(row.trailer_id) : null,
        trailerNumber: row.trailer_number ? String(row.trailer_number) : null,
        scac: row.scac ? String(row.scac) : null,
        loadId: row.load_id ? String(row.load_id) : null,
        appointmentId: row.appointment_id ? String(row.appointment_id) : null,
        location: row.location ? String(row.location) : null,
        occurredAt: asIso(row.occurred_at),
        source: String(row.source),
        visitId: row.visit_id ? String(row.visit_id) : null,
        payload: row.payload ?? {},
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
