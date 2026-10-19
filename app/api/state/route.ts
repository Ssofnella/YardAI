import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { ensureRunner } from "@/lib/simulator/runner";
import { getYardState } from "@/lib/yard/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    ensureRunner();
    const state = await getYardState(await getDatabase());
    return Response.json(state);
  } catch (error) {
    return apiError(error);
  }
}
