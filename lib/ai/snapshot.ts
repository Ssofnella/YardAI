import { dwellMinutes } from "@/lib/domain/dwell";
import { asIso, asNumber, asText } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import type { ArrivalRequest, AskContext, DoorSlot, OptimizeInput, RecommendInput, RiskInput, SpotSlot } from "@/lib/ai/types";
import { loadConfig, requireSite } from "@/lib/yard/context";

type VisitRow = {
  id: string;
  trailer_number: string;
  scac: string;
  is_reefer: boolean;
  fuel_pct: number | null;
  handling: string;
  location_kind: string;
  location_id: string | null;
  location_label: string | null;
  status_key: string;
  work_completed_at: unknown;
  checked_in_at: unknown;
  empty_or_loaded: string | null;
  flags: unknown;
};

async function onsite(db: Database, siteId: string): Promise<VisitRow[]> {
  return db.query<VisitRow>(
    `select id, trailer_number, scac, is_reefer, fuel_pct, handling, location_kind, location_id,
            location_label, status_key, work_completed_at, checked_in_at, empty_or_loaded, flags
     from visits where site_id = $1 and checked_out_at is null`,
    [siteId],
  );
}

function slots(snapshotDoors: { id: string; name: string; type: DoorSlot["type"]; sort: number }[], snapshotSpots: { id: string; name: string; type: SpotSlot["type"]; zoneId: string; row: number; col: number }[], zones: { id: string; sort: number }[], occupied: Set<string>) {
  const zoneSort = new Map(zones.map((zone) => [zone.id, zone.sort]));
  const doors: DoorSlot[] = snapshotDoors.map((door) => ({
    id: door.id,
    name: door.name,
    type: door.type,
    sort: door.sort,
    occupied: occupied.has(door.id),
  }));
  const spots: SpotSlot[] = snapshotSpots.map((spot) => ({
    id: spot.id,
    name: spot.name,
    type: spot.type,
    zoneId: spot.zoneId,
    zoneSort: zoneSort.get(spot.zoneId) ?? 1,
    row: spot.row,
    col: spot.col,
    occupied: occupied.has(spot.id),
  }));
  return { doors, spots };
}

export async function recommendInput(
  db: Database,
  now: string,
  request: ArrivalRequest,
): Promise<RecommendInput> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const visits = await onsite(db, site.id);
  const occupied = new Set(visits.map((visit) => visit.location_id).filter((id): id is string => Boolean(id)));
  const { doors, spots } = slots(config.snapshot.doors, config.snapshot.spots, config.snapshot.zones, occupied);
  return { now, request, doors, spots };
}

export async function optimizeInput(db: Database, now: string): Promise<OptimizeInput> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const visits = await onsite(db, site.id);
  const occupied = new Set(visits.map((visit) => visit.location_id).filter((id): id is string => Boolean(id)));
  const { doors, spots } = slots(config.snapshot.doors, config.snapshot.spots, config.snapshot.zones, occupied);
  const appointments = await db.query<Record<string, unknown>>(
    `select appointment_code, is_reefer, planned_at, empty_or_loaded, status
     from appointments where site_id = $1 and status = 'expected'`,
    [site.id],
  );
  return {
    now,
    freeTimeMinutes: config.snapshot.policies.freeTimeMinutes,
    lowFuelPct: config.snapshot.reefer.minFuelPct,
    doors,
    spots,
    visits: visits.map((visit) => ({
      id: visit.id,
      trailerNumber: visit.trailer_number,
      scac: visit.scac,
      isReefer: Boolean(visit.is_reefer),
      fuelPct: asNumber(visit.fuel_pct),
      handling: visit.handling === "live" ? "live" : "drop",
      locationKind: visit.location_kind === "door" ? "door" : visit.location_kind === "spot" ? "spot" : "offsite",
      locationId: visit.location_id ?? "",
      locationName: visit.location_label ?? "Yard",
      statusKey: visit.status_key,
      flags: flagCodes(visit.flags),
      workCompletedAt: asIso(visit.work_completed_at),
      dwellMinutes: dwellMinutes(asIso(visit.checked_in_at) ?? now, now),
      emptyOrLoaded: asText(visit.empty_or_loaded),
    })),
    upcoming: appointments.map((row) => ({
      code: String(row.appointment_code),
      isReefer: Boolean(row.is_reefer),
      plannedAt: asIso(row.planned_at) ?? now,
      emptyOrLoaded: String(row.empty_or_loaded ?? "loaded"),
    })),
  };
}

export async function askContext(db: Database, now: string): Promise<AskContext> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const visits = await onsite(db, site.id);
  const appointments = await db.query<Record<string, unknown>>(
    `select appointment_code, status, planned_at, is_reefer, trailer_number, carrier_name
     from appointments where site_id = $1 order by planned_at`,
    [site.id],
  );
  return {
    now,
    freeTimeMinutes: config.snapshot.policies.freeTimeMinutes,
    lowFuelPct: config.snapshot.reefer.minFuelPct,
    visits: visits.map((visit) => ({
      trailerNumber: visit.trailer_number,
      scac: visit.scac,
      isReefer: Boolean(visit.is_reefer),
      dwellMinutes: dwellMinutes(asIso(visit.checked_in_at) ?? now, now),
      fuelPct: asNumber(visit.fuel_pct),
      locationName: asText(visit.location_label),
      statusKey: visit.status_key,
      emptyOrLoaded: asText(visit.empty_or_loaded),
      flags: flagCodes(visit.flags),
    })),
    appointments: appointments.map((row) => ({
      code: String(row.appointment_code),
      status: String(row.status),
      plannedAt: asIso(row.planned_at) ?? now,
      isReefer: Boolean(row.is_reefer),
      trailerNumber: asText(row.trailer_number),
      carrierName: String(row.carrier_name ?? ""),
    })),
  };
}

export async function riskInput(db: Database, now: string): Promise<RiskInput> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const visits = await onsite(db, site.id);
  const appointments = await db.query<Record<string, unknown>>(
    `select appointment_code, trailer_number, status, planned_at, is_reefer
     from appointments where site_id = $1`,
    [site.id],
  );
  return {
    now,
    freeTimeMinutes: config.snapshot.policies.freeTimeMinutes,
    warnBeforeMinutes: config.snapshot.policies.warnBeforeMinutes,
    graceMinutes: config.snapshot.policies.graceMinutes,
    lowFuelPct: config.snapshot.reefer.minFuelPct,
    visits: visits.map((visit) => ({
      id: visit.id,
      trailerNumber: visit.trailer_number,
      scac: visit.scac,
      isReefer: Boolean(visit.is_reefer),
      fuelPct: asNumber(visit.fuel_pct),
      dwellMinutes: dwellMinutes(asIso(visit.checked_in_at) ?? now, now),
      locationName: asText(visit.location_label),
    })),
    appointments: appointments.map((row) => ({
      code: String(row.appointment_code),
      trailerNumber: asText(row.trailer_number),
      status: String(row.status),
      plannedAt: asIso(row.planned_at) ?? now,
      isReefer: Boolean(row.is_reefer),
    })),
  };
}

function flagCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" && "code" in item ? String(item.code) : ""))
    .filter(Boolean);
}
