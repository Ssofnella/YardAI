"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { CheckInField } from "@/lib/domain/config";
import { checkSeals } from "@/lib/domain/seals";
import { formatSiteTime } from "@/lib/domain/time";
import { controlClass, doorTypeLabel, flagLabel, spotTypeLabel } from "@/components/labels";
import { Button } from "@/components/ui/button";
import { useYard } from "@/components/yard-provider";
import type { AppointmentView } from "@/lib/yard/state";
import { cn } from "cn";

type Draft = {
  trailerNumber: string;
  scac: string;
  carrierName: string;
  tractorNumber: string;
  driverName: string;
  sealNumber: string;
  loadType: string;
  loadId: string;
  emptyOrLoaded: string;
  isReefer: boolean;
  setpointF: string;
  tempF: string;
  fuelPct: string;
  appointmentId: string;
  locationKind: "spot" | "door";
  locationId: string;
  photoId: string;
  photoName: string;
  custom: Record<string, string>;
};

const EMPTY: Draft = {
  trailerNumber: "",
  scac: "",
  carrierName: "",
  tractorNumber: "",
  driverName: "",
  sealNumber: "",
  loadType: "inbound",
  loadId: "",
  emptyOrLoaded: "loaded",
  isReefer: false,
  setpointF: "",
  tempF: "",
  fuelPct: "",
  appointmentId: "",
  locationKind: "spot",
  locationId: "",
  photoId: "",
  photoName: "",
  custom: {},
};

type GateResult = {
  title: string;
  notice: string | null;
  flags: { code: string; detail: string }[];
};

