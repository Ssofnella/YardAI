import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { confirmArrivalDraft, receiveEmailDraft } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; from?: string; subject?: string; draftId?: string; confirm?: boolean };
    const db = await getDatabase();
    if (body.confirm && body.draftId) {
      const result = await confirmArrivalDraft(db, body.draftId);
      return Response.json(result);
    }
    const text = body.text?.trim() ?? "";
    const from = body.from?.trim() ?? "";
    if (!from) return Response.json({ error: "Say which sender the mail came from." }, { status: 400 });
    if (text.length < 8) return Response.json({ error: "Paste the appointment email." }, { status: 400 });
    const result = await receiveEmailDraft(db, { from, subject: body.subject, text });
    if (result.status === "rejected") {
      return Response.json(
        { error: "That sender is not on the allowlist. No draft was created." },
        { status: 403 },
      );
    }
    return Response.json({
      status: "draft",
      id: result.id,
      appointment: result.appointment,
      note: "Draft only. Nothing is an expected arrival until you confirm it.",
    });
  } catch (error) {
    return apiError(error);
  }
}
