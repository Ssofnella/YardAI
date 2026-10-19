import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { controlSimulator } from "@/lib/simulator/runner";
import { readClock, requireSite } from "@/lib/yard/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDatabase();
    const site = await requireSite(db);
    const clock = await readClock(db, site.id);
    return Response.json(clock);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; speed?: number };
    if (!body.action) {
      return Response.json({ error: "Missing simulator action" }, { status: 400 });
    }
    const result = await controlSimulator(body.action, body.speed);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
