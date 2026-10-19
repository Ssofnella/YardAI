import type { SiteConfigSnapshot } from "@/lib/domain/config";
import { validateSnapshot } from "@/lib/domain/config";
import { createEvent, type EventSource, type YardEvent } from "@/lib/domain/events";
import type { CsvArrival } from "@/lib/onboarding/csv";
import { parseAppointmentEmail, senderAllowed } from "@/lib/onboarding/email";
import { matchArrival, type ArrivalKey } from "@/lib/domain/matching";
import { fuelMarkToPct, reeferAlerts } from "@/lib/domain/reefer";
import { checkSeals } from "@/lib/domain/seals";
import { canClearTemp, resolveSealFlow, type SealDecision } from "@/lib/domain/seal-flow";
import type { Database, Sql } from "@/lib/db/types";
import { YardError } from "@/lib/db/types";
import { asIso, asJson } from "@/lib/db/json";
import { loadConfig, occupiedLocationIds, readClock, requireSite, type SiteContext } from "@/lib/yard/context";
import { insertEvent } from "@/lib/yard/event-store";
import { choosePlace, placementById, placementByName, type Placement } from "@/lib/yard/locations";

export type VisitFlag = { code: string; detail: string };

export type CheckInInput = {
  trailerNumber: string;
  scac: string;
  carrierName?: string | null;
  tractorNumber?: string | null;
  driverName?: string | null;
  sealNumber?: string | null;
  loadType?: string | null;
  loadId?: string | null;
  emptyOrLoaded?: string | null;
  isReefer?: boolean;
  setpointF?: number | null;
  tempF?: number | null;
  fuelPct?: number | null;
  appointmentId?: string | null;
  locationKind?: "spot" | "door";
  locationId?: string | null;
  preferredPlace?: string | null;
  photoId?: string | null;
  customFields?: Record<string, unknown>;
  statusKey?: string | null;
  occurredAt?: string | Date;
  source: EventSource;
  /** Client outbox id. A repeat of the same id is a no-op. */
  commandId?: string | null;
  /** Client UUID for the gate.check_in event. */
  eventId?: string | null;
  /** Stamped when New arrival was tapped. May be earlier than submit time. */
  arrivedAt?: string | null;
  arrivalReason?: string | null;
  deviceId?: string | null;
  deviceTime?: string | null;
  sealDecision?: SealDecision | null;
  sealReason?: string | null;
  unitRunning?: boolean | null;
  fuelLevel?: string | null;
  gateName?: string | null;
  /** What the clerk saw, and whether they kept it. Logged as AI events. */
  ai?: {
    suggestionId: string;
    placeKind: "door" | "spot";
    placeId: string;
    placeName: string;
    reason: string;
    provider: "heuristic" | "model";
    accepted: boolean;
  } | null;
};

export type OperationResult = {
  visitId: string | null;
  events: YardEvent[];
  flags: VisitFlag[];
  notice: string | null;
  duplicate?: boolean;
};

type AppointmentRow = {
  id: string;
  appointment_code: string;
  load_id: string | null;
  carrier_name: string;
  scac: string;
  trailer_number: string | null;
  trailer_id: string | null;
  driver_name: string | null;
  tractor_number: string | null;
  load_type: string;
  empty_or_loaded: string;
  is_reefer: boolean;
  setpoint_f: number | null;
  planned_at: string | Date;
  expected_seal: string | null;
  status: string;
};

