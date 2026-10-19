import { imageryConfig } from "@/lib/imagery/naip";
import { aiRuntimeProvider, emailInboundDomain, geocoderMode, osmHintsEnabled } from "@/lib/runtime/flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    imagery: imageryConfig(),
    geocoder: geocoderMode(),
    aiProvider: aiRuntimeProvider(),
    emailDomain: emailInboundDomain(),
    osmHints: osmHintsEnabled(),
  });
}
