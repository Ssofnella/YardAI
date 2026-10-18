import type { SiteConfigSnapshot } from "@/lib/domain/config";
import { YardError } from "@/lib/db/types";

export type Placement = {
  kind: "spot" | "door";
  id: string;
  label: string;
  spotType?: string;
  doorType?: string;
};

export function placementById(
  config: SiteConfigSnapshot,
  kind: "spot" | "door",
  id: string,
): Placement {
  if (kind === "door") {
    const door = config.doors.find((item) => item.id === id);
    if (!door) throw new YardError("That door is not on this site");
    return { kind, id: door.id, label: `Door ${door.name}`, doorType: door.type };
  }
  const spot = config.spots.find((item) => item.id === id);
  if (!spot) throw new YardError("That spot is not on this site");
  if (spot.type === "out_of_service") {
    throw new YardError(`${spot.name} is out of service`);
  }
  return { kind, id: spot.id, label: `Spot ${spot.name}`, spotType: spot.type };
}

export function placementByName(config: SiteConfigSnapshot, name: string): Placement | null {
  const door = config.doors.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (door) return { kind: "door", id: door.id, label: `Door ${door.name}`, doorType: door.type };
  const spot = config.spots.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!spot || spot.type === "out_of_service") return null;
  return { kind: "spot", id: spot.id, label: `Spot ${spot.name}`, spotType: spot.type };
}

export function choosePlace(
  config: SiteConfigSnapshot,
  occupied: Set<string>,
  preferredName: string | undefined,
  kind: "spot" | "door",
): Placement {
  if (preferredName) {
    const named = placementByName(config, preferredName);
    if (named && named.kind === kind && !occupied.has(named.id)) return named;
  }
  if (kind === "door") {
    const door = config.doors.find((item) => !occupied.has(item.id));
    if (door) return { kind, id: door.id, label: `Door ${door.name}`, doorType: door.type };
  } else {
    const spot = config.spots.find(
      (item) => item.type !== "out_of_service" && !occupied.has(item.id),
    );
    if (spot) return { kind, id: spot.id, label: `Spot ${spot.name}`, spotType: spot.type };
  }
  throw new YardError(`No open ${kind === "door" ? "door" : "spot"}`);
}
