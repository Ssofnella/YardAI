import type { DoorType, SiteConfigSnapshot, SpotType } from "@/lib/domain/config";
import { validateSnapshot } from "@/lib/domain/config";
import { distanceMeters, offsetMeters, ringCentroid, type LngLat } from "@/lib/onboarding/geo";

export type LayoutSource = "template" | "user_drawn" | "door_count" | "osm_hint" | "photo" | "listing";
export type LayoutStatus = "suggested" | "accepted" | "edited" | "rejected";
export type LayoutConfidence = "high" | "medium" | "low";

export type LayoutDoor = {
  key: string;
  name: string;
  type: DoorType;
  position: LngLat;
  status: LayoutStatus;
  confidence: LayoutConfidence;
  provenance: "ai_suggested" | "user_drawn" | "template" | "osm_hint";
  /** Short label such as "Listing door count" or "Dock photo". */
  sourceLabel?: string;
};

export type LayoutSpot = {
  key: string;
  name: string;
  type: SpotType;
  zone: string;
  position: LngLat;
  status: LayoutStatus;
  confidence: LayoutConfidence;
  provenance: "ai_suggested" | "user_drawn" | "template" | "osm_hint";
  sourceLabel?: string;
};

export type LayoutDraft = {
  address: string;
  center: LngLat;
  source: LayoutSource;
  note: string;
  building: LngLat[];
  dockFace: "north" | "south" | "east" | "west";
  doors: LayoutDoor[];
  spots: LayoutSpot[];
  /** Display lines such as "Found: 20 dock-high doors (LoopNet)". Facts only. */
  factLines?: string[];
  listingAccepted?: boolean;
  imageryProvider?: "naip" | "txgio" | "plain" | "licensed_basemap";
  conflicts?: string[];
};

function clampDoors(count: number): number {
  if (!Number.isFinite(count)) return 20;
  return Math.min(40, Math.max(1, Math.round(count)));
}

