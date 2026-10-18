"use client";

import { deriveDoorStatus, statusColor, statusLabel } from "@/lib/domain/config";
import { dwellMinutes, formatDwell } from "@/lib/domain/dwell";
import { doorTypeLabel, flagLabel } from "@/components/labels";
import { StatusPill } from "@/components/status-pill";
import { useYard } from "@/components/yard-provider";
import { cn } from "cn";

export function DoorBoard() {
  const { state, asOf, loading } = useYard();
  if (loading && !state) return <p className="text-muted-foreground">Loading doors…</p>;
  if (!state) return <p>The door board did not load.</p>;

  const snapshot = state.config.snapshot;
  const clock = asOf ?? state.clock.asOf;
  const byDoor = new Map(
    state.visits.filter((visit) => visit.locationKind === "door").map((visit) => [visit.locationId, visit]),
  );
  const known = new Set(snapshot.doors.map((door) => door.id));
  const missing = state.visits.filter(
    (visit) => visit.locationKind === "door" && !known.has(visit.locationId ?? ""),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Doors</h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.doors.length} doors · {byDoor.size} occupied · live means the driver is waiting
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {snapshot.doors
          .slice()
          .sort((a, b) => a.sort - b.sort)
          .map((door) => {
            const visit = byDoor.get(door.id) ?? null;
            const doorKey = deriveDoorStatus(
              visit ? { statusKey: visit.statusKey, workCompletedAt: visit.workCompletedAt } : null,
            );
            return (
              <article
                key={door.id}
                className={cn(
                  "flex min-h-44 flex-col gap-2 rounded-xl border-2 bg-card p-4",
                  visit ? "border-foreground/15" : "border-dashed border-border",
                  visit && visit.flags.length > 0 && "border-destructive",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="equip text-2xl font-semibold leading-none">{door.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {doorTypeLabel(door.type)}
                    </p>
                  </div>
                  <StatusPill
                    label={statusLabel(snapshot.doorStatuses, doorKey)}
                    color={statusColor(snapshot.doorStatuses, doorKey)}
                  />
                </div>
                {visit ? (
                  <div className="mt-auto flex flex-col gap-1">
                    <p className="equip text-lg font-semibold">{visit.trailerNumber}</p>
                    <p className="text-sm">
                      {visit.scac} · {visit.carrierName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {visit.handling === "live" ? "Live" : "Drop"} ·{" "}
                      {formatDwell(dwellMinutes(visit.checkedInAt, clock))}
                      {visit.isReefer && visit.tempF != null ? ` · ${visit.tempF}°F` : ""}
                    </p>
                    {visit.flags.length > 0 ? (
                      <p className="text-sm font-semibold text-destructive">
                        {visit.flags.map((flag) => flagLabel(flag.code)).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-auto text-sm text-muted-foreground">Empty</p>
                )}
              </article>
            );
          })}
      </div>
      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {missing.length} trailer{missing.length === 1 ? "" : "s"} reference a door that is no longer in the
          layout.
        </p>
      ) : null}
    </div>
  );
}
