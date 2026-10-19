import type { LayoutConfidence, LayoutDoor, LayoutDraft, LayoutSpot } from "@/lib/onboarding/layout";
import { offsetMeters, type LngLat } from "@/lib/onboarding/geo";

export type PhotoKind = "plan" | "overhead" | "dock_wall";

export type VisionMark = {
  kind: "door" | "spot";
  x: number;
  y: number;
  confidence: LayoutConfidence;
};

export type ParsedVision = {
  kind: PhotoKind;
  marks: VisionMark[];
};

const CONFIDENCE = new Set<LayoutConfidence>(["high", "medium", "low"]);

/**
 * Read a vision model's JSON. Aerial tiles are not an input.
 * The stored result is marks only, never the model's prose or the image text.
 */
export function parseVisionMarks(raw: string, fallbackKind: PhotoKind = "dock_wall"): ParsedVision | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: { kind?: unknown; marks?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as { kind?: unknown; marks?: unknown };
  } catch {
    return null;
  }
  const kind: PhotoKind =
    parsed.kind === "plan" || parsed.kind === "overhead" || parsed.kind === "dock_wall" ? parsed.kind : fallbackKind;
  if (!Array.isArray(parsed.marks)) return null;
  const marks: VisionMark[] = [];
  for (const item of parsed.marks) {
    if (!item || typeof item !== "object") continue;
    const record = item as { kind?: unknown; x?: unknown; y?: unknown; confidence?: unknown };
    const markKind = record.kind === "spot" ? "spot" : record.kind === "door" ? "door" : null;
    if (!markKind) continue;
    if (kind === "dock_wall" && markKind === "spot") continue;
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
    const confidence = CONFIDENCE.has(record.confidence as LayoutConfidence)
      ? (record.confidence as LayoutConfidence)
      : "medium";
    marks.push({ kind: markKind, x, y, confidence });
    if (marks.filter((mark) => mark.kind === "door").length > 40) break;
  }
  const doors = marks.filter((mark) => mark.kind === "door").slice(0, 40);
  const spots = marks.filter((mark) => mark.kind === "spot").slice(0, 80);
  if (!doors.length && !spots.length) return null;
  return { kind, marks: [...doors, ...spots] };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function visionSourceLabel(kind: PhotoKind): string {
  if (kind === "plan") return "Site plan";
  if (kind === "overhead") return "Overhead photo";
  return "Dock photo";
}

/** Place vision marks on a 100 m square around the pin. They stay suggestions. */
export function layoutFromVision(vision: ParsedVision, center: LngLat, address = ""): LayoutDraft {
  const span = 100;
  let doorIndex = 0;
  let spotIndex = 0;
  const doors: LayoutDoor[] = [];
  const spots: LayoutSpot[] = [];
  const label = visionSourceLabel(vision.kind);
  for (const mark of vision.marks) {
    const position = offsetMeters(center, (mark.x - 0.5) * span, (0.5 - mark.y) * span);
    if (mark.kind === "door") {
      doorIndex += 1;
      doors.push({
        key: `photo-door-${doorIndex}`,
        name: `D${pad(doorIndex)}`,
        type: "dry",
        position,
        status: "suggested",
        confidence: mark.confidence,
        provenance: "ai_suggested",
        sourceLabel: label,
      });
    } else {
      spotIndex += 1;
      spots.push({
        key: `photo-spot-${spotIndex}`,
        name: `P${pad(spotIndex)}`,
        type: "dry",
        zone: "Seen on the photo",
        position,
        status: "suggested",
        confidence: mark.confidence,
        provenance: "ai_suggested",
        sourceLabel: label,
      });
    }
  }
  return {
    address,
    center,
    source: "photo",
    note: `${label} proposed ${doors.length} doors${spots.length ? ` and ${spots.length} spots` : ""}. Nothing is saved until you accept each one.`,
    building: [],
    dockFace: "south",
    doors,
    spots,
  };
}

export const PHOTO_SYSTEM = [
  "You count dock doors and trailer spots in a photo or plan the user uploaded.",
  "Reply with JSON only: {\"kind\":\"dock_wall|overhead|plan\",\"marks\":[{\"kind\":\"door|spot\",\"x\":0.5,\"y\":0.5,\"confidence\":\"low|medium|high\"}]}",
  "x and y are fractions from the top left of this image, from 0 to 1.",
  "A dock wall has doors only. An overhead photo or site plan may also have spots.",
  "Do not describe the image and do not copy text from it.",
].join(" ");