export async function performCheckIn(db: Database, input: CheckInInput): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const config = await loadConfig(tx, site);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const commandId = blank(input.commandId);
    if (commandId) {
      const prior = await tx.query<{ visit_id: string | null }>(
        `select visit_id from events
         where event_type = 'gate.check_in' and payload->>'commandId' = $1
         limit 1`,
        [commandId],
      );
      if (prior[0]) {
        return {
          visitId: prior[0].visit_id,
          events: [],
          flags: [],
          notice: "Already saved",
          duplicate: true,
        };
      }
    }
    const arrivedAt = resolveArrivalStamp(occurredAt, input.arrivedAt, input.arrivalReason);
    const trailerNumber = input.trailerNumber.trim();
    const scac = input.scac.trim().toUpperCase();
    if (!trailerNumber || !scac) throw new YardError("Trailer number and SCAC are required");

    const appointments = await tx.query<AppointmentRow>(
      `select * from appointments where site_id = $1 and status <> 'cancelled' order by planned_at`,
      [site.id],
    );
    const selected = (input.appointmentId ?? "").trim();
    if (selected) {
      const chosen = appointments.find(
        (row) => row.id === selected || row.appointment_code.toLowerCase() === selected.toLowerCase(),
      );
      if (chosen && chosen.status !== "expected") {
        const existing = await visitForAppointment(tx, site.id, chosen.id);
        if (existing) {
          return { visitId: existing, events: [], flags: [], notice: "Already checked in" };
        }
        throw new YardError(`Appointment ${chosen.appointment_code} is already ${chosen.status}`);
      }
    }

    const expected = appointments.filter((row) => row.status === "expected");
    const match = matchArrival(
      {
        trailerNumber,
        scac,
        loadId: input.loadId,
        appointmentId: input.appointmentId,
      },
      expected.map(toArrivalKey),
    );

    const isReefer = Boolean(input.isReefer);
    assertRequiredFields(config.snapshot, input, isReefer);

    const occupied = await occupiedLocationIds(tx, site.id);
    let placement = resolveCheckInPlace(config.snapshot, occupied, input);

    const emptyOrLoaded = input.emptyOrLoaded === "empty" ? "empty" : "loaded";
    const loadType = (input.loadType || "inbound").trim();
    const carrierName =
      input.carrierName?.trim() ||
      (await carrierNameFor(tx, site.companyId, scac)) ||
      "Unknown carrier";
    const fuelFromMark = fuelMarkToPct(input.fuelLevel);
    const fuelPct = fuelFromMark ?? input.fuelPct ?? null;
    const alerts = reeferAlerts(
      {
        isReefer,
        setpointF: input.setpointF ?? null,
        tempF: input.tempF ?? null,
        fuelPct,
        fuelLevel: input.fuelLevel ?? null,
        unitRunning: input.unitRunning ?? null,
      },
      {
        ...config.snapshot.reefer,
        lowFuelAtOrBelow: config.snapshot.policies.lowFuelAtOrBelow,
      },
    );

    const matched = match.appointment;
    const appointment = matched ? (expected.find((row) => row.id === matched.id) ?? null) : null;
    const expectedSeal = appointment?.expected_seal ?? null;
    const sealFlow = resolveSealFlow({
      expectedSeal,
      foundSeal: input.sealNumber,
      decision: input.sealDecision,
      reason: input.sealReason,
      policy: config.snapshot.policies.sealMismatchPolicy,
      loaded: emptyOrLoaded === "loaded",
    });
    if (sealFlow.error) throw new YardError(sealFlow.error);
    if (sealFlow.hold && placement.spotType !== "holding") {
      const holding = config.snapshot.spots.find(
        (spot) => spot.type === "holding" && !occupied.has(spot.id),
      );
      if (holding) placement = placementById(config.snapshot, "spot", holding.id);
    }
    if (occupied.has(placement.id)) throw new YardError(`${placement.label} is already occupied`);

    const flags: VisitFlag[] = [];
    if (match.idMismatch) {
      flags.push({ code: "id_mismatch", detail: match.reasons.join(" ") });
    }
    if (alerts.tempOutOfRange) {
      flags.push({
        code: "reefer_temp",
        detail: alerts.reasons.find((reason) => reason.startsWith("Reefer")) ?? "Temperature",
      });
    }
    if (alerts.fuelLow) {
      flags.push({
        code: "reefer_fuel",
        detail: alerts.reasons.find((reason) => reason.startsWith("Fuel")) ?? "Fuel",
      });
    }
    if (alerts.unitOff) flags.push({ code: "reefer_unit", detail: "Unit not running." });
    if (sealFlow.flag) {
      flags.push({
        code: sealFlow.missing ? "seal_missing" : "seal_mismatch",
        detail: sealFlow.missing
          ? "No seal on a trailer that has an expected seal."
          : `Seal ${input.sealNumber?.trim() || "(blank)"} does not match the expected seal.`,
      });
    }
    if (sealFlow.hold) {
      flags.push({
        code: "hold",
        detail: input.sealReason?.trim() || "Seal hold",
      });
    }
    if (isReefer && placement.kind === "door" && placement.doorType === "dry") {
      flags.push({
        code: "door_not_reefer",
        detail: `${placement.label} is a dry door`,
      });
    }

    const trailerId = await upsertTrailer(tx, site.companyId, trailerNumber, scac, isReefer);
    await upsertCarrier(tx, site.companyId, carrierName, scac);
    if (input.driverName?.trim()) await upsertDriver(tx, site.companyId, input.driverName.trim());
    if (input.tractorNumber?.trim()) {
      await upsertTractor(tx, site.companyId, input.tractorNumber.trim(), scac);
    }

    const plannedAt = appointment ? asIso(appointment.planned_at) : null;
    const minutesLate =
      plannedAt && new Date(occurredAt).getTime() - new Date(plannedAt).getTime() > 15 * 60_000
        ? Math.round((new Date(occurredAt).getTime() - new Date(plannedAt).getTime()) / 60_000)
        : null;

    const statusKey =
      input.statusKey?.trim() ||
      (sealFlow.hold && config.snapshot.trailerStatuses.some((status) => status.key === "hold")
        ? "hold"
        : placement.kind === "door"
          ? loadType === "outbound"
            ? "loading"
            : "unloading"
          : emptyOrLoaded === "empty"
            ? "empty"
            : "loaded");

    const visitId = crypto.randomUUID();
    const handling = placement.kind === "door" ? "live" : "drop";
    const customFields = sanitizeCustom(input.customFields);
    if (input.photoId) customFields.photo = input.photoId;

    await tx.query(
      `insert into visits (
         id, site_id, company_id, trailer_id, trailer_number, scac, carrier_name,
         tractor_number, driver_name, seal_in, load_id, appointment_id, appointment_code,
         load_type, empty_or_loaded, is_reefer, setpoint_f, temp_f, fuel_pct, status_key,
         location_kind, location_id, location_label, handling, custom_fields, photo_ids,
         flags, checked_in_at, minutes_late, planned_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25::jsonb,$26::jsonb,$27::jsonb,$28,$29,$30
       )`,
      [
        visitId,
        site.id,
        site.companyId,
        trailerId,
        trailerNumber,
        scac,
        carrierName,
        blank(input.tractorNumber),
        blank(input.driverName),
        blank(input.sealNumber),
        blank(input.loadId) ?? appointment?.load_id ?? null,
        appointment?.id ?? null,
        appointment?.appointment_code ?? null,
        loadType,
        emptyOrLoaded,
        isReefer,
        input.setpointF ?? null,
        input.tempF ?? null,
        fuelPct,
        statusKey,
        placement.kind,
        placement.id,
        placement.label,
        handling,
        JSON.stringify(customFields),
        JSON.stringify(input.photoId ? [input.photoId] : []),
        JSON.stringify(flags),
        arrivedAt,
        minutesLate,
        plannedAt,
      ],
    );

    if (appointment) {
      await tx.query(`update appointments set status = 'arrived' where id = $1`, [appointment.id]);
    }

    const events: YardEvent[] = [];
    const base = {
      siteId: site.id,
      companyId: site.companyId,
      trailerId,
      trailerNumber,
      scac,
      loadId: blank(input.loadId) ?? appointment?.load_id ?? null,
      appointmentId: appointment?.appointment_code ?? null,
      location: placement.label,
      occurredAt,
      source: input.source,
      visitId,
    };

    if (match.idMismatch) {
      events.push(
        createEvent({
          ...base,
          eventType: "id.mismatch",
          payload: {
            reasons: match.reasons,
            matchMethod: match.matchMethod,
            expectedTrailerNumber: match.appointment?.trailerNumber ?? null,
            actualTrailerNumber: trailerNumber,
            expectedScac: match.appointment?.scac ?? null,
            actualScac: scac,
            expectedLoadId: match.appointment?.loadId ?? null,
            actualLoadId: blank(input.loadId),
          },
        }),
      );
    }
    events.push(
      createEvent({
        ...base,
        id: input.eventId?.trim() || undefined,
        eventType: "gate.check_in",
        payload: {
          carrierName,
          driverName: blank(input.driverName),
          tractorNumber: blank(input.tractorNumber),
          seal: blank(input.sealNumber),
          loadType,
          emptyOrLoaded,
          isReefer,
          handling,
          matchMethod: match.matchMethod,
          flags: flags.map((flag) => flag.code),
          minutesLate,
          arrivedAt,
          checkedInAt: occurredAt,
        },
      }),
    );
    if (arrivedAt !== occurredAt) {
      events.push(
        createEvent({
          ...base,
          eventType: "arrival.corrected",
          occurredAt: arrivedAt,
          payload: { arrivedAt, checkedInAt: occurredAt, reason: blank(input.arrivalReason) },
        }),
      );
    }
    if (sealFlow.flag) {
      events.push(
        createEvent({
          ...base,
          eventType: sealFlow.missing ? "seal.missing" : "seal.mismatch",
          payload: {
            expectedSeal,
            foundSeal: blank(input.sealNumber),
            decision: input.sealDecision ?? null,
            reason: blank(input.sealReason),
          },
        }),
      );
    }
    if (sealFlow.hold) {
      events.push(
        createEvent({
          ...base,
          eventType: "hold.placed",
          payload: { reason: blank(input.sealReason), locationId: placement.id },
        }),
      );
    }
    events.push(
      createEvent({
        ...base,
        eventType: placement.kind === "door" ? "door.assigned" : "spot.assigned",
        payload: { locationId: placement.id, handling },
      }),
    );
    if (blank(input.sealNumber)) {
      events.push(
        createEvent({
          ...base,
          eventType: "seal.applied",
          payload: { seal: input.sealNumber?.trim() },
        }),
      );
    }
    if (isReefer) {
      events.push(
        createEvent({
          ...base,
          eventType: "reefer.reading",
          payload: {
            setpointF: input.setpointF ?? null,
            tempF: input.tempF ?? null,
            fuelPct,
            fuelLevel: input.fuelLevel ?? null,
            unitRunning: input.unitRunning ?? null,
          },
        }),
      );
      if (alerts.outOfRange) {
        events.push(
          createEvent({
            ...base,
            eventType: "reefer.alert",
            payload: {
              reasons: alerts.reasons,
              tempOutOfRange: alerts.tempOutOfRange,
              fuelLow: alerts.fuelLow,
              unitOff: alerts.unitOff,
              deltaF: alerts.deltaF,
            },
          }),
        );
      }
    }
    if (placement.kind === "door") {
      events.push(
        createEvent({
          ...base,
          eventType: "door.work_started",
          payload: { statusKey },
        }),
      );
    }

    const meta = {
      configVersion: config.version,
      commandId,
      deviceId: blank(input.deviceId),
      deviceTime: blank(input.deviceTime),
      serverTime: occurredAt,
    };
    const stamped = events.map((event) =>
      createEvent({
        ...event,
        payload: { ...event.payload, ...meta },
      }),
    );
    for (const event of stamped) await insertEvent(tx, event);
    const aiEvents = arrivalSuggestionEvents({
      siteId: site.id,
      companyId: site.companyId,
      trailerId,
      trailerNumber,
      scac,
      loadId: blank(input.loadId) ?? appointment?.load_id ?? null,
      appointmentId: appointment?.appointment_code ?? null,
      location: placement.label,
      occurredAt,
      visitId,
      source: input.source,
      ai: input.ai,
    });
    for (const event of aiEvents) await insertEvent(tx, event);
    const notice = sealFlow.flag
      ? flags.find((flag) => flag.code === "seal_mismatch" || flag.code === "seal_missing" || flag.code === "hold")
          ?.detail ?? null
      : match.idMismatch
        ? match.reasons.join(" ")
        : null;
    return { visitId, events: [...stamped, ...aiEvents], flags, notice };
  });
}

