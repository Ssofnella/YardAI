import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import type { LayoutDraft } from "@/lib/onboarding/layout";
import { confirmOnboarding } from "@/lib/yard/onboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { draft?: LayoutDraft; feedMode?: string; allowedSenders?: string[] };
    if (!body.draft) return Response.json({ error: "Missing layout draft" }, { status: 400 });
    const result = await confirmOnboarding(
      await getDatabase(),
      body.draft,
      body.feedMode ?? "manual",
      Array.isArray(body.allowedSenders) ? body.allowedSenders : [],
    );
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
