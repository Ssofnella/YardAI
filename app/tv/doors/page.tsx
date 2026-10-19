"use client";

import { deriveDoorStatus, statusLabel } from "@/lib/domain/config";
import { dwellMinutes, formatDwell } from "@/lib/domain/dwell";
import { FlagChip, orderedFlags, StateChip } from "@/components/status-chip";
import { useYard } from "@/components/yard-provider";
import { cn } from "cn";

export default function TvDoorsPage() {
  const { state, asOf } = useYard();
  if (!state) return <p className="p-8 text-tv-label">Loading doors…</p>;
  const clock = asOf ?? state.clock.asOf;
  const byDoor = new Map(
    state.visits.filter((visit) => visit.locationKind === "door").map((visit) => [visit.locationId, visit]),
  );
  return (
    <main data-screen="tv-doors" className="min-h-screen bg-white p-6 text-slate-950">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-tv-label">{state.site.name}</p>
          <h1 className="text-tv-label">Doors</h1>
        </div>
        <p className="font-id text-tv-label">{byDoor.size} of {state.config.snapshot.doors.length} in use</p>
      </header>
      <div className="grid grid-cols-5 gap-4">
        {state.config.snapshot.doors
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
                  "flex min-h-52 flex-col gap-2 rounded-card border-2 p-4",
                  visit ? "border-slate-950" : "border-dashed border-line",
                )}
              >
                <p className="font-id text-tv-id leading-none">{door.name}</p>
                <StateChip statusKey={doorKey} label={statusLabel(state.config.snapshot.doorStatuses, doorKey)} />
                {visit ? (
                  <>
                    <p className="font-id text-tv-id">{visit.trailerNumber}</p>
                    <p className="text-tv-label">{visit.scac}</p>
                    <p className="font-id text-2xl">{formatDwell(dwellMinutes(visit.checkedInAt, clock))}</p>
                    <div className="flex flex-wrap gap-1">
                      {orderedFlags(visit.flags).slice(0, 2).map((flag) => (
                        <FlagChip key={flag.code} code={flag.code} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-tv-label text-ink-muted">Empty</p>
                )}
              </article>
            );
          })}
      </div>
    </main>
  );
}
