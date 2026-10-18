import type { SiteConfigSnapshot } from "@/lib/domain/config";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { publishConfig } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { snapshot?: SiteConfigSnapshot; note?: string };
    if (!body.snapshot) {
      return Response.json({ error: "Missing config snapshot" }, { status: 400 });
    }
    const result = await publishConfig(await getDatabase(), body.snapshot, body.note?.trim() || null);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
