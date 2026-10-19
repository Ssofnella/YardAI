import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { performCheckIn, type CheckInInput } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckInInput;
    const result = await performCheckIn(await getDatabase(), { ...body, source: "manual" });
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
