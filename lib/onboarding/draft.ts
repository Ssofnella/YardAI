import { osmHintsEnabled } from "@/lib/runtime/flags";
import { fetchBuildingRing } from "@/lib/onboarding/overpass";
import { layoutFromDoorCount, layoutFromFootprint, type LayoutDraft } from "@/lib/onboarding/layout";
import type { LngLat } from "@/lib/onboarding/geo";

export type OsmHint = {
  source: "osm";
  storeGeometry: false;
  ring: LngLat[];
  attribution: "© OpenStreetMap contributors, ODbL. Hint only. Not saved into the yard.";
};

export type DraftResult = {
  draft: LayoutDraft | null;
  hint: OsmHint | null;
  tried: string[];
  needsDoorCount: boolean;
};

export async function buildLayoutDraft(input: {
  lat: number;
  lng: number;
  address?: string;
  doorCount?: number;
  /** True only when the person chose the grid template. */
  commitTemplate?: boolean;
}): Promise<DraftResult> {
  const center: LngLat = { lng: input.lng, lat: input.lat };
  const tried: string[] = ["geometry"];
  let hint: OsmHint | null = null;
  if (osmHintsEnabled()) {
    tried.push("osm_hint");
    const ring = await fetchBuildingRing(input.lat, input.lng);
    if (ring && ring.length >= 4) {
      hint = {
        source: "osm",
        storeGeometry: false,
        ring,
        attribution: "© OpenStreetMap contributors, ODbL. Hint only. Not saved into the yard.",
      };
    }
  }
  if (input.commitTemplate && input.doorCount && input.doorCount > 0) {
    tried.push("template");
    return {
      tried,
      hint,
      needsDoorCount: false,
      draft: layoutFromDoorCount(input.doorCount, center, input.address ?? "", true),
    };
  }
  if (hint) {
    return {
      tried,
      hint,
      needsDoorCount: !input.doorCount,
      draft: layoutFromFootprint(hint.ring, center, {
        source: "osm_hint",
        doorCount: input.doorCount,
        address: input.address,
        note: "OpenStreetMap outline is a hint. It is not copied into the published yard. Accept only doors you place yourself.",
      }),
    };
  }
  if (input.doorCount && input.doorCount > 0) {
    tried.push("door_count");
    return {
      tried,
      hint: null,
      needsDoorCount: false,
      draft: layoutFromDoorCount(input.doorCount, center, input.address ?? "", false),
    };
  }
  return { draft: null, hint: null, tried, needsDoorCount: true };
}
