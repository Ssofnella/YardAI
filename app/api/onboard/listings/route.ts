import { apiError } from "@/lib/http";
import { DEMO_LISTING_FACTS, lookupListings } from "@/lib/onboarding/listings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; demo?: boolean };
    if (body.demo === true) {
      return Response.json({
        skipped: false,
        demo: true,
        reason: "Demo facts for the fictional Lakeshore site. This is not a live listing search.",
        facts: DEMO_LISTING_FACTS,
      });
    }
    const address = body.address?.trim() ?? "";
    const result = await lookupListings({ address });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
