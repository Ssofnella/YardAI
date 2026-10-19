import { apiError } from "@/lib/http";
import { geocoderMode } from "@/lib/runtime/flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const mode = geocoderMode();
    if (mode !== "mapbox_permanent") {
      return Response.json({
        mode: "manual_pin",
        error:
          "Address search is off. Drop a pin on the NAIP image, or use this browser's location. A storing geocoder stays off until YARD_GEOCODER=mapbox_permanent.",
      });
    }
    if (query.length < 3) {
      return Response.json({ error: "Type at least 3 characters." }, { status: 400 });
    }
    const token = process.env.YARD_MAPBOX_TOKEN?.trim();
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?limit=5&permanent=true&access_token=${token}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return Response.json({ error: "The geocoder did not answer." }, { status: 502 });
    const body = (await response.json()) as {
      features?: { place_name?: string; center?: [number, number] }[];
    };
    const matches = (body.features ?? [])
      .filter((feature) => feature.center)
      .map((feature) => ({
        label: feature.place_name ?? query,
        lng: feature.center?.[0],
        lat: feature.center?.[1],
        permanent: true,
      }));
    if (!matches.length) return Response.json({ error: "No match for that address." }, { status: 404 });
    return Response.json({ mode, matches });
  } catch (error) {
    return apiError(error);
  }
}
