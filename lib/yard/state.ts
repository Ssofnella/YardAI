import type { SiteConfigSnapshot, StatusDef } from "@/lib/domain/config";
import { asIso, asJson, asNumber, asText } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import { loadConfig, readClock, requireSite, type Clock, type ConfigRecord } from "@/lib/yard/context";
import type { VisitFlag } from "@/lib/yard/operations";

export type VisitView = {
  id: string;
  trailerId: string | null;
  trailerNumber: string;
  scac: string;
  carrierName: string;
  tractorNumber: string | null;
  driverName: string | null;
  sealIn: string | null;
  sealOut: string | null;
  loadId: string | null;
  appointmentId: string | null;
  appointmentCode: string | null;
  loadType: string | null;
  emptyOrLoaded: string | null;
  isReefer: boolean;
  setpointF: number | null;
  tempF: number | null;
  fuelPct: number | null;
  statusKey: string;
  locationKind: "spot" | "door" | "offsite";
  locationId: string | null;
  locationLabel: string | null;
  handling: "live" | "drop";
  customFields: Record<string, unknown>;
  photoIds: string[];
  flags: VisitFlag[];
  checkedInAt: string;
  checkedOutAt: string | null;
  workCompletedAt: string | null;
  minutesLate: number | null;
  plannedAt: string | null;
};

export type AppointmentView = {
  id: string;
  code: string;
  loadId: string | null;
  carrierName: string;
  scac: string;
  trailerNumber: string | null;
  driverName: string | null;
  tractorNumber: string | null;
  loadType: string;
  emptyOrLoaded: string;
  isReefer: boolean;
  setpointF: number | null;
  expectedSeal: string | null;
  plannedAt: string;
  status: string;
};

export type YardState = {
  site: {
    id: string;
    companyId: string;
    companyName: string;
    name: string;
    timezone: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    onboardedAt: string | null;
  };
  moveRequests: {
    id: string;
    visitId: string | null;
    trailerNumber: string | null;
    scac: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    priority: string;
    status: string;
    requestedAt: string;
  }[];
  suggestions: {
    id: string;
    eventType: string;
    occurredAt: string;
    trailerNumber: string | null;
    location: string | null;
    payload: Record<string, unknown>;
  }[];
  config: ConfigRecord;
  versions: { id: string; version: number; note: string | null; createdAt: string }[];
  clock: Clock;
  carriers: { name: string; scac: string }[];
  appointments: AppointmentView[];
  visits: VisitView[];
  eventCount: number;
  counts: {
    onYard: number;
    atDoors: number;
    alerts: number;
    expected: number;
    noShows: number;
    departed: number;
  };
};

export async function getYardState(db: Database): Promise<YardState> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const clock = await readClock(db, site.id);
  const versions = await db.query<Record<string, unknown>>(
    `select id, version, note, created_at from site_configs where site_id = $1 order by version desc`,
    [site.id],
  );
  const carriers = await db.query<{ name: string; scac: string }>(
    `select name, scac from carriers where company_id = $1 order by name`,
    [site.companyId],
  );
  const appointments = await db.query<Record<string, unknown>>(
    `select * from appointments where site_id = $1 order by planned_at`,
    [site.id],
  );
  const visits = await db.query<Record<string, unknown>>(
    `select * from visits where site_id = $1 and checked_out_at is null order by checked_in_at`,
    [site.id],
  );
  const departed = await db.query<{ count: number }>(
    `select count(*)::int as count from visits where site_id = $1 and checked_out_at is not null`,
    [site.id],
  );
  const eventCount = await db.query<{ count: number }>(
    `select count(*)::int as count from events where site_id = $1`,
    [site.id],
  );
  const moves = await db.query<Record<string, unknown>>(
    `select id, visit_id, trailer_number, scac, from_location, to_location, priority, status, requested_at
     from move_requests where site_id = $1 and status in ('requested', 'started')
     order by requested_at desc limit 20`,
    [site.id],
  );
  const suggestions = await db.query<Record<string, unknown>>(
    `select id, event_type, occurred_at, trailer_number, location, payload
     from events where site_id = $1 and event_type like 'ai.%'
     order by occurred_at desc limit 8`,
    [site.id],
  );
  const visitViews = visits.map(mapVisit);
  const appointmentViews = appointments.map(mapAppointment);
  return {
    site: {
      id: site.id,
      companyId: site.companyId,
      companyName: site.companyName,
      name: site.name,
      timezone: config.snapshot.timezone || site.timezone,
      address: site.address,
      latitude: site.latitude,
      longitude: site.longitude,
      onboardedAt: site.onboardedAt,
    },
    config,
    versions: versions.map((row) => ({
      id: String(row.id),
      version: Number(row.version),
      note: asText(row.note),
      createdAt: asIso(row.created_at) ?? "",
    })),
    clock,
    carriers,
    appointments: appointmentViews,
    visits: visitViews,
    eventCount: Number(eventCount[0]?.count ?? 0),
    moveRequests: moves.map((row) => ({
      id: String(row.id),
      visitId: asText(row.visit_id),
      trailerNumber: asText(row.trailer_number),
      scac: asText(row.scac),
      fromLocation: asText(row.from_location),
      toLocation: asText(row.to_location),
      priority: String(row.priority ?? "normal"),
      status: String(row.status ?? "requested"),
      requestedAt: asIso(row.requested_at) ?? "",
    })),
    suggestions: suggestions.map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type),
      occurredAt: asIso(row.occurred_at) ?? "",
      trailerNumber: asText(row.trailer_number),
      location: asText(row.location),
      payload: asJson<Record<string, unknown>>(row.payload, {}),
    })),
    counts: {
      onYard: visitViews.length,
      atDoors: visitViews.filter((visit) => visit.locationKind === "door").length,
      alerts: visitViews.filter((visit) => visit.flags.length > 0).length,
      expected: appointmentViews.filter((item) => item.status === "expected").length,
      noShows: appointmentViews.filter((item) => item.status === "no_show").length,
      departed: Number(departed[0]?.count ?? 0),
    },
  };
}

