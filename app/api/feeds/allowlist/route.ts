import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { saveAllowedSenders } from "@/lib/yard/onboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { allowedSenders?: string[] };
    const senders = Array.isArray(body.allowedSenders) ? body.allowedSenders : [];
    const allowedSenders = await saveAllowedSenders(await getDatabase(), senders);
    return Response.json({ allowedSenders });
  } catch (error) {
    return apiError(error);
  }
}
