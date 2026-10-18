"use client";

import { useMemo, useState } from "react";
import { statusColor, statusLabel } from "@/lib/domain/config";
import { dwellMinutes, formatDwell } from "@/lib/domain/dwell";
import { spotTypeLabel, flagLabel } from "@/components/labels";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { useYard } from "@/components/yard-provider";
import type { VisitView } from "@/lib/yard/state";
import { cn } from "cn";

export function YardBoard() {
  const { state, asOf, loading } = useYard();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [reeferOnly, setReeferOnly] = useState(false);
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  const [large, setLarge] = useState(false);

  const snapshot = state?.config.snapshot;
  const visits = state?.visits;
  const clock = asOf ?? state?.clock.asOf ?? new Date().toISOString();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (visits ?? []).filter((visit) => {
      if (status !== "all" && visit.statusKey !== status) return false;
      if (reeferOnly && !visit.isReefer) return false;
      if (alertsOnly && visit.flags.length === 0) return false;
      if (!needle) return true;
      const hay = [visit.trailerNumber, visit.scac, visit.carrierName, visit.loadId, visit.appointmentCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [visits, query, status, reeferOnly, alertsOnly]);

  const visible = new Set(filtered.map((visit) => visit.id));
  const onSite = visits ?? [];

  if (loading && !state) return <p className="text-muted-foreground">Loading the yard…</p>;
  if (!state || !snapshot) return <p>The yard did not load.</p>;

  const bySpot = new Map(
    onSite.filter((visit) => visit.locationKind === "spot").map((visit) => [visit.locationId, visit]),
  );
  const knownSpots = new Set(snapshot.spots.map((spot) => spot.id));
  const unplaced = onSite.filter(
    (visit) => visit.locationKind === "spot" && !knownSpots.has(visit.locationId ?? ""),
  );

  return (
    <div className={cn("flex flex-col gap-5", large && "text-lg")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Yard</h1>
          <p className="text-sm text-muted-foreground">
            {state.counts.onYard} on site · {state.counts.atDoors} at doors · {state.counts.alerts} alerts ·{" "}
            {state.counts.expected} expected
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "map" ? "default" : "outline"} className="h-11" onClick={() => setView("map")}>
            Map
          </Button>
          <Button variant={view === "list" ? "default" : "outline"} className="h-11" onClick={() => setView("list")}>
            List
          </Button>
          <Button variant={large ? "default" : "outline"} className="h-11" onClick={() => setLarge((value) => !value)}>
            Large type
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Trailer, SCAC, carrier, load"
          className="h-12 rounded-lg border border-input bg-card px-3 text-base"
          aria-label="Filter trailers"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-12 rounded-lg border border-input bg-card px-3 text-base"
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          {snapshot.trailerStatuses.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <FilterToggle label="Reefers" pressed={reeferOnly} onClick={() => setReeferOnly((value) => !value)} />
        <FilterToggle label="Alerts" pressed={alertsOnly} onClick={() => setAlertsOnly((value) => !value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {snapshot.trailerStatuses.map((item) => (
          <StatusPill key={item.key} label={item.label} color={item.color} />
        ))}
      </div>

      {onSite.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm">
          No trailers are on site. Check one in at the gate, or play a shift from the simulator.
        </p>
      ) : null}

      {view === "list" ? (
        <VisitTable
          visits={filtered}
          clock={clock}
          statuses={snapshot.trailerStatuses}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {snapshot.zones
            .slice()
            .sort((a, b) => a.sort - b.sort)
            .map((zone) => {
              const spots = snapshot.spots
                .filter((spot) => spot.zoneId === zone.id)
                .slice()
                .sort((a, b) => a.row - b.row || a.col - b.col);
              const cols = Math.max(1, ...spots.map((spot) => spot.col + 1));
              const occupied = spots.filter((spot) => bySpot.get(spot.id)).length;
              return (
                <section key={zone.id}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">{zone.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {occupied} of {spots.length} occupied
                    </p>
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <div
                      className="grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${cols}, minmax(148px, 1fr))`,
                        minWidth: cols * 156,
                      }}
                    >
                      {spots.map((spot) => {
                        const visit = bySpot.get(spot.id) ?? null;
                        const shown = !visit || visible.has(visit.id);
                        return (
                          <SpotCell
                            key={spot.id}
                            name={spot.name}
                            typeLabel={spotTypeLabel(spot.type)}
                            visit={shown ? visit : null}
                            dimmed={Boolean(visit) && !shown}
                            clock={clock}
                            statuses={snapshot.trailerStatuses}
                            closed={spot.type === "out_of_service"}
                          />
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
          {unplaced.length > 0 ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Not on this layout</h2>
              <p className="mb-2 text-sm text-muted-foreground">
                These trailers sit on spots the current config no longer has.
              </p>
              <VisitTable visits={unplaced.filter((visit) => visible.has(visit.id))} clock={clock} statuses={snapshot.trailerStatuses} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FilterToggle({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-12 rounded-lg border px-4 text-sm font-semibold",
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
      )}
    >
      {label}
    </button>
  );
}

function SpotCell({
  name,
  typeLabel,
  visit,
  dimmed,
  clock,
  statuses,
  closed,
}: {
  name: string;
  typeLabel: string;
  visit: VisitView | null;
  dimmed: boolean;
  clock: string;
  statuses: { key: string; label: string; color: string }[];
  closed: boolean;
}) {
  const alert = Boolean(visit && visit.flags.length > 0);
  return (
    <article
      className={cn(
        "flex min-h-36 flex-col gap-1 rounded-lg border-2 bg-card p-2.5",
        closed && "border-dashed bg-muted text-muted-foreground",
        visit ? "border-foreground/15" : "border-dashed border-border",
        alert && "border-destructive",
        dimmed && "opacity-35",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="equip text-xs font-semibold text-foreground">{name}</span>
        <span>{typeLabel}</span>
      </div>
      {visit ? (
        <>
          <p className="equip text-lg font-semibold leading-tight">{visit.trailerNumber}</p>
          <p className="truncate text-xs">
            {visit.scac} · {visit.carrierName}
          </p>
          <StatusPill label={statusLabel(statuses, visit.statusKey)} color={statusColor(statuses, visit.statusKey)} />
          <p className="mt-auto text-xs">
            {formatDwell(dwellMinutes(visit.checkedInAt, clock))}
            {visit.minutesLate ? ` · late ${visit.minutesLate}m` : ""}
            {visit.isReefer && visit.tempF != null ? ` · ${visit.tempF}°F` : ""}
          </p>
          {visit.flags.length > 0 ? (
            <p className="text-xs font-semibold text-destructive">
              {visit.flags.map((flag) => flagLabel(flag.code)).join(" · ")}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-auto text-sm text-muted-foreground">{closed ? "Closed" : "Open"}</p>
      )}
    </article>
  );
}

function VisitTable({
  visits,
  clock,
  statuses,
}: {
  visits: VisitView[];
  clock: string;
  statuses: { key: string; label: string; color: string }[];
}) {
  if (visits.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing matches those filters.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-medium">Trailer</th>
            <th className="px-3 py-3 font-medium">Carrier</th>
            <th className="px-3 py-3 font-medium">Where</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Dwell</th>
            <th className="px-3 py-3 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit) => (
            <tr key={visit.id} className="border-b border-border last:border-0">
              <td className="px-3 py-3">
                <div className="equip font-semibold">{visit.trailerNumber}</div>
                <div className="text-xs text-muted-foreground">{visit.isReefer ? "Reefer" : "Dry"}</div>
              </td>
              <td className="px-3 py-3">
                {visit.carrierName}
                <div className="equip text-xs text-muted-foreground">{visit.scac}</div>
              </td>
              <td className="px-3 py-3">{visit.locationLabel}</td>
              <td className="px-3 py-3">
                <StatusPill
                  label={statusLabel(statuses, visit.statusKey)}
                  color={statusColor(statuses, visit.statusKey)}
                />
              </td>
              <td className="equip px-3 py-3">{formatDwell(dwellMinutes(visit.checkedInAt, clock))}</td>
              <td className="px-3 py-3 text-destructive">
                {visit.flags.map((flag) => flagLabel(flag.code)).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