export async function performCheckOut(
  db: Database,
  input: {
    visitId: string;
    sealOut?: string | null;
    occurredAt?: string | Date;
    source: EventSource;
    commandId?: string | null;
    role?: string | null;
    confirmed?: boolean;
  },
): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const visit = await requireVisit(tx, site.id, input.visitId);
    if (visit.checked_out_at) {
      return { visitId: visit.id, events: [], flags: [], notice: "Already checked out", duplicate: true };
    }
    const openFlags = parseFlags(visit.flags);
    if (input.role === "gate" && openFlags.some((flag) => flag.code === "hold")) {
      throw new YardError("A hold is open. An office role has to release it before check-out.", 403);
    }
    const seals = checkSeals(visit.seal_in, input.sealOut);
    const flags = parseFlags(visit.flags);
    if (seals.mismatch) {
      flags.push({
        code: "seal_mismatch",
        detail: `Seal ${seals.sealOut || "(blank)"} does not match seal ${seals.sealIn || "(blank)"} on file.`,
      });
    }
    await tx.query(
      `update visits set
         seal_out = $2,
         flags = $3::jsonb,
         checked_out_at = $4,
         location_kind = 'offsite',
         location_id = null,
         location_label = 'Off site'
       where id = $1`,
      [visit.id, blank(input.sealOut), JSON.stringify(flags), occurredAt],
    );
    const events: YardEvent[] = [];
    const base = visitBase(site, visit, "Off site", occurredAt, input.source);
    if (seals.normalizedIn || seals.normalizedOut) {
      events.push(
        createEvent({
          ...base,
          eventType: seals.mismatch ? "seal.mismatch" : "seal.verified",
          payload: {
            sealIn: seals.sealIn,
            sealOut: seals.sealOut,
            normalizedIn: seals.normalizedIn,
            normalizedOut: seals.normalizedOut,
          },
        }),
      );
    }
    if (visit.location_kind === "door") {
      events.push(createEvent({ ...base, eventType: "door.released", location: visit.location_label, payload: {} }));
    }
    events.push(
      createEvent({
        ...base,
        eventType: "gate.check_out",
        payload: { sealOut: blank(input.sealOut), sealMismatch: seals.mismatch },
      }),
    );
    for (const event of events) await insertEvent(tx, event);
    return {
      visitId: visit.id,
      events,
      flags: seals.mismatch ? flags.filter((flag) => flag.code === "seal_mismatch") : [],
      notice: seals.mismatch ? flags.find((flag) => flag.code === "seal_mismatch")?.detail ?? null : null,
    };
  });
}

