"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatSiteTime } from "@/lib/domain/time";
import { DAY_SCRIPT } from "@/lib/simulator/script";
import { Button } from "@/components/ui/button";
import { useYard } from "@/components/yard-provider";

const SPEEDS = [
  { speed: 1, label: "1 min/s", detail: "shift ~12 min" },
  { speed: 2, label: "2 min/s", detail: "shift ~6 min" },
  { speed: 4, label: "4 min/s", detail: "shift ~3 min" },
  { speed: 8, label: "8 min/s", detail: "shift ~90 sec" },
  { speed: 16, label: "16 min/s", detail: "shift ~45 sec" },
];

export function SimulatorPanel() {
  const { state, asOf, mutate } = useYard();
  const [speed, setSpeed] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!state) return <p className="text-muted-foreground">Loading the simulator…</p>;
  const status = state.clock.status;
  const timezone = state.site.timezone;
  const planted = DAY_SCRIPT.filter((stop) => stop.exceptions.length > 0);

  async function run(action: string) {
    setBusy(action);
    try {
      const result = await mutate("/api/simulator", { action, speed });
      const message = typeof result.message === "string" ? result.message : "Updated";
      toast.success(message);
      setConfirmReset(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulator failed");
    } finally {
      setBusy(null);
    }
  }

  const playLabel =
    status === "running" ? "Playing" : status === "paused" ? "Resume" : status === "done" ? "Play again" : "Play the shift";
  const playAction = status === "paused" ? "resume" : status === "done" ? "replay" : "start";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Simulator</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Plays one fictional shift at Lakeshore DC: arrivals, door moves, live unloads, and check-outs.
          It uses the same check-in path as the gate. Nothing here is a real carrier or driver.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Shift clock</p>
        <p className="equip mt-2 text-4xl font-semibold">
          {asOf ? formatSiteTime(asOf, timezone) : "—"}
        </p>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {status}
          {state.clock.mode === "sim" ? ` · ${state.clock.speed} simulated minutes per second` : " · wall clock"}
          {state.clock.lastError ? ` · ${state.clock.lastError}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SPEEDS.map((item) => (
            <button
              key={item.speed}
              type="button"
              onClick={() => {
                setSpeed(item.speed);
                if (status === "running" || status === "paused") {
                  void runSpeed(item.speed);
                }
              }}
              className={`h-14 min-w-24 rounded-lg border px-3 text-left ${
                speed === item.speed ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
              }`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs opacity-80">{item.detail}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="h-12 px-5" disabled={busy !== null || status === "running"} onClick={() => void run(playAction)}>
            {busy === playAction ? "Starting…" : playLabel}
          </Button>
          <Button
            variant="outline"
            className="h-12 px-5"
            disabled={busy !== null || status !== "running"}
            onClick={() => void run("pause")}
          >
            Pause
          </Button>
          {confirmReset ? (
            <Button variant="destructive" className="h-12 px-5" disabled={busy !== null} onClick={() => void run("reset")}>
              Confirm reset
            </Button>
          ) : (
            <Button variant="outline" className="h-12 px-5" onClick={() => setConfirmReset(true)}>
              Reset to morning
            </Button>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Planted exceptions</h2>
        <ul className="mt-3 grid gap-2">
          {planted.map((stop) => (
            <li key={stop.code} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="equip font-semibold">{stop.code}</span>{" "}
              <span className="text-muted-foreground">{stop.scac}</span> {stop.trailerNumber}
              <span className="mt-1 block">{stop.summary}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  async function runSpeed(next: number) {
    try {
      await mutate("/api/simulator", { action: "speed", speed: next });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change speed");
    }
  }
}