function doorType(index: number, total: number): DoorType {
  const powered = Math.max(1, Math.round(total * 0.3));
  return index < powered ? "both" : "dry";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function doorsAlongWall(from: LngLat, to: LngLat, count: number): LayoutDoor[] {
  const doors = clampDoors(count);
  const items: LayoutDoor[] = [];
  for (let index = 0; index < doors; index += 1) {
    const t = (index + 0.5) / doors;
    items.push({
      key: `door-wall-${index + 1}`,
      name: `D${pad(index + 1)}`,
      type: doorType(index, doors),
      position: {
        lng: from.lng + (to.lng - from.lng) * t,
        lat: from.lat + (to.lat - from.lat) * t,
      },
      status: "suggested",
      confidence: "low",
      provenance: "ai_suggested",
      sourceLabel: "Wall you drew",
    });
  }
  return items;
}

export function layoutFromDoorCount(
  doorCount: number,
  center: LngLat,
  address = "",
  commit = false,
): LayoutDraft {
  const doors = clampDoors(doorCount);
  const width = Math.max(48, doors * 4.2);
  const halfW = width / 2;
  const halfH = 16;
  const south = -halfH;
  const building: LngLat[] = [
    offsetMeters(center, -halfW, halfH),
    offsetMeters(center, halfW, halfH),
    offsetMeters(center, halfW, south),
    offsetMeters(center, -halfW, south),
    offsetMeters(center, -halfW, halfH),
  ];
  const doorPoints: LayoutDoor[] = [];
  for (let index = 0; index < doors; index += 1) {
    const east = -halfW + ((index + 0.5) * width) / doors;
    doorPoints.push({
      key: `door-${index + 1}`,
      name: `D${pad(index + 1)}`,
      type: doorType(index, doors),
      position: offsetMeters(center, east, south - 8),
      status: commit ? "accepted" : "suggested",
      confidence: "low",
      provenance: commit ? "template" : "ai_suggested",
      sourceLabel: commit ? "Grid you chose" : "Door count you entered",
    });
  }
  const spots = spotRows(offsetMeters(center, 0, south - 18), doors, 0, -7, commit);
  return {
    address,
    center,
    source: commit ? "template" : "door_count",
    note: commit
      ? `Grid template, ${doors} doors. You chose this, so it can be published.`
      : `${doors} doors are a spacing guess along the south face. They stay drafts until you accept them. At 0.6 m, doors are often invisible.`,
    building,
    dockFace: "south",
    doors: doorPoints,
    spots,
  };
}

function spotRows(
  origin: LngLat,
  doorCount: number,
  stepEast: number,
  stepNorth: number,
  commit: boolean,
): LayoutSpot[] {
  const reeferCount = Math.min(10, Math.max(2, Math.ceil(doorCount / 2)));
  const dropA = Math.min(16, Math.max(4, doorCount));
  const dropB = Math.max(4, Math.floor(doorCount / 2));
  const rows: { prefix: string; count: number; type: SpotType; zone: string; cols: number }[] = [
    { prefix: "R", count: reeferCount, type: "reefer", zone: "Reefer row", cols: Math.min(5, reeferCount) },
    { prefix: "A", count: dropA, type: "dry", zone: "Drop lot A", cols: 8 },
    { prefix: "B", count: dropB, type: "dry", zone: "Drop lot B", cols: 8 },
    { prefix: "S", count: 4, type: "staging", zone: "Staging", cols: 4 },
    { prefix: "H", count: 4, type: "holding", zone: "Holding", cols: 4 },
  ];
  const stepLen = Math.hypot(stepEast, stepNorth) || 1;
  const perpEast = (-stepNorth / stepLen) * 4.2;
  const perpNorth = (stepEast / stepLen) * 4.2;
  const spots: LayoutSpot[] = [];
  let lineStart = 0;
  for (const row of rows) {
    const cols = Math.max(1, row.cols);
    const rowCount = Math.ceil(row.count / cols);
    for (let index = 0; index < row.count; index += 1) {
      const col = index % cols;
      const line = lineStart + Math.floor(index / cols);
      const lateral = col - (cols - 1) / 2;
      spots.push({
        key: `spot-${row.prefix}-${index + 1}`,
        name: `${row.prefix}${pad(index + 1)}`,
        type: row.type,
        zone: row.zone,
        status: commit ? "accepted" : "suggested",
        confidence: "low",
        provenance: commit ? "template" : "ai_suggested",
        sourceLabel: commit ? "Grid you chose" : "Spacing beside that door count",
        position: offsetMeters(
          origin,
          stepEast * line + perpEast * lateral,
          stepNorth * line + perpNorth * lateral,
        ),
      });
    }
    lineStart += rowCount + 1;
  }
  return spots;
}

type Edge = { a: LngLat; b: LngLat; length: number; mid: LngLat };

function edgesOf(ring: LngLat[]): Edge[] {
  const open = ring.length > 1 && distanceMeters(ring[0], ring[ring.length - 1]) < 0.5 ? ring.slice(0, -1) : ring;
  const edges: Edge[] = [];
  for (let index = 0; index < open.length; index += 1) {
    const a = open[index];
    const b = open[(index + 1) % open.length];
    const mid = { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 };
    edges.push({ a, b, length: distanceMeters(a, b), mid });
  }
  return edges;
}

function faceOf(edge: Edge, centroid: LngLat): LayoutDraft["dockFace"] {
  const dx = edge.b.lng - edge.a.lng;
  const dy = edge.b.lat - edge.a.lat;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  if (horizontal) return edge.mid.lat < centroid.lat ? "south" : "north";
  return edge.mid.lng < centroid.lng ? "west" : "east";
}

export function layoutFromFootprint(
  ring: LngLat[],
  center: LngLat,
  options: { doorCount?: number; source: LayoutSource; address?: string; note?: string },
): LayoutDraft {
  const centroid = ringCentroid(ring);
  const edges = edgesOf(ring);
  const longest = edges.reduce((best, edge) => (edge.length > best.length ? edge : best), edges[0]);
  const ties = edges.filter((edge) => Math.abs(edge.length - longest.length) < 1);
  const edge = ties.reduce((south, item) => (item.mid.lat < south.mid.lat ? item : south), ties[0]);
  const dockFace = faceOf(edge, centroid);
  const scaleLng = 111_320 * Math.cos((centroid.lat * Math.PI) / 180);
  const dx = (edge.mid.lng - centroid.lng) * scaleLng;
  const dy = (edge.mid.lat - centroid.lat) * 111_320;
  const length = Math.hypot(dx, dy) || 1;
  const outEast = (dx / length) * 8;
  const outNorth = (dy / length) * 8;
  const along = distanceMeters(edge.a, edge.b);
  const guessed = Math.min(30, Math.max(4, Math.round(along / 4)));
  const doorCount = clampDoors(options.doorCount || guessed);
  const doors: LayoutDoor[] = [];
  for (let index = 0; index < doorCount; index += 1) {
    const t = (index + 0.5) / doorCount;
    const onEdge = {
      lng: edge.a.lng + (edge.b.lng - edge.a.lng) * t,
      lat: edge.a.lat + (edge.b.lat - edge.a.lat) * t,
    };
    doors.push({
      key: `door-${index + 1}`,
      name: `D${pad(index + 1)}`,
      type: doorType(index, doorCount),
      position: offsetMeters(onEdge, outEast, outNorth),
      status: "suggested",
      confidence: "low",
      provenance: options.source === "osm_hint" ? "osm_hint" : "ai_suggested",
      sourceLabel: options.source === "osm_hint" ? "OpenStreetMap hint" : "Building outline",
    });
  }
  const anchor = offsetMeters(edge.mid, outEast * 2.2, outNorth * 2.2);
  const spots = spotRows(anchor, doorCount, (outEast / 8) * 7, (outNorth / 8) * 7, false).map((spot) => ({
    ...spot,
    provenance: options.source === "osm_hint" ? ("osm_hint" as const) : spot.provenance,
    sourceLabel: options.source === "osm_hint" ? "OpenStreetMap hint" : spot.sourceLabel,
    status: "suggested" as const,
  }));
  const closed =
    ring.length > 1 && distanceMeters(ring[0], ring[ring.length - 1]) < 0.5
      ? ring
      : [...ring, ring[0]];
  return {
    address: options.address ?? "",
    center,
    source: options.source,
    note:
      options.note ??
      "Door marks are a spacing guess. At 0.6 m they are often invisible, so they stay drafts until you accept them.",
    building: closed,
    dockFace,
    doors,
    spots,
  };
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

export function isPublishable(item: { status: LayoutStatus; provenance: string }): boolean {
  if (item.provenance === "osm_hint") return false;
  return item.status === "accepted" || item.status === "edited";
}

export function layoutToSnapshot(draft: LayoutDraft, base: SiteConfigSnapshot): SiteConfigSnapshot {
  const keptSpots = draft.spots.filter(isPublishable);
  const keptDoors = draft.doors.filter(isPublishable);
  const zones = new Map<string, { id: string; name: string; sort: number }>();
  for (const spot of keptSpots) {
    if (!zones.has(spot.zone)) {
      zones.set(spot.zone, { id: `zone-${slug(spot.zone)}`, name: spot.zone, sort: zones.size + 1 });
    }
  }
  if (!zones.size) {
    zones.set("Yard", { id: "zone-yard", name: "Yard", sort: 1 });
  }
  const spots = keptSpots.map((spot, index) => {
    const zone = zones.get(spot.zone) ?? zones.get("Yard")!;
    const cols = 8;
    return {
      id: `spot-${slug(spot.name)}`,
      zoneId: zone.id,
      name: spot.name.trim(),
      type: spot.type,
      row: Math.floor(index / cols),
      col: index % cols,
      lng: spot.position.lng,
      lat: spot.position.lat,
    };
  });
  const doors = keptDoors.map((door, index) => ({
    id: `door-${slug(door.name)}`,
    name: door.name.trim(),
    type: door.type,
    sort: index + 1,
    lng: door.position.lng,
    lat: door.position.lat,
  }));
  return validateSnapshot({
    ...base,
    doors,
    zones: [...zones.values()],
    spots,
  });
}
