"use client";

import { useEffect, useState } from "react";
import { dwellMinutes } from "@/lib/domain/dwell";
import { formatSiteTime } from "@/lib/domain/time";
import { riskFlags } from "@/lib/ai/heuristic";
import type { OptimizeMove } from "@/lib/ai/types";
import { useYard } from "@/components/yard-provider";

const CHECKS = [
  { id: "doors", label: "Confirm the door numbers on this board." },
  { id: "gate", label: "At the gate, accept or override an arrival recommendation." },
  { id: "optimize", label: "Open Optimize my yard. Accept a move only if a hostler should do it." },
  { id: "ask", label: "Ask which reefers have been here over 4 hours." },
];

export function YardTools() {
  const { state, asOf, refresh } = useYard();
  const [openCheck, setOpenCheck] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [moves, setMoves] = useState<OptimizeMove[] | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [optimizeNote, setOptimizeNote] = useState<string | null>(null);
  const [question, setQuestion] = useState("Which reefers have been here over 4 hours?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ label: string; detail: string }[]>([]);
  const [askedAt, setAskedAt] = useState<string | null>(null);
  const [moveAction, setMoveAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checklist") === "1" || window.localStorage.getItem("yardline.checklist") === "open") {
      window.localStorage.setItem("yardline.checklist", "open");
      setOpenCheck(true);
    }
    const stored = window.localStorage.getItem("yardline.checklistItems");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) setDone(parsed);
      } catch {
        setDone([]);
      }
    }
  }, []);

  if (!state) return null;
  const now = asOf ?? state.clock.asOf;
  const policies = state.config.snapshot.policies;
  const risks = riskFlags({
    now,
    freeTimeMinutes: policies.freeTimeMinutes,
    warnBeforeMinutes: policies.warnBeforeMinutes,
    graceMinutes: policies.graceMinutes,
    lowFuelPct: state.config.snapshot.reefer.minFuelPct,
    visits: state.visits.map((visit) => ({
      id: visit.id,
      trailerNumber: visit.trailerNumber,
      scac: visit.scac,
      isReefer: visit.isReefer,
      fuelPct: visit.fuelPct,
      dwellMinutes: dwellMinutes(visit.checkedInAt, now),
      locationName: visit.locationLabel,
    })),
    appointments: state.appointments.map((item) => ({
      code: item.code,
      trailerNumber: item.trailerNumber,
      status: item.status,
      plannedAt: item.plannedAt,
      isReefer: item.isReefer,
    })),
  });
  const latest = state.suggestions[0];
  const latestReason = typeof latest?.payload.reason === "string" ? latest.payload.reason : null;

  function toggleCheck(id: string) {
    const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id];
    setDone(next);
    window.localStorage.setItem("yardline.checklistItems", JSON.stringify(next));
  }

  async function optimize() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/optimize", { method: "POST" });
      const body = (await response.json()) as { moves?: OptimizeMove[]; suggestionId?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not scan the yard");
      setMoves(body.moves ?? []);
      setSuggestionId(body.suggestionId ?? null);
      setOptimizeNote(body.moves?.length ? "Ranked by detention avoided, then dock time freed. Nothing moves until you accept it." : "No re-spot or door swap is worth doing right now.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not scan the yard");
    } finally {
      setBusy(false);
    }
  }

  async function decide(move: OptimizeMove, action: "accept" | "dismiss") {
    if (!suggestionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/moves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          suggestionId,
          visitId: move.visitId,
          toKind: move.to.kind,
          toId: move.to.id,
          toName: move.to.name,
          fromName: move.fromName,
          reason: move.reason,
          kind: move.kind,
          detentionMinutes: move.benefit.detentionMinutes,
          dockIdleMinutes: move.benefit.dockIdleMinutes,
          trailerNumber: move.trailerNumber,
          scac: move.scac,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not record that decision");
      setMoves((current) => current?.filter((item) => item.id !== move.id) ?? null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record that decision");
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await response.json()) as {
        text?: string;
        matches?: { label: string; detail: string }[];
        asOf?: string;
        action?: { label: string } | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Could not answer");
      setAnswer(body.text ?? "");
      setMatches(body.matches ?? []);
      setAskedAt(body.asOf ?? now);
      setMoveAction(body.action?.label ?? null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not answer");
    } finally {
      setBusy(false);
    }
  }

  const timezone = state.config.snapshot.timezone;
  function formatAskTime(iso: string) {
    return formatSiteTime(iso, timezone);
  }

  return (
    <div className="flex flex-col gap-4">
      {openCheck ? (
        <section className="rounded-card border-2 border-primary bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">First-shift checklist</h2>
              <p className="text-sm text-ink-muted">The layout you published is live. These are the checks worth doing before the next truck.</p>
            </div>
            <button
              type="button"
              className="min-h-12 rounded-card border-2 border-slate-950 bg-white px-3 text-sm font-semibold"
              onClick={() => {
                window.localStorage.removeItem("yardline.checklist");
                setOpenCheck(false);
              }}
            >
              Hide
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {CHECKS.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-12 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-6"
                    checked={done.includes(item.id)}
                    onChange={() => toggleCheck(item.id)}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {risks.length ? (
        <section aria-label="Risk flags" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Risk flags</h2>
          <ul className="flex flex-col gap-2">
            {risks.slice(0, 6).map((flag) => (
              <li key={flag.id} className="rounded-card border-2 border-slate-950 bg-white px-3 py-2 text-sm">
                <span className="font-semibold uppercase">{flag.severity === "now" ? "Now" : "Watch"}</span>
                {" · "}
                {flag.kind === "detention" ? "Detention clock" : flag.kind === "reefer_fuel" ? "Reefer fuel" : "Late appointment"}
                {" · "}
                {flag.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {latestReason ? (
        <p className="rounded-card border-2 border-dashed border-line px-3 py-2 text-sm">
          Latest AI note: {latestReason}
        </p>
      ) : null}

      <section id="optimize" className="rounded-card border-2 border-slate-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Optimize my yard</h2>
            <p className="text-sm text-ink-muted">Re-spots and door swaps. Accepting one creates a hostler task. Skipping logs a dismissal.</p>
          </div>
          <button type="button" data-touch className="min-h-touch-field rounded-card bg-primary px-4 text-fl-label text-white" disabled={busy} onClick={() => void optimize()}>
            {busy ? "Scanning…" : "Optimize my yard"}
          </button>
        </div>
        {optimizeNote ? <p className="mt-3 text-sm">{optimizeNote}</p> : null}
        {moves?.length ? (
          <ol className="mt-3 flex flex-col gap-3">
            {moves.map((move) => (
              <li key={move.id} className="rounded-card border-2 border-line p-3">
                <p className="font-semibold">
                  {move.rank}. {move.trailerNumber} · {move.fromName} → {move.to.name}
                </p>
                <p className="text-sm">{move.reason}</p>
                <p className="text-sm text-ink-muted">
                  Detention avoided {move.benefit.detentionMinutes} min · dock time freed {move.benefit.dockIdleMinutes} min
                </p>
                <div className="mt-2 flex gap-3">
          <button type="button" data-touch className="min-h-touch-min rounded-card bg-primary px-3 text-sm font-semibold text-white" disabled={busy || (state.clock.mode === "wall" && Date.now() - new Date(now).getTime() > 120_000)} onClick={() => void decide(move, "accept")}>
                  Send to driver queue
                </button>
                  <button type="button" data-touch className="min-h-touch-min rounded-card border-2 border-slate-950 px-3 text-sm font-semibold" disabled={busy} onClick={() => void decide(move, "dismiss")}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        {state.moveRequests.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Hostler tasks</h3>
            <ul className="mt-2 text-sm">
              {state.moveRequests.map((task) => (
                <li key={task.id}>
                  {task.trailerNumber} {task.fromLocation} → {task.toLocation} ({task.priority})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-card border-2 border-slate-950 p-4">
        <h2 className="text-lg font-semibold">Ask the yard</h2>
        <p className="text-sm text-ink-muted">Read only. Answers cite the records they used. As of {formatAskTime(now)}.</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-h-touch-field flex-1 rounded-card border-2 border-slate-950 px-3"
            aria-label="Ask the yard"
          />
          <button type="button" data-touch className="min-h-touch-field rounded-card border-2 border-slate-950 px-4 text-sm font-semibold" disabled={busy} onClick={() => void ask()}>
            Ask
          </button>
        </div>
        {answer ? <p className="mt-3 text-sm font-semibold">{answer}</p> : null}
        {askedAt ? <p className="text-sm">As of {formatAskTime(askedAt)}. Sources: {matches.length} records.</p> : null}
        {matches.length ? (
          <ul className="mt-2 text-sm">
            {matches.map((match) => (
              <li key={`${match.label}-${match.detail}`}>{match.detail}</li>
            ))}
          </ul>
        ) : null}
        {moveAction ? (
          <a href="#optimize" className="mt-3 inline-flex min-h-12 items-center rounded-card border-2 border-slate-950 px-3 text-sm font-semibold">
            {moveAction}
          </a>
        ) : null}
      </section>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