export async function listEvents(
  db: Database,
  limit = 200,
): Promise<Record<string, unknown>[]> {
  const site = await requireSite(db);
  return db.query(
    `select id, event_type, trailer_id, trailer_number, scac, load_id, appointment_id,
            location, occurred_at, source, visit_id, payload
     from events
     where site_id = $1
     order by occurred_at desc, created_at desc
     limit $2`,
    [site.id, limit],
  );
}

function mapVisit(row: Record<string, unknown>): VisitView {
  return {
    id: String(row.id),
    trailerId: asText(row.trailer_id),
    trailerNumber: String(row.trailer_number),
    scac: String(row.scac),
    carrierName: String(row.carrier_name),
    tractorNumber: asText(row.tractor_number),
    driverName: asText(row.driver_name),
    sealIn: asText(row.seal_in),
    sealOut: asText(row.seal_out),
    loadId: asText(row.load_id),
    appointmentId: asText(row.appointment_id),
    appointmentCode: asText(row.appointment_code),
    loadType: asText(row.load_type),
    emptyOrLoaded: asText(row.empty_or_loaded),
    isReefer: Boolean(row.is_reefer),
    setpointF: asNumber(row.setpoint_f),
    tempF: asNumber(row.temp_f),
    fuelPct: asNumber(row.fuel_pct),
    statusKey: String(row.status_key),
    locationKind: String(row.location_kind) as VisitView["locationKind"],
    locationId: asText(row.location_id),
    locationLabel: asText(row.location_label),
    handling: (row.handling === "live" ? "live" : "drop"),
    customFields: asJson(row.custom_fields, {}),
    photoIds: asJson<string[]>(row.photo_ids, []),
    flags: asJson<VisitFlag[]>(row.flags, []),
    checkedInAt: asIso(row.checked_in_at) ?? "",
    checkedOutAt: asIso(row.checked_out_at),
    workCompletedAt: asIso(row.work_completed_at),
    minutesLate: asNumber(row.minutes_late),
    plannedAt: asIso(row.planned_at),
  };
}

function mapAppointment(row: Record<string, unknown>): AppointmentView {
  return {
    id: String(row.id),
    code: String(row.appointment_code),
    loadId: asText(row.load_id),
    carrierName: String(row.carrier_name),
    scac: String(row.scac),
    trailerNumber: asText(row.trailer_number),
    driverName: asText(row.driver_name),
    tractorNumber: asText(row.tractor_number),
    loadType: String(row.load_type),
    emptyOrLoaded: String(row.empty_or_loaded),
    isReefer: Boolean(row.is_reefer),
    setpointF: asNumber(row.setpoint_f),
    expectedSeal: asText(row.expected_seal),
    plannedAt: asIso(row.planned_at) ?? "",
    status: String(row.status),
  };
}

export type { SiteConfigSnapshot, StatusDef };
