import type {
  DoorSlot,
  OptimizeInput,
  OptimizeMove,
  PlaceChoice,
  PlaceRecommendation,
  RecommendInput,
  RiskFlag,
  RiskInput,
  SpotSlot,
} from "@/lib/ai/types";

function minutesBetween(laterIso: string, earlierIso: string): number {
  const delta = new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  if (Number.isNaN(delta)) return 0;
  return Math.round(delta / 60_000);
}

function doorPowered(door: DoorSlot): boolean {
  return door.type === "reefer" || door.type === "both";
}

function handlingFor(input: RecommendInput): "live" | "drop" {
  const request = input.request;
  if (request.restrict === "holding") return "drop";
  if (request.handling === "live" || request.handling === "drop") return request.handling;
  if (request.emptyOrLoaded === "empty") return "drop";
  if (request.plannedAt) {
    const delta = minutesBetween(request.plannedAt, input.now);
    if (delta > 90) return "drop";
  }
  return "live";
}

function duePhrase(input: RecommendInput): string | null {
  if (!input.request.plannedAt) return null;
  const delta = minutesBetween(input.request.plannedAt, input.now);
  if (delta > 90) return "The appointment is later, so this stays off a door.";
  if (Math.abs(delta) <= 45) return "The appointment is due.";
  return null;
}

type Ranked = Omit<PlaceRecommendation, "provider">;

function choice(kind: "door" | "spot", id: string, name: string, type: string): PlaceChoice {
  return { kind, id, name, type };
}

