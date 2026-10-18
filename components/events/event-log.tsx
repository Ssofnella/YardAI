"use client";

import { useEffect, useState } from "react";
import { eventLabel, type EventType } from "@/lib/domain/events";
import { formatSiteTime } from "@/lib/domain/time";
import { useYard } from "@/components/yard-provider";

type EventRow = {
  id: string;
  eventType: EventType;
  trailerId: string | null;
  trailerNumber: string | null;
  scac: string | null;
  loadId: string | null;
  appointmentId: string | null;
  location: string | null;
  occurredAt: string;
  source: string;
};

export function EventLog() {
  const { state, loading } = useYard();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const count = state?.eventCount ?? 0;

  useEffect(() => {
    let stop = false;
    fetch("/api/events?limit=300", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { events?: EventRow[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load events");
        if (!stop) setEvents(body.events ?? []);
      })
      .catch((reason: unknown) => {
        if (!stop) setError(reason instanceof Error ? reason.message : "Could not load events");
      });
    return () => {
      stop = true;
    };
  }, [count]);

  if (loading && !state) return <p className="text-muted-foreground">Loading the log…</p>;
  const timezone = state?.site.timezone ?? "America/Chicago";
  const needle = query.trim().toLowerCase();
  const shown = events.filter((event) => {
    if (source !== "all" && event.source !== source) return false;
    if (!needle) return true;
    return [event.trailerNumber, event.scac, event.loadId, event.appointmentId, event.eventType, event.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Event log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only. Stored in UTC, shown in {timezone}. {events.length} recent events.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Trailer, SCAC, load, appointment, event id"
          className="h-12 rounded-lg border border-input bg-card px-3 text-base"
          aria-label="Filter events"
        />
        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-12 rounded-lg border border-input bg-card px-3 text-base"
          aria-label="Source"
        >
          <option value="all">Manual and simulator</option>
          <option value="manual">Manual</option>
          <option value="simulator">Simulator</option>
        </select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm">
          No events match. A check-in or a simulated shift writes the first rows.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Trailer</th>
                <th className="px-3 py-3 font-medium">SCAC</th>
                <th className="px-3 py-3 font-medium">Load</th>
                <th className="px-3 py-3 font-medium">Appointment</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Event ID</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((event) => (
                <tr key={event.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-3 whitespace-nowrap">
                    {event.occurredAt ? formatSiteTime(event.occurredAt, timezone) : ""}
                  </td>
                  <td className="px-3 py-3 font-medium">{eventLabel(event.eventType)}</td>
                  <td className="equip px-3 py-3">{event.trailerNumber ?? "—"}</td>
                  <td className="equip px-3 py-3">{event.scac ?? "—"}</td>
                  <td className="equip px-3 py-3">{event.loadId ?? "—"}</td>
                  <td className="equip px-3 py-3">{event.appointmentId ?? "—"}</td>
                  <td className="px-3 py-3">{event.location ?? "—"}</td>
                  <td className="px-3 py-3 capitalize">{event.source}</td>
                  <td className="equip px-3 py-3 text-xs text-muted-foreground">{event.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