export async function assignDoor(
  db: Database,
  input: {
    visitId?: string;
    appointmentCode?: string;
    doorName?: string;
    doorId?: string;
    occurredAt?: string | Date;
    source: EventSource;
    fallback?: boolean;
  },
): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const config = await loadConfig(tx, site);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const visit = input.visitId
      ? await requireVisit(tx, site.id, input.visitId)
      : await visitByCode(tx, site.id, input.appointmentCode ?? "");
    if (!visit || visit.checked_out_at) {
      return { visitId: visit?.id ?? null, events: [], flags: [], notice: "Visit is not on site" };
    }
    if (visit.location_kind === "door" && !input.doorId && !input.doorName) {
      return { visitId: visit.id, events: [], flags: [], notice: "Already at a door" };
    }
    const occupied = await occupiedLocationIds(tx, site.id);
    occupied.delete(visit.location_id ?? "");
    let placement: Placement | null = null;
    if (input.doorId) placement = placementById(config.snapshot, "door", input.doorId);
    else if (input.doorName) placement = placementByName(config.snapshot, input.doorName);
    if (placement && (placement.kind !== "door" || occupied.has(placement.id))) {
      placement = input.fallback ? null : placement;
      if (!input.fallback) {
        throw new YardError(`${input.doorName ?? "That door"} is not open`);
      }
    }
    if (!placement || placement.kind !== "door" || occupied.has(placement.id)) {
      if (!input.fallback) throw new YardError("Pick an open door");
      placement = choosePlace(config.snapshot, occupied, undefined, "door");
    }
    if (visit.location_id === placement.id) {
      return { visitId: visit.id, events: [], flags: [], notice: "Already at that door" };
    }
    const statusKey = visit.load_type === "outbound" ? "loading" : "unloading";
    await tx.query(
      `update visits set
         location_kind = 'door', location_id = $2, location_label = $3,
         status_key = $4, work_completed_at = null
       where id = $1`,
      [visit.id, placement.id, placement.label, statusKey],
    );
    const events = [
      createEvent({
        ...visitBase(site, visit, placement.label, occurredAt, input.source),
        eventType: "door.assigned",
        payload: { from: visit.location_label, locationId: placement.id },
      }),
      createEvent({
        ...visitBase(site, visit, placement.label, occurredAt, input.source),
        eventType: "door.work_started",
        payload: { statusKey },
      }),
    ];
    for (const event of events) await insertEvent(tx, event);
    return { visitId: visit.id, events, flags: [], notice: null };
  });
}

export async function completeDoorWork(
  db: Database,
  input: { visitId?: string; appointmentCode?: string; occurredAt?: string | Date; source: EventSource },
): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const visit = input.visitId
      ? await requireVisit(tx, site.id, input.visitId)
      : await visitByCode(tx, site.id, input.appointmentCode ?? "");
    if (!visit || visit.checked_out_at) {
      return { visitId: visit?.id ?? null, events: [], flags: [], notice: "Visit is not on site" };
    }
    if (visit.work_completed_at) {
      return { visitId: visit.id, events: [], flags: [], notice: "Door work already completed" };
    }
    if (visit.location_kind !== "door") throw new YardError("That trailer is not at a door");
    const statusKey = visit.status_key === "loading" ? "loaded" : "empty";
    await tx.query(
      `update visits set work_completed_at = $2, status_key = $3 where id = $1`,
      [visit.id, occurredAt, statusKey],
    );
    const event = createEvent({
      ...visitBase(site, visit, visit.location_label ?? "Door", occurredAt, input.source),
      eventType: "door.work_completed",
      payload: { statusKey },
    });
    await insertEvent(tx, event);
    return { visitId: visit.id, events: [event], flags: [], notice: null };
  });
}

