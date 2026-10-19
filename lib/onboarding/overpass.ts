import { ringArea, type LngLat } from "@/lib/onboarding/geo";

type OverpassElement = {
  type?: string;
  geometry?: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
};

export function pickBuilding(elements: OverpassElement[], target: LngLat): LngLat[] | null {
  let best: { ring: LngLat[]; area: number; distance: number } | null = null;
  for (const element of elements) {
    if (!element.geometry || element.geometry.length < 4) continue;
    const ring = element.geometry.map((point) => ({ lng: point.lon, lat: point.lat }));
    const area = ringArea(ring);
    if (area <= 0) continue;
    const center = element.center
      ? { lng: element.center.lon, lat: element.center.lat }
      : ring.reduce(
          (sum, point) => ({ lng: sum.lng + point.lng, lat: sum.lat + point.lat }),
          { lng: 0, lat: 0 },
        );
    const count = element.center ? 1 : ring.length;
    const centroid = element.center ? center : { lng: center.lng / count, lat: center.lat / count };
    const distance = Math.hypot(centroid.lng - target.lng, centroid.lat - target.lat);
    if (!best || area > best.area * 1.4 || (area > best.area * 0.7 && distance < best.distance)) {
      best = { ring, area, distance };
    }
  }
  return best?.ring ?? null;
}

export async function fetchBuildingRing(lat: number, lng: number): Promise<LngLat[] | null> {
  const query = `[out:json][timeout:12];way["building"](around:100,${lat},${lng});out geom;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "YardlineDemo/0.2 (personal yard demo)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { elements?: OverpassElement[] };
    return pickBuilding(body.elements ?? [], { lng, lat });
  } catch {
    return null;
  }
}
