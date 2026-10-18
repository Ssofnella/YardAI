import { toUtcIso } from "@/lib/domain/time";

export const EVENT_SOURCES = ["manual", "simulator"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/**
 * Operational events always carry trailer, SCAC, load, and appointment keys
 * (null when that key does not exist yet). Config events are the exception:
 * they describe the site, not a trailer.
 *
 * Later slices can append move.*, detention.*, and inspection.* without a
 * migration beyond allowing the new type string.
 */
export const EVENT_TYPES = [
  "appointment.created",
  "appointment.changed",
  "appointment.cancelled",
  "appointment.no_show",
  "gate.check_in",
  "gate.check_out",
  "spot.assigned",
  "door.assigned",
  "door.work_started",
  "door.work_completed",
  "door.released",
  "seal.applied",
  "seal.verified",
  "seal.mismatch",
  "id.mismatch",
  "reefer.reading",
  "reefer.alert",
  "config.published",
  "config.rolled_back",
  "move.requested",
  "move.started",
  "move.completed",
  "detention.started",
  "detention.exceeded",
  "inspection.recorded",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const OPERATIONAL = new Set<EventType>(
  EVENT_TYPES.filter((type) => !type.startsWith("config.")),
);

export type YardEvent = {
  id: string;
  siteId: string;
  companyId: string;
  eventType: EventType;
  trailerId: string | null;
  trailerNumber: string | null;
  scac: string | null;
  loadId: string | null;
  appointmentId: string | null;
  location: string | null;
  occurredAt: string;
  source: EventSource;
  visitId: string | null;
  payload: Record<string, unknown>;
};

export type CreateEventInput = {
  id?: string;
  siteId: string;
  companyId: string;
  eventType: EventType;
  trailerId?: string | null;
  trailerNumber?: string | null;
  scac?: string | null;
  loadId?: string | null;
  appointmentId?: string | null;
  location?: string | null;
  occurredAt: string | Date;
  source: EventSource;
  visitId?: string | null;
  payload?: Record<string, unknown>;
};

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export class EventConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventConflictError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value: string | null | undefined, label: string): string {
  const text = (value ?? "").trim();
  if (!text) throw new EventValidationError(`${label} is required`);
  return text;
}

export function createEvent(input: CreateEventInput): YardEvent {
  const id = input.id ?? crypto.randomUUID();
  if (!UUID_RE.test(id)) {
    throw new EventValidationError("Event id must be a UUID");
  }
  if (!UUID_RE.test(input.siteId) || !UUID_RE.test(input.companyId)) {
    throw new EventValidationError("siteId and companyId must be UUIDs");
  }
  if (!EVENT_TYPES.includes(input.eventType)) {
    throw new EventValidationError(`Unknown event type ${input.eventType}`);
  }
  if (!EVENT_SOURCES.includes(input.source)) {
    throw new EventValidationError("Event source must be manual or simulator");
  }

  const occurredAt = toUtcIso(input.occurredAt);
  const operational = OPERATIONAL.has(input.eventType);

  const trailerNumber = operational
    ? requiredText(input.trailerNumber, "Trailer number")
    : blankToNull(input.trailerNumber);
  const scac = operational
    ? requiredText(input.scac, "SCAC").toUpperCase()
    : blankToNull(input.scac)?.toUpperCase() ?? null;
  const location = operational
    ? requiredText(input.location, "Location")
    : blankToNull(input.location);

  if (operational && input.trailerId && !UUID_RE.test(input.trailerId)) {
    throw new EventValidationError("trailerId must be a UUID when set");
  }

  const event: YardEvent = {
    id,
    siteId: input.siteId,
    companyId: input.companyId,
    eventType: input.eventType,
    trailerId: input.trailerId ?? null,
    trailerNumber,
    scac,
    loadId: blankToNull(input.loadId),
    appointmentId: blankToNull(input.appointmentId),
    location,
    occurredAt,
    source: input.source,
    visitId: input.visitId ?? null,
    payload: input.payload ? { ...input.payload } : {},
  };

  return deepFreeze(event);
}

function blankToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function deepFreeze<T extends object>(value: T): T {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && !Object.isFrozen(nested)) {
      deepFreeze(nested as object);
    }
  }
  return Object.freeze(value);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, nested]) => [key, sortValue(nested)]));
  }
  return value;
}

export function canonicalEvent(event: YardEvent): string {
  return JSON.stringify(sortValue(event));
}

/** Same id with the same body is a safe replay. A different body is a conflict. */
export function assertReplay(existing: YardEvent, incoming: YardEvent): void {
  if (existing.id !== incoming.id) {
    throw new EventConflictError("Replay check requires the same event id");
  }
  if (canonicalEvent(existing) !== canonicalEvent(incoming)) {
    throw new EventConflictError(
      `Event ${existing.id} already exists with a different body`,
    );
  }
}

export function eventLabel(type: EventType): string {
  const labels: Record<EventType, string> = {
    "appointment.created": "Appointment created",
    "appointment.changed": "Appointment changed",
    "appointment.cancelled": "Appointment cancelled",
    "appointment.no_show": "No-show",
    "gate.check_in": "Gate check-in",
    "gate.check_out": "Gate check-out",
    "spot.assigned": "Spot assigned",
    "door.assigned": "Door assigned",
    "door.work_started": "Door work started",
    "door.work_completed": "Door work completed",
    "door.released": "Door released",
    "seal.applied": "Seal applied",
    "seal.verified": "Seal verified",
    "seal.mismatch": "Seal mismatch",
    "id.mismatch": "ID mismatch",
    "reefer.reading": "Reefer reading",
    "reefer.alert": "Reefer alert",
    "config.published": "Config published",
    "config.rolled_back": "Config rolled back",
    "move.requested": "Move requested",
    "move.started": "Move started",
    "move.completed": "Move completed",
    "detention.started": "Detention started",
    "detention.exceeded": "Free time exceeded",
    "inspection.recorded": "Inspection recorded",
  };
  return labels[type];
}