export async function markNoShow(
  db: Database,
  input: { appointmentCode: string; occurredAt?: string | Date; source: EventSource },
): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const rows = await tx.query<AppointmentRow>(
      `select * from appointments where site_id = $1 and appointment_code = $2`,
      [site.id, input.appointmentCode],
    );
    const appointment = rows[0];
    if (!appointment) throw new YardError(`No appointment ${input.appointmentCode}`);
    if (appointment.status !== "expected") {
      return { visitId: null, events: [], flags: [], notice: `Already ${appointment.status}` };
    }
    await tx.query(`update appointments set status = 'no_show' where id = $1`, [appointment.id]);
    const event = createEvent({
      siteId: site.id,
      companyId: site.companyId,
      eventType: "appointment.no_show",
      trailerId: appointment.trailer_id,
      trailerNumber: appointment.trailer_number,
      scac: appointment.scac,
      loadId: appointment.load_id,
      appointmentId: appointment.appointment_code,
      location: "Gate",
      occurredAt,
      source: input.source,
      payload: { plannedAt: asIso(appointment.planned_at) },
    });
    await insertEvent(tx, event);
    return { visitId: null, events: [event], flags: [], notice: null };
  });
}

export async function clearReeferFlag(
  db: Database,
  input: {
    visitId: string;
    role: string;
    reason: string;
    commandId?: string | null;
    occurredAt?: string | Date;
    source: EventSource;
  },
): Promise<OperationResult> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const config = await loadConfig(tx, site);
    const clock = await readClock(tx, site.id);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : clock.asOf;
    const commandId = blank(input.commandId);
    if (commandId) {
      const prior = await tx.query<{ visit_id: string | null }>(
        `select visit_id from events
         where event_type = 'reefer.cleared' and payload->>'commandId' = $1
         limit 1`,
        [commandId],
      );
      if (prior[0]) {
        return { visitId: prior[0].visit_id, events: [], flags: [], notice: "Already saved", duplicate: true };
      }
    }
    if (!canClearTemp(input.role, config.snapshot.policies.clearTempRoles)) {
      throw new YardError("A gate role cannot clear a TEMP flag", 403);
    }
    if (!input.reason?.trim()) throw new YardError("Clearing a TEMP flag needs a reason");
    const visit = await requireVisit(tx, site.id, input.visitId);
    const flags = parseFlags(visit.flags);
    if (!flags.some((flag) => flag.code === "reefer_temp")) {
      return { visitId: visit.id, events: [], flags, notice: "No TEMP flag is open" };
    }
    const next = flags.filter((flag) => flag.code !== "reefer_temp");
    await tx.query(`update visits set flags = $2::jsonb where id = $1`, [visit.id, JSON.stringify(next)]);
    const event = createEvent({
      ...visitBase(site, visit, visit.location_label ?? "Yard", occurredAt, input.source),
      eventType: "reefer.cleared",
      payload: {
        reason: input.reason.trim(),
        role: input.role,
        commandId,
        configVersion: config.version,
        serverTime: occurredAt,
      },
    });
    await insertEvent(tx, event);
    return { visitId: visit.id, events: [event], flags: next, notice: null };
  });
}

export async function createAppointment(
  db: Database,
  input: {
    code: string;
    carrierName: string;
    scac: string;
    trailerNumber: string;
    driverName?: string | null;
    tractorNumber?: string | null;
    loadId: string;
    loadType: string;
    emptyOrLoaded: string;
    isReefer: boolean;
    setpointF?: number | null;
    expectedSeal?: string | null;
    plannedAt: string;
    occurredAt: string;
    source: EventSource;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const existing = await tx.query<{ id: string }>(
      `select id from appointments where site_id = $1 and appointment_code = $2`,
      [site.id, input.code],
    );
    if (existing.length) return;
    const scac = input.scac.toUpperCase();
    await upsertCarrier(tx, site.companyId, input.carrierName, scac);
    const trailerId = await upsertTrailer(
      tx,
      site.companyId,
      input.trailerNumber,
      scac,
      input.isReefer,
    );
    const id = crypto.randomUUID();
    await tx.query(
      `insert into appointments (
         id, site_id, company_id, appointment_code, load_id, carrier_name, scac,
         trailer_number, trailer_id, driver_name, tractor_number, load_type,
         empty_or_loaded, is_reefer, setpoint_f, planned_at, expected_seal, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'expected')`,
      [
        id,
        site.id,
        site.companyId,
        input.code,
        input.loadId,
        input.carrierName,
        scac,
        input.trailerNumber,
        trailerId,
        input.driverName ?? null,
        input.tractorNumber ?? null,
        input.loadType,
        input.emptyOrLoaded,
        input.isReefer,
        input.setpointF ?? null,
        input.plannedAt,
        blank(input.expectedSeal),
      ],
    );
    await insertEvent(
      tx,
      createEvent({
        siteId: site.id,
        companyId: site.companyId,
        eventType: "appointment.created",
        trailerId,
        trailerNumber: input.trailerNumber,
        scac,
        loadId: input.loadId,
        appointmentId: input.code,
        location: "Gate",
        occurredAt: input.occurredAt,
        source: input.source,
        payload: {
          carrierName: input.carrierName,
          plannedAt: input.plannedAt,
          loadType: input.loadType,
          isReefer: input.isReefer,
        },
      }),
    );
  });
}

