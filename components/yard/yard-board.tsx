"use client";

import { useMemo, useState } from "react";
import { statusLabel } from "@/lib/domain/config";
import { dwellMinutes, formatDwell } from "@/lib/domain/dwell";
import { spotTypeLabel } from "@/components/labels";
import { dwellFlag, FlagChip, orderedFlags, StateChip } from "@/components/status-chip";
import { useSync } from "@/components/sync/sync-provider";
import { Button } from "@/components/ui/button";
import { YardTools } from "@/components/ai/yard-tools";
import { useYard } from "@/components/yard-provider";
import type { VisitView } from "@/lib/yard/state";
import { cn } from "cn";

export function YardBoard() {
  const { state, asOf, loading, refresh } = useYard();
  const sync = useSync();
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
      const hay = [
        visit.trailerNumber,
        visit.scac,
        visit.carrierName,
        visit.loadId,
        visit.appointmentCode,
        visit.locationLabel,
      ]
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

  const policies = snapshot.policies;
  const numbered = policies?.spotsNumbered !== false;

  async function clearTemp(id: string) {
    const role = window.localStorage.getItem("yardline.role") ?? "gate";
    const reason = window.prompt("Reason for clearing the TEMP flag");
    if (!reason?.trim()) return;
    try {
      await sync.enqueue("clear_flag", { visitId: id, role, reason: reason.trim() });
      await sync.flush();
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not clear the flag");
    }
  }

  return (
    <div data-screen="yard" className={cn("flex flex-col gap-5", large && "text-lg")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Yard</h1>
          <p className="text-sm text-muted-foreground">
            {state.counts.onYard} on site · {state.counts.atDoors} at doors · {state.counts.alerts} alerts ·{" "}
            {state.counts.expected} expected
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant={view === "map" ? "default" : "outline"} data-touch className="min-h-touch-field" onClick={() => setView("map")}>
            Map
          </Button>
          <Button variant={view === "list" ? "default" : "outline"} data-touch className="min-h-touch-field" onClick={() => setView("list")}>
            List
          </Button>
          <Button variant={large ? "default" : "outline"} data-touch className="min-h-touch-field" onClick={() => setLarge((value) => !value)}>
            Large type
          </Button>
        </div>
      </div>

      <YardTools />

      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          data-touch
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Trailer, SCAC, carrier, spot"
          className="min-h-touch-field rounded-card border-2 border-line bg-white px-3 text-fl-body"
          aria-label="Filter trailers"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          data-touch
          className="min-h-touch-field rounded-card border-2 border-line bg-white px-3 text-fl-body"
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

      <div className="flex flex-wrap gap-4">
        {snapshot.trailerStatuses.map((item) => (
          <StateChip key={item.key} statusKey={item.key} label={item.label} color={item.color} />
        ))}
      </div>

      {onSite.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm">
          No trailers are on site. Check one in at the gate, or play a shift from the simulator.
        </p>
      ) : null}

      {view === "list" ? (
        <VisitTable
          visits={[...filtered].sort(
            (a, b) => dwellMinutes(b.checkedInAt, clock) - dwellMinutes(a.checkedInAt, clock),
          )}
          clock={clock}
          statuses={snapshot.trailerStatuses}
          freeTime={policies?.freeTimeMinutes ?? 0}
          warnBefore={policies?.warnBeforeMinutes ?? 0}
          onClear={(id) => void clearTemp(id)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <DoorStrip doors={snapshot.doors} visits={onSite} />
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
                            name={numbered ? spot.name : spotTypeLabel(spot.type)}
                            typeLabel={spotTypeLabel(spot.type)}
                            visit={shown ? visit : null}
                            dimmed={Boolean(visit) && !shown}
                            clock={clock}
                            statuses={snapshot.trailerStatuses}
                            closed={spot.type === "out_of_service"}
                            freeTime={policies?.freeTimeMinutes ?? 0}
                            warnBefore={policies?.warnBeforeMinutes ?? 0}
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
              <VisitTable
                visits={unplaced.filter((visit) => visible.has(visit.id))}
                clock={clock}
                statuses={snapshot.trailerStatuses}
                freeTime={policies?.freeTimeMinutes ?? 0}
                warnBefore={policies?.warnBeforeMinutes ?? 0}
                onClear={(id) => void clearTemp(id)}
              />
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
      data-touch
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-touch-field rounded-card border-2 px-4 text-fl-label",
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
      )}
    >
      {label}
    </button>
  );
}

function DoorStrip({
  doors,
  visits,
}: {
  doors: { id: string; name: string; type: string; sort: number }[];
  visits: VisitView[];
}) {
  const byDoor = new Map(visits.filter((visit) => visit.locationKind === "door").map((visit) => [visit.locationId, visit]));
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Doors</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        {doors
          .slice()
          .sort((a, b) => a.sort - b.sort)
          .map((door) => {
            const visit = byDoor.get(door.id);
            return (
              <article key={door.id} className={cn("rounded-card border-2 p-2", visit ? "border-teal-700 bg-teal-50" : "border-dashed border-line")}>
                <p className="font-id text-sm font-bold">{door.name}</p>
                {visit ? <p className="font-id text-base font-semibold">{visit.trailerNumber}</p> : <p className="text-sm text-ink-muted">Open</p>}
              </article>
            );
          })}
      </div>
    </section>
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
  freeTime,
  warnBefore,
}: {
  name: string;
  typeLabel: string;
  visit: VisitView | null;
  dimmed: boolean;
  clock: string;
  statuses: { key: string; label: string; color: string }[];
  closed: boolean;
  freeTime: number;
  warnBefore: number;
}) {
  const alert = Boolean(visit && visit.flags.length > 0);
  const minutes = visit ? dwellMinutes(visit.checkedInAt, clock) : 0;
  const dwell = visit ? dwellFlag(minutes, freeTime, warnBefore) : null;
  const flags = visit ? orderedFlags(dwell ? [...visit.flags, dwell] : visit.flags) : [];
  return (
    <article
      className={cn(
        "flex min-h-36 flex-col gap-1 rounded-card border-2 bg-white p-2.5",
        closed && "border-dashed bg-slate-100 text-ink-muted",
        visit ? "border-slate-700" : "border-dashed border-line",
        alert && "border-red-800",
        dimmed && "opacity-35",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-ink-muted">
        <span className="font-id text-sm font-semibold text-slate-950">{name}</span>
        <span>{typeLabel}</span>
      </div>
      {visit ? (
        <>
          <p className="font-id text-xl font-semibold leading-tight">{visit.trailerNumber}</p>
          <p className="truncate text-sm">
            {visit.scac} · {visit.carrierName}
          </p>
          <StateChip statusKey={visit.statusKey} label={statusLabel(statuses, visit.statusKey)} />
          <p className="mt-auto font-id text-sm">{formatDwell(minutes)}</p>
          {flags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {flags.slice(0, 2).map((flag) => (
                <FlagChip key={flag.code} code={flag.code} detail={"detail" in flag ? flag.detail : undefined} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-auto text-sm text-ink-muted">{closed ? "Closed" : "Open"}</p>
      )}
    </article>
  );
}

function VisitTable({
  visits,
  clock,
  statuses,
  freeTime,
  warnBefore,
  onClear,
}: {
  visits: VisitView[];
  clock: string;
  statuses: { key: string; label: string; color: string }[];
  freeTime: number;
  warnBefore: number;
  onClear: (visitId: string) => void;
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
                <StateChip statusKey={visit.statusKey} label={statusLabel(statuses, visit.statusKey)} />
              </td>
              <td className="font-id px-3 py-3">{formatDwell(dwellMinutes(visit.checkedInAt, clock))}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {orderedFlags(
                    dwellFlag(dwellMinutes(visit.checkedInAt, clock), freeTime, warnBefore)
                      ? [...visit.flags, dwellFlag(dwellMinutes(visit.checkedInAt, clock), freeTime, warnBefore)!]
                      : visit.flags,
                  ).map((flag) => (
                    <FlagChip key={flag.code} code={flag.code} detail={flag.detail} />
                  ))}
                  {visit.flags.some((flag) => flag.code === "reefer_temp") ? (
                    <button type="button" data-touch className="min-h-touch-min rounded-card border-2 border-slate-950 px-2 text-sm" onClick={() => onClear(visit.id)}>
                      Clear TEMP
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
