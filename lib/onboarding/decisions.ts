import type { LayoutDraft, LayoutDoor, LayoutSpot } from "@/lib/onboarding/layout";

export type LayoutDecision = {
  eventType: "ai.suggested" | "ai.accepted" | "ai.dismissed";
  payload: Record<string, unknown>;
};

function itemDecision(kind: "door" | "spot", item: LayoutDoor | LayoutSpot): LayoutDecision[] {
  const accepted = item.status === "accepted" || item.status === "edited";
  const payload = {
    suggestionId: `layout:${item.key}`,
    kind: "layout",
    itemKind: kind,
    name: item.name,
    confidence: item.confidence,
    sourceLabel: item.sourceLabel ?? item.provenance,
    provenance: item.provenance,
    status: item.status,
  };
  return [
    { eventType: "ai.suggested", payload },
    {
      eventType: accepted ? "ai.accepted" : "ai.dismissed",
      payload: { ...payload, accepted },
    },
  ];
}

/** One suggestion event and one accept or dismiss event per door, spot, and listing fact. */
export function layoutDecisions(draft: LayoutDraft): LayoutDecision[] {
  const decisions = [
    ...draft.doors.flatMap((door) => itemDecision("door", door)),
    ...draft.spots.flatMap((spot) => itemDecision("spot", spot)),
  ];
  const kept = draft.listingAccepted !== false;
  for (const line of draft.factLines ?? []) {
    const payload = {
      suggestionId: `listing:${line}`,
      kind: "listing_fact",
      display: line,
    };
    decisions.push({ eventType: "ai.suggested", payload });
    decisions.push({
      eventType: kept ? "ai.accepted" : "ai.dismissed",
      payload: { ...payload, accepted: kept },
    });
  }
  return decisions;
}