export async function publishConfig(
  db: Database,
  snapshotInput: SiteConfigSnapshot,
  note: string | null,
  source: EventSource = "manual",
): Promise<{ id: string; version: number }> {
  const snapshot = validateSnapshot(snapshotInput);
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const versions = await tx.query<{ version: number }>(
      `select coalesce(max(version), 0) as version from site_configs where site_id = $1`,
      [site.id],
    );
    const version = Number(versions[0]?.version ?? 0) + 1;
    const id = crypto.randomUUID();
    await tx.query(
      `insert into site_configs (id, site_id, company_id, version, note, snapshot)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [id, site.id, site.companyId, version, note, JSON.stringify(snapshot)],
    );
    await tx.query(
      `update sites set name = $2, timezone = $3, current_config_id = $4 where id = $1`,
      [site.id, snapshot.siteName, snapshot.timezone, id],
    );
    await tx.query(`update companies set name = $2 where id = $1`, [
      site.companyId,
      snapshot.companyName,
    ]);
    await insertEvent(
      tx,
      createEvent({
        siteId: site.id,
        companyId: site.companyId,
        eventType: "config.published",
        occurredAt: clock.asOf,
        source,
        location: snapshot.siteName,
        payload: { version, note, configId: id },
      }),
    );
    return { id, version };
  });
}

export async function rollbackConfig(
  db: Database,
  configId: string,
  source: EventSource = "manual",
): Promise<{ version: number }> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const rows = await tx.query<Record<string, unknown>>(
      `select id, version, snapshot from site_configs where id = $1 and site_id = $2`,
      [configId, site.id],
    );
    const row = rows[0];
    if (!row) throw new YardError("That config version is not on this site");
    const snapshot = validateSnapshot(asJson<SiteConfigSnapshot>(row.snapshot, {} as SiteConfigSnapshot));
    await tx.query(
      `update sites set name = $2, timezone = $3, current_config_id = $4 where id = $1`,
      [site.id, snapshot.siteName, snapshot.timezone, row.id],
    );
    await tx.query(`update companies set name = $2 where id = $1`, [
      site.companyId,
      snapshot.companyName,
    ]);
    await insertEvent(
      tx,
      createEvent({
        siteId: site.id,
        companyId: site.companyId,
        eventType: "config.rolled_back",
        occurredAt: clock.asOf,
        source,
        location: snapshot.siteName,
        payload: { version: Number(row.version), configId: String(row.id) },
      }),
    );
    return { version: Number(row.version) };
  });
}

function arrivalSuggestionEvents(input: {
  siteId: string;
  companyId: string;
  trailerId: string | null;
  trailerNumber: string;
  scac: string;
  loadId: string | null;
  appointmentId: string | null;
  location: string;
  occurredAt: string;
  visitId: string;
  source: EventSource;
  ai?: CheckInInput["ai"];
}): YardEvent[] {
  if (!input.ai?.suggestionId || !input.ai.placeName) return [];
  const shared = {
    siteId: input.siteId,
    companyId: input.companyId,
    trailerId: input.trailerId,
    trailerNumber: input.trailerNumber,
    scac: input.scac,
    loadId: input.loadId,
    appointmentId: input.appointmentId,
    location: input.location,
    occurredAt: input.occurredAt,
    source: input.source,
    visitId: input.visitId,
  };
  return [
    createEvent({
      ...shared,
      eventType: "ai.suggested",
      payload: {
        suggestionId: input.ai.suggestionId,
        kind: "recommend",
        reason: input.ai.reason,
        placeKind: input.ai.placeKind,
        placeId: input.ai.placeId,
        placeName: input.ai.placeName,
        provider: input.ai.provider,
      },
    }),
    createEvent({
      ...shared,
      eventType: input.ai.accepted ? "ai.accepted" : "ai.dismissed",
      payload: {
        suggestionId: input.ai.suggestionId,
        kind: "recommend",
        placeName: input.ai.placeName,
        accepted: input.ai.accepted,
      },
    }),
  ];
}

export async function logSiteSuggestion(
  db: Database,
  input: {
    kind: "optimize" | "recommend" | "ask";
    suggestionId: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
    source: EventSource;
    eventType?: "ai.suggested" | "ai.asked" | "ai.dismissed";
    trailerNumber?: string | null;
    scac?: string | null;
    location?: string | null;
  },
): Promise<YardEvent> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const event = createEvent({
      siteId: site.id,
      companyId: site.companyId,
      eventType: input.eventType ?? (input.kind === "ask" ? "ai.asked" : "ai.suggested"),
      trailerNumber: input.trailerNumber,
      scac: input.scac,
      location: input.location ?? site.name,
      occurredAt: input.occurredAt ?? clock.asOf,
      source: input.source,
      payload: { kind: input.kind, suggestionId: input.suggestionId, ...input.payload },
    });
    await insertEvent(tx, event);
    return event;
  });
}

export async function acceptYardMove(
  db: Database,
  input: {
    visitId: string;
    toKind: "door" | "spot";
    toId: string;
    toName: string;
    fromName: string;
    suggestionId: string;
    reason: string;
    kind: "respot" | "door_swap";
    detentionMinutes: number;
    dockIdleMinutes: number;
    source?: EventSource;
  },
): Promise<{ moveId: string; duplicate: boolean }> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const clock = await readClock(tx, site.id);
    const config = await loadConfig(tx, site);
    const visits = await tx.query<Record<string, unknown>>(
      `select id, trailer_id, trailer_number, scac, load_id, appointment_code, location_label
       from visits where id = $1 and site_id = $2 and checked_out_at is null`,
      [input.visitId, site.id],
    );
    const visit = visits[0];
    if (!visit) throw new YardError("That trailer is not on the yard");
    const place = placementById(config.snapshot, input.toKind, input.toId);
    const existing = await tx.query<{ id: string }>(
      `select id from move_requests
       where visit_id = $1 and to_location = $2 and status = 'requested' limit 1`,
      [input.visitId, place.label],
    );
    if (existing[0]) return { moveId: existing[0].id, duplicate: true };
    const moveId = crypto.randomUUID();
    const priority = input.detentionMinutes >= 20 ? "high" : "normal";
    await tx.query(
      `insert into move_requests (
         id, company_id, site_id, visit_id, trailer_number, scac, from_location, to_location,
         priority, status, requested_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'requested',$10)`,
      [
        moveId,
        site.companyId,
        site.id,
        input.visitId,
        visit.trailer_number,
        visit.scac,
        input.fromName || asTextish(visit.location_label),
        place.label,
        priority,
        clock.asOf,
      ],
    );
    const location = asTextish(visit.location_label) || input.fromName.trim() || "Yard";
    const shared = {
      siteId: site.id,
      companyId: site.companyId,
      trailerId: asTextish(visit.trailer_id),
      trailerNumber: String(visit.trailer_number),
      scac: String(visit.scac),
      loadId: asTextish(visit.load_id),
      appointmentId: asTextish(visit.appointment_code),
      location,
      occurredAt: clock.asOf,
      source: input.source ?? "manual",
      visitId: input.visitId,
    };
    await insertEvent(
      tx,
      createEvent({
        ...shared,
        eventType: "ai.accepted",
        payload: {
          suggestionId: input.suggestionId,
          kind: "optimize",
          moveKind: input.kind,
          to: place.label,
          reason: input.reason,
        },
      }),
    );
    await insertEvent(
      tx,
      createEvent({
        ...shared,
        eventType: "move.requested",
        payload: {
          moveId,
          to: place.label,
          toId: place.id,
          kind: input.kind,
          reason: input.reason,
          detentionMinutes: input.detentionMinutes,
          dockIdleMinutes: input.dockIdleMinutes,
          priority,
        },
      }),
    );
    return { moveId, duplicate: false };
  });
}

export async function importArrivals(
  db: Database,
  rows: CsvArrival[],
  source: EventSource,
  occurredAt: string,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const before = await db.query<{ id: string }>(
      `select id from appointments where appointment_code = $1`,
      [row.code],
    );
    if (before.length) {
      skipped += 1;
      continue;
    }
    await createAppointment(db, {
      code: row.code,
      carrierName: row.carrierName,
      scac: row.scac,
      trailerNumber: row.trailerNumber,
      driverName: row.driverName,
      loadId: row.loadId,
      loadType: row.loadType,
      emptyOrLoaded: row.emptyOrLoaded,
      isReefer: row.isReefer,
      setpointF: row.setpointF,
      expectedSeal: row.expectedSeal,
      plannedAt: row.plannedAt,
      occurredAt,
      source,
    });
    created += 1;
  }
  return { created, skipped };
}

export async function receiveEmailDraft(
  db: Database,
  input: { from: string; subject?: string | null; text: string; occurredAt?: string },
): Promise<{ status: "draft" | "rejected"; id?: string; appointment?: CsvArrival }> {
  return db.transaction(async (tx) => {
    const site = await requireSite(tx);
    const config = await loadConfig(tx, site);
    const clock = await readClock(tx, site.id);
    const allow = config.snapshot.feeds.allowedSenders;
    if (!senderAllowed(input.from, allow)) {
      await insertEvent(
        tx,
        createEvent({
          siteId: site.id,
          companyId: site.companyId,
          eventType: "feed.rejected_sender",
          location: site.name,
          occurredAt: input.occurredAt ?? clock.asOf,
          source: "manual",
          payload: { from: input.from, allowlist: allow },
        }),
      );
      return { status: "rejected" };
    }
    const parsed = parseAppointmentEmail(input.text);
    if ("error" in parsed) throw new YardError(parsed.error);
    const id = crypto.randomUUID();
    await tx.query(
      `insert into arrival_drafts (id, site_id, sender, subject, body, parsed, status)
       values ($1,$2,$3,$4,$5,$6::jsonb,'draft')`,
      [id, site.id, input.from, input.subject ?? null, input.text, JSON.stringify(parsed)],
    );
    return { status: "draft", id, appointment: parsed };
  });
}

export async function confirmArrivalDraft(
  db: Database,
  draftId: string,
): Promise<{ created: number }> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, parsed, status from arrival_drafts where id = $1`,
    [draftId],
  );
  const row = rows[0];
  if (!row) throw new YardError("That draft is not on this site");
  if (row.status === "confirmed") return { created: 0 };
  const parsed = asJson<CsvArrival>(row.parsed, {} as CsvArrival);
  const site = await requireSite(db);
  const clock = await readClock(db, site.id);
  const result = await importArrivals(db, [parsed], "manual", clock.asOf);
  await db.query(`update arrival_drafts set status = 'confirmed' where id = $1`, [draftId]);
  return result;
}

