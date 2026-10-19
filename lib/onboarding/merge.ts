import type { ImageryConfig } from "@/lib/imagery/naip";
import type { ListingFact } from "@/lib/onboarding/listings";
import { layoutFromDoorCount, type LayoutDraft } from "@/lib/onboarding/layout";
import { layoutFromVision, type ParsedVision } from "@/lib/onboarding/photo-draft";
import type { LngLat } from "@/lib/onboarding/geo";

export type MergeInput = {
  center: LngLat;
  address?: string;
  doorCount?: number;
  commitTemplate?: boolean;
  facts?: ListingFact[];
  listingAccepted?: boolean;
  vision?: ParsedVision | null;
  imagery: Pick<ImageryConfig, "provider" | "note" | "label">;
};

export type MergeResult = {
  draft: LayoutDraft | null;
  tried: string[];
  needsDoorCount: boolean;
};

function listedDoorCount(input: MergeInput): number | undefined {
  if (input.listingAccepted === false) return undefined;
  const fact = input.facts?.find((item) => item.field === "dock_high_doors");
  return fact && fact.value > 0 ? fact.value : undefined;
}

function annotate(draft: LayoutDraft, input: MergeInput, seenDoors: number): LayoutDraft {
  const lines = input.listingAccepted === false ? [] : (input.facts ?? []).map((fact) => fact.display);
  const listed = listedDoorCount(input);
  const typed = input.doorCount && input.doorCount > 0 ? Math.round(input.doorCount) : undefined;
  const conflicts: string[] = [];
  if (listed && seenDoors > 0 && listed !== seenDoors) {
    conflicts.push(
      `Listing says ${listed} dock-high doors. The photo draft has ${seenDoors}. Both stay suggestions until you accept a set.`,
    );
  }
  if (listed && typed && seenDoors === 0 && listed !== typed) {
    conflicts.push(`Listing says ${listed} dock-high doors. The door count field is ${typed}.`);
  }
  const imageryProvider =
    input.imagery.provider === "txgio" || input.imagery.provider === "plain" || input.imagery.provider === "licensed_basemap"
      ? input.imagery.provider
      : "naip";
  return {
    ...draft,
    factLines: lines,
    listingAccepted: input.listingAccepted !== false && lines.length > 0,
    imageryProvider,
    conflicts,
    note: [draft.note, `Basemap: ${input.imagery.label}. Not sent to a model.`, ...conflicts].filter(Boolean).join(" "),
  };
}

function retagSpots(draft: LayoutDraft, sourceLabel: string): LayoutDraft {
  return {
    ...draft,
    spots: draft.spots.map((spot) => ({
      ...spot,
      sourceLabel,
      confidence: "low" as const,
      status: "suggested" as const,
      provenance: "ai_suggested" as const,
    })),
  };
}

/**
 * One draft from the sources the person offered.
 * Imagery is the basemap note only. It does not place doors.
 * Every generated mark stays suggested unless the person chose the grid.
 */
export function mergeLayoutSources(input: MergeInput): MergeResult {
  const tried = ["geometry", input.imagery.provider];
  const listed = listedDoorCount(input);
  const typed = input.doorCount && input.doorCount > 0 ? Math.round(input.doorCount) : undefined;
  const count = typed ?? listed;

  if (input.commitTemplate && count && count > 0) {
    tried.push("template");
    const draft = layoutFromDoorCount(count, input.center, input.address ?? "", true);
    return { tried, needsDoorCount: false, draft: annotate(draft, input, 0) };
  }

  const visionDoors = input.vision?.marks.filter((mark) => mark.kind === "door").length ?? 0;
  if (input.vision && visionDoors > 0) {
    tried.push("photo");
    let draft = layoutFromVision(input.vision, input.center, input.address ?? "");
    if (!draft.spots.length) {
      const spacing = layoutFromDoorCount(visionDoors, input.center, input.address ?? "", false);
      draft = { ...draft, spots: retagSpots(spacing, "Spacing beside the photo doors").spots };
    }
    return { tried, needsDoorCount: false, draft: annotate(draft, input, visionDoors) };
  }

  if (count && count > 0) {
    const fromListing = !typed && Boolean(listed);
    tried.push(fromListing ? "listing" : "door_count");
    const draft = layoutFromDoorCount(count, input.center, input.address ?? "", false);
    const doorLabel = fromListing ? "Listing door count" : "Door count you entered";
    draft.doors = draft.doors.map((door) => ({ ...door, sourceLabel: doorLabel }));
    draft.spots = draft.spots.map((spot) => ({ ...spot, sourceLabel: "Spacing beside that door count" }));
    draft.source = fromListing ? "listing" : "door_count";
    if (fromListing) {
      draft.note = `${count} doors use the listing count as a spacing guess. They stay drafts until you accept them.`;
    }
    return { tried, needsDoorCount: false, draft: annotate(draft, input, 0) };
  }

  return { draft: null, tried, needsDoorCount: true };
}
