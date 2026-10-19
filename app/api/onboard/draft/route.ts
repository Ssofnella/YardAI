import { apiError } from "@/lib/http";
import { buildLayoutDraft } from "@/lib/onboarding/draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lat?: number;
      lng?: number;
      address?: string;
      doorCount?: number;
      commitTemplate?: boolean;
    };
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return Response.json({ error: "Pick a point on the map first." }, { status: 400 });
    }
    const result = await buildLayoutDraft({
      lat: Number(body.lat),
      lng: Number(body.lng),
      address: body.address,
      doorCount: body.doorCount,
      commitTemplate: body.commitTemplate === true,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
