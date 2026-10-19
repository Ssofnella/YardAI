import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { rollbackConfig } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { configId?: string };
    if (!body.configId) {
      return Response.json({ error: "Missing config version" }, { status: 400 });
    }
    const result = await rollbackConfig(await getDatabase(), body.configId);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
