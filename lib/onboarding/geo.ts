export type LngLat = { lng: number; lat: number };

export function metersPerDegree(lat: number): { lat: number; lng: number } {
  const latMeters = 111_320;
  const lngMeters = 111_320 * Math.cos((lat * Math.PI) / 180);
  return { lat: latMeters, lng: Math.max(1, lngMeters) };
}

export function offsetMeters(origin: LngLat, east: number, north: number): LngLat {
  const scale = metersPerDegree(origin.lat);
  return {
    lng: origin.lng + east / scale.lng,
    lat: origin.lat + north / scale.lat,
  };
}

export function distanceMeters(a: LngLat, b: LngLat): number {
  const scale = metersPerDegree((a.lat + b.lat) / 2);
  const dx = (b.lng - a.lng) * scale.lng;
  const dy = (b.lat - a.lat) * scale.lat;
  return Math.hypot(dx, dy);
}

export function ringCentroid(ring: LngLat[]): LngLat {
  const unique = ring.length > 1 && samePoint(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
  const count = unique.length || 1;
  const sum = unique.reduce(
    (total, point) => ({ lng: total.lng + point.lng, lat: total.lat + point.lat }),
    { lng: 0, lat: 0 },
  );
  return { lng: sum.lng / count, lat: sum.lat / count };
}

export function ringArea(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    sum += ring[index].lng * next.lat - next.lng * ring[index].lat;
  }
  return Math.abs(sum / 2);
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return Math.abs(a.lng - b.lng) < 1e-8 && Math.abs(a.lat - b.lat) < 1e-8;
}

export function bboxAround(center: LngLat, meters: number): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const west = offsetMeters(center, -meters, 0).lng;
  const east = offsetMeters(center, meters, 0).lng;
  const south = offsetMeters(center, 0, -meters).lat;
  const north = offsetMeters(center, 0, meters).lat;
  return { west, south, east, north };
}

export function pointInBbox(
  point: { x: number; y: number },
  bbox: { west: number; south: number; east: number; north: number },
): LngLat {
  return {
    lng: bbox.west + point.x * (bbox.east - bbox.west),
    lat: bbox.north - point.y * (bbox.north - bbox.south),
  };
}
