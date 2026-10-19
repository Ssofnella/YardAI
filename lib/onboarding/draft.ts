import type { ImageryConfig } from "@/lib/imagery/naip";
import { resolveImagery } from "@/lib/imagery/resolve";
import type { ListingFact } from "@/lib/onboarding/listings";
import { layoutFromFootprint, type LayoutDraft } from "@/lib/onboarding/layout";
import { mergeLayoutSources } from "@/lib/onboarding/merge";
import { fetchBuildingRing } from "@/lib/onboarding/overpass";
import type { ParsedVision } from "@/lib/onboarding/photo-draft";
import type { LngLat } from "@/lib/onboarding/geo";
import { osmHintsEnabled } from "@/lib/runtime/flags";

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
  imagery: ImageryConfig;
};

export async function buildLayoutDraft(input: {
  lat: number;
  lng: number;
  address?: string;
  doorCount?: number;
  /** True only when the person chose the grid template. */
  commitTemplate?: boolean;
  facts?: ListingFact[];
  listingAccepted?: boolean;
  vision?: ParsedVision | null;
}): Promise<DraftResult> {
  const center: LngLat = { lng: input.lng, lat: input.lat };
  const imagery = resolveImagery(center);
  const tried: string[] = ["geometry", imagery.provider];
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

  const visionDoors = input.vision?.marks.some((mark) => mark.kind === "door") ?? false;
  if (!input.commitTemplate && !visionDoors && hint) {
    const listed = input.listingAccepted === false ? undefined : input.facts?.find((fact) => fact.field === "dock_high_doors")?.value;
    const doorCount = input.doorCount && input.doorCount > 0 ? input.doorCount : listed;
    const draft = layoutFromFootprint(hint.ring, center, {
      source: "osm_hint",
      doorCount,
      address: input.address,
      note: "OpenStreetMap outline is a hint. It is not copied into the published yard. Accept only doors you place yourself.",
    });
    draft.factLines = input.listingAccepted === false ? [] : (input.facts ?? []).map((fact) => fact.display);
    draft.imageryProvider = imagery.provider === "txgio" ? "txgio" : "naip";
    draft.note = `${draft.note} ${imagery.note}`;
    return { tried, hint, needsDoorCount: !doorCount, draft, imagery };
  }

  const merged = mergeLayoutSources({
    center,
    address: input.address,
    doorCount: input.doorCount,
    commitTemplate: input.commitTemplate,
    facts: input.facts,
    listingAccepted: input.listingAccepted,
    vision: input.vision,
    imagery,
  });
  return {
    tried: [...tried, ...merged.tried.filter((item) => !tried.includes(item))],
    hint,
    needsDoorCount: merged.needsDoorCount,
    draft: merged.draft,
    imagery,
  };
}
