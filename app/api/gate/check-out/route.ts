import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { performCheckOut } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { visitId?: string; sealOut?: string };
    if (!body.visitId) {
      return Response.json({ error: "Choose a trailer to check out" }, { status: 400 });
    }
    const result = await performCheckOut(await getDatabase(), {
      visitId: body.visitId,
      sealOut: body.sealOut,
      source: "manual",
    });
    return Response.json({
      visitId: result.visitId,
      flags: result.flags,
      notice: result.notice,
      events: result.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
