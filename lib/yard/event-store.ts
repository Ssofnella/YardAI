import {
  assertReplay,
  createEvent,
  type EventType,
  type YardEvent,
} from "@/lib/domain/events";
import { asIso, asJson, asText } from "@/lib/db/json";
import type { Sql } from "@/lib/db/types";

export async function insertEvent(sql: Sql, event: YardEvent): Promise<"inserted" | "replayed"> {
  const rows = await sql.query<{ id: string }>(
    `insert into events (
       id, site_id, company_id, event_type, trailer_id, trailer_number, scac,
       load_id, appointment_id, location, occurred_at, source, visit_id, payload
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
     )
     on conflict (id) do nothing
     returning id`,
    [
      event.id,
      event.siteId,
      event.companyId,
      event.eventType,
      event.trailerId,
      event.trailerNumber,
      event.scac,
      event.loadId,
      event.appointmentId,
      event.location,
      event.occurredAt,
      event.source,
      event.visitId,
      JSON.stringify(event.payload),
    ],
  );
  if (rows.length > 0) return "inserted";
  const existing = await sql.query<Record<string, unknown>>(
    `select * from events where id = $1`,
    [event.id],
  );
  if (!existing[0]) throw new Error("Event insert did not persist");
  assertReplay(rowToEvent(existing[0]), event);
  return "replayed";
}

export function rowToEvent(row: Record<string, unknown>): YardEvent {
  return createEvent({
    id: String(row.id),
    siteId: String(row.site_id),
    companyId: String(row.company_id),
    eventType: String(row.event_type) as EventType,
    trailerId: asText(row.trailer_id),
    trailerNumber: asText(row.trailer_number),
    scac: asText(row.scac),
    loadId: asText(row.load_id),
    appointmentId: asText(row.appointment_id),
    location: asText(row.location),
    occurredAt: asIso(row.occurred_at) ?? "",
    source: String(row.source) as YardEvent["source"],
    visitId: asText(row.visit_id),
    payload: asJson<Record<string, unknown>>(row.payload, {}),
  });
}