export function GateScreen() {
  const { state, asOf, mutate } = useYard();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GateResult | null>(null);
  const [visitId, setVisitId] = useState("");
  const [sealOut, setSealOut] = useState("");
  const [checkoutQuery, setCheckoutQuery] = useState("");

  const occupied = useMemo(() => {
    const ids = new Set<string>();
    for (const visit of state?.visits ?? []) {
      if (visit.locationId) ids.add(visit.locationId);
    }
    return ids;
  }, [state?.visits]);

  useEffect(() => {
    if (!state || draft.locationId) return;
    const spot = state.config.snapshot.spots.find(
      (item) => item.type !== "out_of_service" && !occupied.has(item.id),
    );
    if (spot) setDraft((current) => ({ ...current, locationKind: "spot", locationId: spot.id }));
  }, [state, occupied, draft.locationId]);

  if (!state) return <p className="text-muted-foreground">Loading the gate…</p>;
  const snapshot = state.config.snapshot;
  const timezone = state.site.timezone;
  const clock = asOf ?? state.clock.asOf;
  const expected = state.appointments.filter((item) => item.status === "expected");
  const selected = expected.find((item) => item.id === draft.appointmentId) ?? null;
  const fields = snapshot.checkInFields.filter((field) => field.enabled);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function chooseAppointment(appointment: AppointmentView) {
    patch({
      appointmentId: appointment.id,
      trailerNumber: appointment.trailerNumber ?? "",
      scac: appointment.scac,
      carrierName: appointment.carrierName,
      driverName: appointment.driverName ?? "",
      tractorNumber: appointment.tractorNumber ?? "",
      loadId: appointment.loadId ?? "",
      loadType: appointment.loadType,
      emptyOrLoaded: appointment.emptyOrLoaded,
      isReefer: appointment.isReefer,
      setpointF: appointment.setpointF == null ? "" : String(appointment.setpointF),
    });
  }

  async function submitCheckIn() {
    setBusy(true);
    setResult(null);
    try {
      const custom: Record<string, string> = {};
      for (const field of fields) {
        if (!field.builtin && draft.custom[field.key]) custom[field.key] = draft.custom[field.key];
      }
      const body = await mutate("/api/gate/check-in", {
        trailerNumber: draft.trailerNumber,
        scac: draft.scac,
        carrierName: draft.carrierName,
        tractorNumber: draft.tractorNumber,
        driverName: draft.driverName,
        sealNumber: draft.sealNumber,
        loadType: draft.loadType,
        loadId: draft.loadId,
        emptyOrLoaded: draft.emptyOrLoaded,
        isReefer: draft.isReefer,
        setpointF: numberOrNull(draft.setpointF),
        tempF: numberOrNull(draft.tempF),
        fuelPct: numberOrNull(draft.fuelPct),
        appointmentId: draft.appointmentId || null,
        locationKind: draft.locationKind,
        locationId: draft.locationId,
        photoId: draft.photoId || null,
        customFields: custom,
      });
      const flags = Array.isArray(body.flags) ? (body.flags as GateResult["flags"]) : [];
      const notice = typeof body.notice === "string" ? body.notice : null;
      setResult({
        title: flags.length ? "Checked in with a flag" : "Checked in",
        notice,
        flags,
      });
      toast.success(flags.length ? "Checked in, with a flag" : "Checked in");
      setDraft({ ...EMPTY, locationId: "", locationKind: "spot" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCheckOut() {
    setBusy(true);
    setResult(null);
    try {
      const body = await mutate("/api/gate/check-out", { visitId, sealOut });
      const flags = Array.isArray(body.flags) ? (body.flags as GateResult["flags"]) : [];
      const notice = typeof body.notice === "string" ? body.notice : null;
      setResult({
        title: flags.length ? "Checked out with a seal mismatch" : "Checked out",
        notice,
        flags,
      });
      toast.success(flags.length ? "Checked out, seal mismatch flagged" : "Checked out");
      setVisitId("");
      setSealOut("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  }

  const checkoutVisits = state.visits.filter((visit) => {
    const needle = checkoutQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${visit.trailerNumber} ${visit.scac} ${visit.carrierName}`.toLowerCase().includes(needle);
  });
  const checkoutVisit = state.visits.find((visit) => visit.id === visitId) ?? null;
  const sealPreview = checkoutVisit ? checkSeals(checkoutVisit.sealIn, sealOut) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gate</h1>
        <p className="text-sm text-muted-foreground">
          Tablet check-in and check-out. A mismatch is flagged and the truck still moves.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn(
            "h-14 rounded-xl text-base font-semibold",
            mode === "in" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
          onClick={() => setMode("in")}
        >
          Check in
        </button>
        <button
          type="button"
          className={cn(
            "h-14 rounded-xl text-base font-semibold",
            mode === "out" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
          onClick={() => setMode("out")}
        >
          Check out
        </button>
      </div>

      {result ? (
        <div
          className={cn(
            "rounded-xl border p-4",
            result.flags.length ? "border-destructive bg-destructive/10" : "border-primary/30 bg-primary/5",
          )}
        >
          <p className="font-semibold">{result.title}</p>
          {result.notice ? <p className="mt-1 text-sm">{result.notice}</p> : null}
          {result.flags.length > 0 ? (
            <ul className="mt-2 text-sm">
              {result.flags.map((flag) => (
                <li key={flag.code}>
                  <span className="font-semibold">{flagLabel(flag.code)}. </span>
                  {flag.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mode === "in" ? (
        <div className="flex flex-col gap-5">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Expected arrivals
            </h2>
            {expected.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No one is still expected. A walk-up can check in without a match.
              </p>
            ) : (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {expected.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => chooseAppointment(appointment)}
                    className={cn(
                      "min-w-52 shrink-0 rounded-xl border p-3 text-left",
                      draft.appointmentId === appointment.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card",
                    )}
                  >
                    <span className="equip text-xs text-muted-foreground">{appointment.code}</span>
                    <span className="mt-1 block font-semibold">{appointment.trailerNumber}</span>
                    <span className="block text-sm">
                      {appointment.scac} · {appointment.carrierName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatSiteTime(appointment.plannedAt, timezone)}
                      {appointment.isReefer ? " · reefer" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected ? (
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => patch({ appointmentId: "" })}
              >
                Clear match
              </button>
            ) : null}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) =>
              field.showWhen === "reefer" && !draft.isReefer ? null : (
                <FieldInput
                  key={field.id}
                  field={field}
                  draft={draft}
                  carriers={state.carriers}
                  loadTypes={snapshot.loadTypes}
                  onChange={patch}
                  onCustom={(key, value) =>
                    setDraft((current) => ({ ...current, custom: { ...current.custom, [key]: value } }))
                  }
                />
              ),
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Spot or door
            <select
              className={controlClass}
              value={draft.locationId ? `${draft.locationKind}:${draft.locationId}` : ""}
              onChange={(event) => {
                const [kind, id] = event.target.value.split(":");
                patch({ locationKind: kind === "door" ? "door" : "spot", locationId: id });
              }}
            >
              <optgroup label="Spots">
                {snapshot.spots.map((spot) => (
                  <option key={spot.id} value={`spot:${spot.id}`} disabled={spot.type === "out_of_service" || occupied.has(spot.id)}>
                    {spot.name} · {spotTypeLabel(spot.type)}
                    {occupied.has(spot.id) ? " · occupied" : ""}
                    {spot.type === "out_of_service" ? " · closed" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Doors">
                {snapshot.doors.map((door) => (
                  <option key={door.id} value={`door:${door.id}`} disabled={occupied.has(door.id)}>
                    {door.name} · {doorTypeLabel(door.type)}
                    {occupied.has(door.id) ? " · occupied" : " · live"}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="text-xs font-normal text-muted-foreground">
              A door check-in is a live load. A spot check-in is a drop.
            </span>
          </label>

          <Button className="h-14 text-base" disabled={busy} onClick={() => void submitCheckIn()}>
            {busy ? "Saving…" : "Check in trailer"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <input
            value={checkoutQuery}
            onChange={(event) => setCheckoutQuery(event.target.value)}
            placeholder="Find a trailer on site"
            className={controlClass}
            aria-label="Find a trailer"
          />
          {checkoutVisits.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm">
              No trailers on site match that search.
            </p>
          ) : (
            <div className="grid gap-2">
              {checkoutVisits.map((visit) => (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => {
                    setVisitId(visit.id);
                    setSealOut("");
                  }}
                  className={cn(
                    "rounded-xl border p-4 text-left",
                    visitId === visit.id ? "border-primary bg-primary/10" : "border-border bg-card",
                  )}
                >
                  <span className="equip text-lg font-semibold">{visit.trailerNumber}</span>
                  <span className="mt-1 block text-sm">
                    {visit.scac} · {visit.locationLabel} · seal {visit.sealIn || "none"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {checkoutVisit ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Seal on file</p>
              <p className="equip text-xl font-semibold">{checkoutVisit.sealIn || "None"}</p>
              <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium">
                Seal at check-out
                <input
                  className={controlClass}
                  value={sealOut}
                  onChange={(event) => setSealOut(event.target.value)}
                />
              </label>
              {sealPreview?.mismatch ? (
                <p className="mt-2 text-sm font-semibold text-destructive">
                  This will be flagged as a seal mismatch. Check-out still completes.
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Seals match, or there was no seal to compare.</p>
              )}
              <p className="mt-3 text-sm">
                Check-out time ({timezone}): {formatSiteTime(clock, timezone)}
              </p>
              <Button className="mt-4 h-14 w-full text-base" disabled={busy} onClick={() => void submitCheckOut()}>
                {busy ? "Saving…" : "Check out"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  draft,
  carriers,
  loadTypes,
  onChange,
  onCustom,
}: {
  field: CheckInField;
  draft: Draft;
  carriers: { name: string; scac: string }[];
  loadTypes: { value: string; label: string }[];
  onChange: (partial: Partial<Draft>) => void;
  onCustom: (key: string, value: string) => void;
}) {
  const label = (
    <span>
      {field.label}
      {field.required ? " *" : ""}
      {!field.builtin ? " · custom" : ""}
    </span>
  );

  if (!field.builtin) {
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <CustomControl field={field} value={draft.custom[field.key] ?? ""} onChange={(value) => onCustom(field.key, value)} />
      </label>
    );
  }

  if (field.key === "is_reefer") {
    return (
      <label className="flex h-12 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.isReefer}
          onChange={(event) => onChange({ isReefer: event.target.checked })}
        />
        Reefer
      </label>
    );
  }

  if (field.key === "load_type") {
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <select className={controlClass} value={draft.loadType} onChange={(event) => onChange({ loadType: event.target.value })}>
          {loadTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "empty_or_loaded") {
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <select
          className={controlClass}
          value={draft.emptyOrLoaded}
          onChange={(event) => onChange({ emptyOrLoaded: event.target.value })}
        >
          {(field.options ?? ["loaded", "empty"]).map((option) => (
            <option key={option} value={option}>
              {option === "loaded" ? "Loaded" : option === "empty" ? "Empty" : option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "photo") {
    return (
      <PhotoField
        label={field.label}
        photoId={draft.photoId}
        photoName={draft.photoName}
        onUploaded={(id, name) => onChange({ photoId: id, photoName: name })}
      />
    );
  }

  const map: Record<string, { value: string; key: keyof Draft; type?: string; list?: string }> = {
    trailer_number: { value: draft.trailerNumber, key: "trailerNumber" },
    tractor_number: { value: draft.tractorNumber, key: "tractorNumber" },
    carrier_name: { value: draft.carrierName, key: "carrierName", list: "carriers" },
    scac: { value: draft.scac, key: "scac" },
    driver_name: { value: draft.driverName, key: "driverName" },
    seal_number: { value: draft.sealNumber, key: "sealNumber" },
    load_id: { value: draft.loadId, key: "loadId" },
    setpoint_f: { value: draft.setpointF, key: "setpointF", type: "number" },
    temp_f: { value: draft.tempF, key: "tempF", type: "number" },
    fuel_pct: { value: draft.fuelPct, key: "fuelPct", type: "number" },
  };
  const bound = map[field.key];
  if (!bound) return null;

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        className={cn(controlClass, field.key === "trailer_number" || field.key === "scac" ? "equip" : "")}
        type={bound.type ?? "text"}
        value={bound.value}
        list={bound.list}
        inputMode={bound.type === "number" ? "decimal" : undefined}
        onChange={(event) => {
          const value = field.key === "scac" ? event.target.value.toUpperCase() : event.target.value;
          if (field.key === "scac") {
            const carrier = carriers.find((item) => item.scac === value.trim().toUpperCase());
            onChange({ scac: value, carrierName: carrier?.name ?? draft.carrierName });
            return;
          }
          if (field.key === "carrier_name") {
            const carrier = carriers.find((item) => item.name === value);
            onChange({ carrierName: value, scac: carrier?.scac ?? draft.scac });
            return;
          }
          onChange({ [bound.key]: value } as Partial<Draft>);
        }}
      />
      {field.key === "carrier_name" ? (
        <datalist id="carriers">
          {carriers.map((carrier) => (
            <option key={carrier.scac} value={carrier.name} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function CustomControl({
  field,
  value,
  onChange,
}: {
  field: CheckInField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <span className="flex h-12 items-center gap-3 font-normal">
        <input
          type="checkbox"
          className="size-5"
          checked={value === "true"}
          onChange={(event) => onChange(event.target.checked ? "true" : "false")}
        />
        Yes
      </span>
    );
  }
  if (field.type === "dropdown") {
    return (
      <select className={controlClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "photo") {
    return <PhotoField label="" photoId={value} photoName={value ? "Attached" : ""} onUploaded={(id) => onChange(id)} />;
  }
  if (field.type === "signature") {
    return <SignaturePad value={value} onChange={onChange} />;
  }
  return (
    <input
      className={controlClass}
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function PhotoField({
  label,
  photoId,
  photoName,
  onUploaded,
}: {
  label: string;
  photoId: string;
  photoName: string;
  onUploaded: (id: string, name: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="text-sm"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const dataUrl = await readFile(file);
          const response = await fetch("/api/photos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ dataUrl }),
          });
          const body = (await response.json()) as { id?: string; error?: string };
          if (!response.ok || !body.id) {
            setError(body.error || "Upload failed");
            return;
          }
          setError(null);
          onUploaded(body.id, file.name);
        }}
      />
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photos/${photoId}`} alt={photoName || "Gate photo"} className="mt-1 h-24 w-auto rounded-md border border-border object-cover" />
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        className="h-28 w-full touch-none rounded-lg border border-input bg-white"
        onPointerDown={(event) => {
          drawing.current = true;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = point(event);
          ctx.strokeStyle = "#1c1915";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = point(event);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          const canvas = canvasRef.current;
          if (canvas) onChange(canvas.toDataURL("image/png"));
        }}
      />
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-primary"
        onClick={() => {
          const canvas = canvasRef.current;
          canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
          onChange("");
        }}
      >
        Clear signature {value ? "" : ""}
      </button>
    </div>
  );
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.readAsDataURL(file);
  });
}
