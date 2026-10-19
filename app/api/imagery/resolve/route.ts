import { imageryConfig } from "@/lib/imagery/naip";
import { resolveImagery } from "@/lib/imagery/resolve";
import { imageryPreference } from "@/lib/runtime/flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const imagery =
    Number.isFinite(lat) && Number.isFinite(lng) ? resolveImagery({ lat, lng }) : imageryConfig();
  return Response.json({
    preference: imageryPreference(),
    imagery,
  });
}