function asTextish(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function resolveCheckInPlace(
  config: SiteConfigSnapshot,
  occupied: Set<string>,
  input: CheckInInput,
): Placement {
  if (input.locationId && input.locationKind) {
    return placementById(config, input.locationKind, input.locationId);
  }
  if (input.preferredPlace) {
    const named = placementByName(config, input.preferredPlace);
    if (named && !occupied.has(named.id)) return named;
  }
  return choosePlace(config, occupied, input.preferredPlace ?? undefined, "spot");
}

function assertRequiredFields(config: SiteConfigSnapshot, input: CheckInInput, isReefer: boolean) {
  const values: Record<string, unknown> = {
    trailer_number: input.trailerNumber,
    tractor_number: input.tractorNumber,
    carrier_name: input.carrierName,
    scac: input.scac,
    driver_name: input.driverName,
    seal_number: input.sealNumber,
    load_type: input.loadType,
    load_id: input.loadId,
    empty_or_loaded: input.emptyOrLoaded,
    is_reefer: input.isReefer,
    setpoint_f: input.setpointF,
    temp_f: input.tempF,
    fuel_pct: input.fuelPct,
    photo: input.photoId,
  };
  for (const field of config.checkInFields) {
    if (!field.enabled || !field.required) continue;
    if (field.showWhen === "reefer" && !isReefer) continue;
    const value = field.builtin ? values[field.key] : input.customFields?.[field.key];
    if (typeof value === "boolean") continue;
    if (value == null || String(value).trim() === "") {
      throw new YardError(`${field.label} is required`);
    }
  }
}

function toArrivalKey(row: AppointmentRow): ArrivalKey {
  return {
    id: row.id,
    appointmentCode: row.appointment_code,
    trailerNumber: row.trailer_number,
    scac: row.scac,
    loadId: row.load_id,
    carrierName: row.carrier_name,
  };
}

async function carrierNameFor(sql: Sql, companyId: string, scac: string): Promise<string | null> {
  const rows = await sql.query<{ name: string }>(
    `select name from carriers where company_id = $1 and scac = $2`,
    [companyId, scac],
  );
  return rows[0]?.name ?? null;
}

async function upsertCarrier(sql: Sql, companyId: string, name: string, scac: string) {
  await sql.query(
    `insert into carriers (id, company_id, name, scac)
     values ($1, $2, $3, $4)
     on conflict (company_id, scac) do update set name = excluded.name`,
    [crypto.randomUUID(), companyId, name, scac],
  );
}

async function upsertDriver(sql: Sql, companyId: string, name: string) {
  await sql.query(
    `insert into drivers (id, company_id, name)
     values ($1, $2, $3)
     on conflict (company_id, name) do update set name = excluded.name`,
    [crypto.randomUUID(), companyId, name],
  );
}

async function upsertTractor(sql: Sql, companyId: string, tractorNumber: string, scac: string) {
  await sql.query(
    `insert into tractors (id, company_id, tractor_number, carrier_scac)
     values ($1, $2, $3, $4)
     on conflict (company_id, tractor_number) do update set carrier_scac = excluded.carrier_scac`,
    [crypto.randomUUID(), companyId, tractorNumber, scac],
  );
}

async function upsertTrailer(
  sql: Sql,
  companyId: string,
  trailerNumber: string,
  scac: string,
  isReefer: boolean,
): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `insert into trailers (id, company_id, trailer_number, scac, is_reefer)
     values ($1, $2, $3, $4, $5)
     on conflict (company_id, scac, trailer_number)
     do update set is_reefer = trailers.is_reefer or excluded.is_reefer
     returning id`,
    [crypto.randomUUID(), companyId, trailerNumber, scac, isReefer],
  );
  return rows[0].id;
}