export function rankPlaces(input: RecommendInput): Ranked[] {
  const handling = handlingFor(input);
  const due = duePhrase(input);
  const ranked: Ranked[] = [];
  const reefer = input.request.isReefer;

  if (input.request.restrict === "holding") {
    for (const spot of input.spots) {
      if (spot.occupied || spot.type !== "holding") continue;
      const score = 500 - spot.row * 10 - spot.col;
      ranked.push({
        suggestionId: `rec:${spot.id}:hold`,
        place: choice("spot", spot.id, spot.name, spot.type),
        score,
        factors: ["holding", "first open"],
        reason: `Spot ${spot.name} is the first open holding spot for this hold.`,
      });
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  if (handling === "live") {
    const compatible = input.doors.filter((door) => {
      if (door.occupied) return false;
      return reefer ? doorPowered(door) : true;
    });
    const blockedCloser = input.doors.filter(
      (door) => door.occupied && (reefer ? doorPowered(door) : true),
    );
    for (const door of compatible) {
      const nearerBusy = blockedCloser.filter((other) => other.sort < door.sort);
      const factors = [
        reefer ? "reefer power" : "dry or either door",
        `walk ${door.sort}`,
        nearerBusy.length ? "closer doors are working" : "closest open",
      ];
      const closerNote = nearerBusy.length
        ? ` Door ${nearerBusy[0]?.name ?? "nearby"} is closer but it is working.`
        : "";
      const powerNote = reefer ? " with reefer power" : "";
      const dueNote = due ? ` ${due}` : "";
      ranked.push({
        suggestionId: `rec:${door.id}:${reefer ? "reefer" : "dry"}:live`,
        place: choice("door", door.id, door.name, door.type),
        score: (reefer ? 1100 : 1000) - door.sort * 25,
        factors,
        reason: `Door ${door.name} is the closest open door${powerNote}.${closerNote}${dueNote}`.replace(
          /\s+/g,
          " ",
        ),
      });
    }
    if (!ranked.length) {
      for (const spot of input.spots) {
        if (spot.occupied || spot.type !== "staging") continue;
        ranked.push({
          suggestionId: `rec:${spot.id}:stage`,
          place: choice("spot", spot.id, spot.name, spot.type),
          score: 200 - spot.row * 10 - spot.col,
          factors: ["no open door", "staging"],
          reason: `No open door. Stage on ${spot.name} until a door frees.`,
        });
      }
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  if (reefer) {
    for (const spot of input.spots) {
      if (spot.occupied || spot.type !== "reefer") continue;
      const factors = ["reefer power", "drop", "short hostler pull"];
      if (due) factors.push("appointment later");
      ranked.push({
        suggestionId: `rec:${spot.id}:reefer:drop`,
        place: choice("spot", spot.id, spot.name, spot.type),
        score: 1000 - spot.zoneSort * 50 - spot.row * 20 - spot.col * 5,
        factors,
        reason: `Spot ${spot.name} has power and is the closest open reefer spot.${due ? ` ${due}` : ""}`,
      });
    }
  } else if (input.request.emptyOrLoaded === "empty") {
    for (const spot of input.spots) {
      if (spot.occupied || spot.type !== "dry") continue;
      ranked.push({
        suggestionId: `rec:${spot.id}:empty`,
        place: choice("spot", spot.id, spot.name, spot.type),
        score: spot.zoneSort * 100 + spot.row * 10 + spot.col,
        factors: ["empty", "off the dock", "longer hostler pull"],
        reason: `Spot ${spot.name} keeps this empty off the dock and off the reefer row.`,
      });
    }
  } else {
    for (const spot of input.spots) {
      if (spot.occupied || (spot.type !== "dry" && spot.type !== "staging")) continue;
      ranked.push({
        suggestionId: `rec:${spot.id}:drop`,
        place: choice("spot", spot.id, spot.name, spot.type),
        score: 600 - spot.zoneSort * 30 - spot.row * 20 - spot.col * 5 - (spot.type === "staging" ? 30 : 0),
        factors: ["drop", "closest open spot"],
        reason: `Spot ${spot.name} is the closest open drop spot. No door is needed until the appointment.${due ? ` ${due}` : ""}`,
      });
    }
  }

  return ranked.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
}

export function recommendPlace(input: RecommendInput): PlaceRecommendation {
  const ranked = rankPlaces(input);
  const best = ranked[0];
  if (!best) {
    return {
      suggestionId: "rec:none",
      place: { kind: "spot", id: "", name: "—", type: "dry" },
      reason: "No open door or spot. Free one before this trailer comes through the gate.",
      score: 0,
      factors: ["none open"],
      provider: "heuristic",
    };
  }
  return { ...best, provider: "heuristic" };
}

function freeSpots(input: OptimizeInput, taken: Set<string>, types: Array<SpotSlot["type"]>): SpotSlot[] {
  return input.spots
    .filter((spot) => types.includes(spot.type) && !spot.occupied && !taken.has(spot.id))
    .sort((a, b) => a.zoneSort - b.zoneSort || a.row - b.row || a.col - b.col || a.name.localeCompare(b.name));
}

function doorById(input: OptimizeInput, id: string): DoorSlot | undefined {
  return input.doors.find((door) => door.id === id);
}

function spotById(input: OptimizeInput, id: string): SpotSlot | undefined {
  return input.spots.find((spot) => spot.id === id);
}

export function proposeMoves(input: OptimizeInput): OptimizeMove[] {
  const taken = new Set<string>();
  for (const visit of input.visits) {
    if (visit.locationId) taken.add(visit.locationId);
  }
  const drafts: Omit<OptimizeMove, "rank">[] = [];
  const usedVisits = new Set<string>();
  const held = (visit: OptimizeInput["visits"][number]) =>
    visit.statusKey === "hold" || visit.flags?.includes("hold") === true;

  for (const visit of input.visits) {
    if (held(visit)) continue;
    if (!visit.isReefer || visit.fuelPct == null || visit.fuelPct > input.lowFuelPct) continue;
    if (visit.locationKind === "door") {
      const door = doorById(input, visit.locationId);
      if (door && doorPowered(door)) continue;
    }
    if (visit.locationKind === "spot") {
      const spot = spotById(input, visit.locationId);
      if (spot?.type === "reefer") continue;
    }
    const target = freeSpots(input, taken, ["reefer"])[0];
    if (!target) continue;
    taken.delete(visit.locationId);
    taken.add(target.id);
    usedVisits.add(visit.id);
    drafts.push({
      id: `${visit.id}->${target.id}`,
      visitId: visit.id,
      trailerNumber: visit.trailerNumber,
      scac: visit.scac,
      kind: "respot",
      fromName: visit.locationName,
      to: choice("spot", target.id, target.name, target.type),
      reason: `Fuel is ${visit.fuelPct}% and ${visit.locationName} has no power. ${target.name} keeps the unit running.`,
      benefit: {
        detentionMinutes: 25,
        dockIdleMinutes: 0,
        summary: "Avoids about 25 min of detention if the product warms and the load is refused.",
      },
    });
  }

  for (const visit of input.visits) {
    if (held(visit) || usedVisits.has(visit.id) || visit.locationKind !== "door") continue;
    const finished = Boolean(visit.workCompletedAt) || visit.statusKey === "done";
    if (!finished) continue;
    const target = freeSpots(input, taken, ["staging", "dry"])[0];
    if (!target) continue;
    taken.delete(visit.locationId);
    taken.add(target.id);
    usedVisits.add(visit.id);
    drafts.push({
      id: `${visit.id}->${target.id}`,
      visitId: visit.id,
      trailerNumber: visit.trailerNumber,
      scac: visit.scac,
      kind: "door_swap",
      fromName: visit.locationName,
      to: choice("spot", target.id, target.name, target.type),
      reason: `Work is finished on ${visit.trailerNumber}. Pulling it to ${target.name} frees ${visit.locationName}.`,
      benefit: {
        detentionMinutes: 0,
        dockIdleMinutes: 45,
        summary: "Frees about 45 min of dock time for the next appointment.",
      },
    });
  }

  const soon = input.upcoming.filter((item) => {
    const delta = minutesBetween(item.plannedAt, input.now);
    return delta >= -15 && delta <= 90;
  });
  if (soon.length) {
    const needReefer = soon.some((item) => item.isReefer);
    const needDry = soon.some((item) => !item.isReefer);
    const freeDoor = (powered: boolean) =>
      input.doors.some((door) => !taken.has(door.id) && (powered ? doorPowered(door) : !doorPowered(door) || door.type === "both" || door.type === "dry"));
    for (const visit of input.visits) {
      if (held(visit) || usedVisits.has(visit.id) || visit.locationKind !== "door" || visit.handling !== "drop") continue;
      if (visit.statusKey === "loading" || visit.statusKey === "unloading") continue;
      const door = doorById(input, visit.locationId);
      if (!door) continue;
      const blocksReefer = needReefer && doorPowered(door) && !freeDoor(true);
      const blocksDry = needDry && !freeDoor(false);
      if (!blocksReefer && !blocksDry) continue;
      const target = freeSpots(input, taken, ["dry", "staging"])[0];
      if (!target) continue;
      const next = soon[0];
      const until = Math.max(10, Math.min(90, minutesBetween(next.plannedAt, input.now)));
      taken.delete(visit.locationId);
      taken.add(target.id);
      usedVisits.add(visit.id);
      drafts.push({
        id: `${visit.id}->${target.id}`,
        visitId: visit.id,
        trailerNumber: visit.trailerNumber,
        scac: visit.scac,
        kind: "door_swap",
        fromName: visit.locationName,
        to: choice("spot", target.id, target.name, target.type),
        reason: `${visit.trailerNumber} is a drop on ${visit.locationName}. ${next.code} is due and no matching door is open.`,
        benefit: {
          detentionMinutes: 15,
          dockIdleMinutes: until,
          summary: `Frees about ${until} min of dock time. The drop picks up about 15 min of yard dwell.`,
        },
      });
    }
  }

  return drafts
    .sort((a, b) => {
      const score = (move: Omit<OptimizeMove, "rank">) =>
        move.benefit.detentionMinutes * 2 + move.benefit.dockIdleMinutes;
      return score(b) - score(a) || a.trailerNumber.localeCompare(b.trailerNumber);
    })
    .slice(0, 6)
    .map((move, index) => ({ ...move, rank: index + 1 }));
}

export function riskFlags(input: RiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const visit of input.visits) {
    if (visit.dwellMinutes >= input.freeTimeMinutes) {
      flags.push({
        id: `det-${visit.id}`,
        kind: "detention",
        severity: "now",
        subject: visit.trailerNumber,
        visitId: visit.id,
        detail: `${visit.trailerNumber} has been here ${visit.dwellMinutes} min. Free time is ${input.freeTimeMinutes} min.`,
      });
    } else if (visit.dwellMinutes >= input.freeTimeMinutes - input.warnBeforeMinutes) {
      flags.push({
        id: `det-${visit.id}`,
        kind: "detention",
        severity: "watch",
        subject: visit.trailerNumber,
        visitId: visit.id,
        detail: `${visit.trailerNumber} has ${input.freeTimeMinutes - visit.dwellMinutes} min of free time left.`,
      });
    }
    if (visit.isReefer && visit.fuelPct != null && visit.fuelPct <= input.lowFuelPct) {
      flags.push({
        id: `fuel-${visit.id}`,
        kind: "reefer_fuel",
        severity: visit.fuelPct <= input.lowFuelPct / 2 ? "now" : "watch",
        subject: visit.trailerNumber,
        visitId: visit.id,
        detail: `${visit.trailerNumber} reefer fuel is ${visit.fuelPct}% at ${visit.locationName ?? "the yard"}. Floor is ${input.lowFuelPct}%.`,
      });
    }
  }
  for (const appointment of input.appointments) {
    if (appointment.status !== "expected") continue;
    const lateBy = minutesBetween(input.now, appointment.plannedAt);
    if (lateBy > input.graceMinutes) {
      flags.push({
        id: `late-${appointment.code}`,
        kind: "late_appointment",
        severity: "now",
        subject: appointment.code,
        appointmentCode: appointment.code,
        detail: `${appointment.code} is ${lateBy} min past the window and not at the gate.`,
      });
    } else if (lateBy >= -15) {
      flags.push({
        id: `late-${appointment.code}`,
        kind: "late_appointment",
        severity: "watch",
        subject: appointment.code,
        appointmentCode: appointment.code,
        detail: `${appointment.code} is inside the arrival window and has not checked in.`,
      });
    }
  }
  const order = { now: 0, watch: 1 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject));
}
