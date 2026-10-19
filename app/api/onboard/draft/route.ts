import { apiError } from "@/lib/http";
import { buildLayoutDraft } from "@/lib/onboarding/draft";
import type { ListingFact } from "@/lib/onboarding/listings";
import type { ParsedVision } from "@/lib/onboarding/photo-draft";

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
      facts?: ListingFact[];
      listingAccepted?: boolean;
      vision?: ParsedVision | null;
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
      facts: Array.isArray(body.facts) ? body.facts : [],
      listingAccepted: body.listingAccepted !== false,
      vision: body.vision ?? null,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