type VisitRow = {
  id: string;
  trailer_id: string | null;
  trailer_number: string;
  scac: string;
  load_id: string | null;
  appointment_code: string | null;
  location_kind: string;
  location_id: string | null;
  location_label: string | null;
  seal_in: string | null;
  checked_out_at: string | null;
  work_completed_at: string | null;
  status_key: string;
  load_type: string | null;
  flags: unknown;
};

async function requireVisit(sql: Sql, siteId: string, visitId: string): Promise<VisitRow> {
  const rows = await sql.query<VisitRow>(
    `select id, trailer_id, trailer_number, scac, load_id, appointment_code, location_kind,
            location_id, location_label, seal_in, checked_out_at, work_completed_at, status_key,
            load_type, flags
     from visits where id = $1 and site_id = $2`,
    [visitId, siteId],
  );
  if (!rows[0]) throw new YardError("That trailer is not on site");
  return rows[0];
}

async function visitByCode(sql: Sql, siteId: string, code: string): Promise<VisitRow | null> {
  if (!code) return null;
  const rows = await sql.query<VisitRow>(
    `select id, trailer_id, trailer_number, scac, load_id, appointment_code, location_kind,
            location_id, location_label, seal_in, checked_out_at, work_completed_at, status_key,
            load_type, flags
     from visits
     where site_id = $1 and appointment_code = $2
     order by checked_in_at desc
     limit 1`,
    [siteId, code],
  );
  return rows[0] ?? null;
}

async function visitForAppointment(sql: Sql, siteId: string, appointmentId: string): Promise<string | null> {
  const rows = await sql.query<{ id: string }>(
    `select id from visits where site_id = $1 and appointment_id = $2 limit 1`,
    [siteId, appointmentId],
  );
  return rows[0]?.id ?? null;
}

function visitBase(
  site: SiteContext,
  visit: VisitRow,
  location: string,
  occurredAt: string,
  source: EventSource,
) {
  return {
    siteId: site.id,
    companyId: site.companyId,
    trailerId: visit.trailer_id,
    trailerNumber: visit.trailer_number,
    scac: visit.scac,
    loadId: visit.load_id,
    appointmentId: visit.appointment_code,
    location,
    occurredAt,
    source,
    visitId: visit.id,
  };
}

function parseFlags(value: unknown): VisitFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VisitFlag => {
    return Boolean(item && typeof item === "object" && "code" in item);
  });
}

function sanitizeCustom(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      clean[key] = item;
    }
  }
  return clean;
}

function resolveArrivalStamp(
  occurredAt: string,
  arrivedAt: string | null | undefined,
  reason: string | null | undefined,
): string {
  if (!arrivedAt) return occurredAt;
  const stamp = new Date(arrivedAt);
  if (Number.isNaN(stamp.getTime())) throw new YardError("Arrival time is not a valid time");
  const iso = stamp.toISOString();
  const delta = new Date(occurredAt).getTime() - stamp.getTime();
  if (delta < -60_000) throw new YardError("Arrival time can only be moved earlier");
  if (delta > 60_000 && !reason?.trim()) {
    throw new YardError("Moving the arrival time earlier needs a reason");
  }
  return iso;
}

function blank(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}
