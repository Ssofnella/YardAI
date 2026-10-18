"use client";

import { useEffect, useState } from "react";
import { CloudOff, Snowflake } from "lucide-react";
import { toast } from "sonner";
import type { FuelMark } from "@/lib/domain/config";
import { reeferAlerts } from "@/lib/domain/reefer";
import { sealGlyphs } from "@/lib/domain/seals";
import { formatSiteTime } from "@/lib/domain/time";
import { deleteDraft, loadDrafts, saveDraft } from "@/lib/client/outbox";
import { t } from "@/lib/i18n";
import { FlagChip } from "@/components/status-chip";
import { useSync } from "@/components/sync/sync-provider";
import { useYard } from "@/components/yard-provider";
import type { AppointmentView } from "@/lib/yard/state";
import { cn } from "cn";

type SealDecision = "hold" | "accept" | null;
type Fuel = FuelMark;

type FormState = {
  id: string;
  arrivedAt: string;
  arrivalReason: string;
  query: string;
  appointmentId: string;
  trailerNumber: string;
  scac: string;
  carrierName: string;
  tractorNumber: string;
  driverName: string;
  emptyOrLoaded: "" | "loaded" | "empty";
  loadType: string;
  seal: string;
  sealChecked: boolean;
  noSeal: boolean;
  sealDecision: SealDecision;
  sealReason: string;
  isReefer: boolean;
  unitRunning: boolean | null;
  setpointF: number | null;
  tempF: number | null;
  fuel: Fuel | null;
  locationId: string;
  gateName: string;
};

const REASONS = ["Broken", "Missing", "Number mismatch", "Other"];
const TIME_REASONS = ["Queue", "Was busy", "Other"];
const FUELS: Fuel[] = ["E", "1/4", "1/2", "3/4", "F"];

function blankForm(arrivedAt: string, gateName: string): FormState {
  return {
    id: crypto.randomUUID(),
    arrivedAt,
    arrivalReason: "",
    query: "",
    appointmentId: "",
    trailerNumber: "",
    scac: "",
    carrierName: "",
    tractorNumber: "",
    driverName: "",
    emptyOrLoaded: "",
    loadType: "inbound",
    seal: "",
    sealChecked: false,
    noSeal: false,
    sealDecision: null,
    sealReason: "",
    isReefer: false,
    unitRunning: null,
    setpointF: null,
    tempF: null,
    fuel: null,
    locationId: "",
    gateName,
  };
}

export function GateScreen() {
  const { state, asOf, refresh } = useYard();
  const sync = useSync();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [form, setForm] = useState<FormState | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const [timeReason, setTimeReason] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [resume, setResume] = useState<{ id: string; form: FormState } | null>(null);
  const [visitId, setVisitId] = useState("");
  const [sealOut, setSealOut] = useState("");
  const [confirmOut, setConfirmOut] = useState(false);
  const [role, setRole] = useState("gate");

  useEffect(() => {
    const stored = window.localStorage.getItem("yardline.role");
    if (stored) setRole(stored);
    void loadDrafts().then((rows) => {
      const latest = rows[rows.length - 1];
      if (latest && latest.form && typeof latest.form === "object") {
        setResume({ id: latest.id, form: latest.form as FormState });
      }
    });
  }, []);

  useEffect(() => {
    if (!form) return;
    const handle = window.setTimeout(() => {
      void saveDraft({ id: form.id, updatedAt: new Date().toISOString(), form });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [form]);

  const clock = asOf ?? state?.clock.asOf ?? new Date().toISOString();
  const snapshot = state?.config.snapshot;
  const policies = snapshot?.policies;
  const expected = state?.appointments.filter((item) => item.status === "expected") ?? [];
  const selected = expected.find((item) => item.id === form?.appointmentId) ?? null;

  if (!state || !snapshot || !policies) {
    return <p className="text-fl-body text-ink-muted">Loading the gate…</p>;
  }

  const locale = policies.locale === "es" ? "es" : "en";
  const occupied = new Set(state.visits.map((visit) => visit.locationId).filter(Boolean));

  function patch(partial: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...partial } : current));
    setSuccess(null);
  }

  function startArrival() {
    const gateName = policies?.gateCount === 2 ? "Gate 1" : "Gate";
    setForm(blankForm(clock, gateName));
    setEditingTime(false);
    setSuccess(null);
  }

  function chooseAppointment(appointment: AppointmentView) {
    patch({
      appointmentId: appointment.id,
      trailerNumber: appointment.trailerNumber ?? "",
      scac: appointment.scac,
      carrierName: appointment.carrierName,
      tractorNumber: appointment.tractorNumber ?? "",
      driverName: appointment.driverName ?? "",
      emptyOrLoaded: appointment.emptyOrLoaded === "empty" ? "empty" : "loaded",
      loadType: appointment.loadType,
      isReefer: appointment.isReefer,
      setpointF: appointment.setpointF,
      sealChecked: false,
      sealDecision: null,
      query: "",
    });
  }

  const hiddenSeal = policies.blindSealEntry ? selected?.expectedSeal ?? "" : "";
  const sealComparable = Boolean(hiddenSeal) && Boolean(form?.sealChecked);
  const glyphs = sealComparable && form ? sealGlyphs(hiddenSeal, form.noSeal ? "" : form.seal) : null;
  const sealMismatch = Boolean(glyphs?.found.some((glyph) => glyph.differs));

  const reefer = form
    ? reeferAlerts(
        {
          isReefer: form.isReefer,
          setpointF: form.setpointF,
          tempF: form.tempF,
          fuelPct: null,
          fuelLevel: form.fuel,
          unitRunning: form.unitRunning,
        },
        { ...snapshot.reefer, lowFuelAtOrBelow: policies.lowFuelAtOrBelow },
      )
    : null;

  const holdingOnly = Boolean(form?.sealDecision === "hold" || (sealMismatch && policies.sealMismatchPolicy === "hold" && form?.sealDecision !== "accept"));
  const spotChoices = snapshot.spots.filter((spot) => {
    if (spot.type === "out_of_service") return false;
    if (holdingOnly && spot.type !== "holding") return false;
    return true;
  });
  const suggested =
    spotChoices.find((spot) => !occupied.has(spot.id) && (form?.isReefer ? spot.type === "reefer" || spot.type === "holding" : true)) ??
    spotChoices.find((spot) => !occupied.has(spot.id)) ??
    null;

  const missing: string[] = [];
  if (form) {
    if (form.trailerNumber.trim().length < 3) missing.push("Trailer number");
    if (!form.scac.trim()) missing.push("SCAC");
    if (!form.emptyOrLoaded) missing.push("Loaded or empty");
    if (form.emptyOrLoaded === "loaded" && !form.noSeal && form.seal.trim().length < 3) missing.push("Seal number");
    if (hiddenSeal && !form.sealChecked) missing.push("Check the seal");
    if (sealMismatch && !form.sealDecision) missing.push("Seal decision");
    if (sealMismatch && form.sealDecision && !form.sealReason) missing.push("Seal reason");
    if (policies.sealMismatchPolicy === "hold" && form.sealDecision === "accept") missing.push("Accept is turned off");
    if (form.isReefer && form.unitRunning == null) missing.push("Unit running");
    if (form.isReefer && form.tempF == null) missing.push("Display temperature");
    if (!form.locationId && !suggested) missing.push("Spot");
  }

  async function submitCheckIn() {
    if (!form || missing.length || !state) return;
    const locationId = form.locationId || suggested?.id;
    if (!locationId) return;
    const deviceId = window.localStorage.getItem("yardline.device") ?? crypto.randomUUID();
    window.localStorage.setItem("yardline.device", deviceId);
    try {
      await sync.enqueue("check_in", {
        commandId: form.id,
        eventId: crypto.randomUUID(),
        trailerNumber: form.trailerNumber,
        scac: form.scac,
        carrierName: form.carrierName,
        tractorNumber: form.tractorNumber,
        driverName: form.driverName,
        sealNumber: form.noSeal ? "" : form.seal,
        loadType: form.loadType,
        emptyOrLoaded: form.emptyOrLoaded,
        isReefer: form.isReefer,
        setpointF: form.setpointF,
        tempF: form.tempF,
        fuelLevel: form.fuel,
        unitRunning: form.unitRunning,
        appointmentId: form.appointmentId || null,
        locationKind: "spot",
        locationId,
        arrivedAt: form.arrivedAt,
        arrivalReason: form.arrivalReason || null,
        sealDecision: form.sealDecision ?? (sealMismatch ? null : "match"),
        sealReason: form.sealReason || null,
        deviceId,
        gateName: form.gateName,
        occurredAt: clock,
      });
      await sync.flush();
      await refresh();
      await deleteDraft(form.id);
      const spot = state.config.snapshot.spots.find((item) => item.id === locationId);
      const local = !sync.online || sync.pending > 0;
      setSuccess(
        local
          ? `${form.trailerNumber} saved on this tablet`
          : `${form.trailerNumber} checked in. Go to ${spot?.name ?? "the yard"}.`,
      );
      setForm(null);
      setResume(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save on this tablet");
    }
  }

  async function submitCheckOut() {
    if (!visitId) return;
    try {
      await sync.enqueue("check_out", { visitId, sealOut, role });
      await sync.flush();
      await refresh();
      setConfirmOut(false);
      setSealOut("");
      setVisitId("");
      toast.success(t("gate.savedLocal", locale));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  }

  const matches =
    form && form.query.trim().length >= 2
      ? expected
          .filter((item) => {
            const hay = `${item.trailerNumber ?? ""} ${item.scac} ${item.code} ${item.carrierName}`.toLowerCase();
            return hay.includes(form.query.trim().toLowerCase());
          })
          .slice(0, 6)
      : [];

  return (
    <div data-screen="gate" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-fl-title text-ink">{mode === "in" ? t("gate.title", locale) : t("gate.checkOut", locale)}</h1>
        <div className="flex gap-4">
          <ModeButton active={mode === "in"} onClick={() => setMode("in")} label={t("gate.checkIn", locale)} />
          <ModeButton active={mode === "out"} onClick={() => setMode("out")} label={t("gate.checkOut", locale)} />
        </div>
      </div>

      {mode === "out" ? (
        <Checkout
          visits={state.visits}
          visitId={visitId}
          sealOut={sealOut}
          confirm={confirmOut}
          onVisit={setVisitId}
          onSeal={setSealOut}
          onAsk={() => setConfirmOut(true)}
          onCancel={() => setConfirmOut(false)}
          onConfirm={() => void submitCheckOut()}
          timezone={state.site.timezone}
        />
      ) : !form ? (
        <div className="flex flex-col gap-4">
          {resume ? (
            <button
              type="button"
              data-touch
              className="min-h-touch-field rounded-card border-2 border-line bg-white px-4 text-left text-fl-label"
              onClick={() => setForm(resume.form)}
            >
              Resume {resume.form.trailerNumber || "check-in"} started{" "}
              {formatSiteTime(resume.form.arrivedAt, state.site.timezone)}
            </button>
          ) : null}
          <button
            type="button"
            data-primary
            data-touch
            className="min-h-touch-primary rounded-card bg-primary text-fl-title text-white"
            onClick={startArrival}
          >
            {t("gate.newArrival", locale)}
          </button>
          <p className="text-fl-body text-ink-muted">
            {expected.length} expected today. New arrival stamps the time before you type anything.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-wrap items-center gap-4 border-l-4 border-primary pl-4">
              <div>
                <p className="text-fl-label">{t("gate.arrived", locale)}</p>
                <p className="font-id text-fl-id">{formatSiteTime(form.arrivedAt, state.site.timezone)}</p>
              </div>
              <button
                type="button"
                data-touch
                className="min-h-touch-field rounded-card border-2 border-slate-950 bg-white px-4 text-fl-label"
                onClick={() => {
                  setEditingTime((value) => !value);
                  setTimeDraft(form.arrivedAt.slice(0, 16));
                }}
              >
                {t("gate.editTime", locale)}
              </button>
              {editingTime ? (
                <div className="flex w-full flex-col gap-4">
                  <input
                    type="datetime-local"
                    data-touch
                    className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-body"
                    value={timeDraft}
                    onChange={(event) => setTimeDraft(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-4">
                    {TIME_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        data-touch
                        className={cn(
                          "min-h-touch-field rounded-card border-2 px-4 text-fl-label",
                          timeReason === reason ? "border-primary bg-primary text-white" : "border-line bg-white",
                        )}
                        onClick={() => setTimeReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-touch
                    className="min-h-touch-field rounded-card bg-slate-950 px-4 text-fl-label text-white"
                    onClick={() => {
                      const next = new Date(timeDraft);
                      if (Number.isNaN(next.getTime())) return;
                      if (next.getTime() > new Date(clock).getTime()) {
                        toast.error("Arrival time can only be moved earlier");
                        return;
                      }
                      if (!timeReason) {
                        toast.error("Pick a reason");
                        return;
                      }
                      patch({ arrivedAt: next.toISOString(), arrivalReason: timeReason });
                      setEditingTime(false);
                    }}
                  >
                    Save earlier time
                  </button>
                </div>
              ) : null}
            </section>

            {policies.gateCount === 2 ? (
              <div className="flex gap-4" role="radiogroup" aria-label="Gate">
                {["Gate 1", "Gate 2"].map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={form.gateName === name}
                    data-touch
                    className={cn(
                      "min-h-touch-field flex-1 rounded-card border-2 text-fl-label",
                      form.gateName === name ? "border-primary bg-primary text-white" : "border-line bg-white",
                    )}
                    onClick={() => patch({ gateName: name })}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex flex-col gap-2">
              <span className="text-fl-label">{t("gate.find", locale)}</span>
              <input
                data-touch
                value={form.query}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => patch({ query: event.target.value.toUpperCase() })}
                className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-body"
                placeholder="Trailer, SCAC, or appointment"
              />
            </label>
            {matches.map((item) => (
              <button
                key={item.id}
                type="button"
                data-touch
                className="min-h-touch-field rounded-card border-2 border-line bg-white px-4 text-left"
                onClick={() => chooseAppointment(item)}
              >
                <span className="font-id text-fl-id">{item.trailerNumber}</span>
                <span className="mt-1 block text-fl-body">
                  {item.scac} · {item.carrierName}
                  {item.isReefer ? " · Reefer" : ""}
                </span>
              </button>
            ))}

            {selected ? (
              <div className="rounded-card border-2 border-primary bg-white p-4">
                <p className="text-fl-meta text-ink-muted">{t("gate.expected", locale)}</p>
                <p className="font-id text-fl-id">{selected.trailerNumber}</p>
                <p className="text-fl-body">
                  {selected.scac} {selected.carrierName}
                  {selected.isReefer ? (
                    <Snowflake aria-hidden className="ml-2 inline size-5" />
                  ) : null}
                </p>
                <button type="button" data-touch className="mt-3 min-h-touch-min text-fl-label underline" onClick={() => patch({ appointmentId: "" })}>
                  Change
                </button>
              </div>
            ) : null}

            <label className="flex flex-col gap-2">
              <span className="text-fl-label">{t("gate.trailer", locale)}</span>
              <input
                data-touch
                value={form.trailerNumber}
                onChange={(event) => patch({ trailerNumber: event.target.value.toUpperCase().replace(/[\s-]+/g, "") })}
                className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-id"
              />
              <span className="text-fl-meta text-ink-muted">{t("gate.trailerHelp", locale)}</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-fl-label">Carrier</span>
                <input
                  data-touch
                  value={form.carrierName}
                  onChange={(event) => patch({ carrierName: event.target.value })}
                  className="min-h-touch-field rounded-card border-2 border-line px-3 text-fl-body"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-fl-label">SCAC</span>
                <input
                  data-touch
                  value={form.scac}
                  onChange={(event) => patch({ scac: event.target.value.toUpperCase() })}
                  className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-body"
                />
              </label>
            </div>

            <div role="radiogroup" aria-label="Loaded or empty" className="flex gap-4">
              {(["loaded", "empty"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.emptyOrLoaded === value}
                  data-touch
                  className={cn(
                    "min-h-touch-field flex-1 rounded-card border-2 text-fl-label",
                    form.emptyOrLoaded === value ? "border-primary bg-primary text-white" : "border-line bg-white",
                  )}
                  onClick={() => patch({ emptyOrLoaded: value })}
                >
                  {value === "loaded" ? t("gate.loaded", locale) : t("gate.empty", locale)}
                </button>
              ))}
            </div>

            <section className="flex flex-col gap-4 border-l-4 border-primary pl-4">
              <p className="text-fl-label">{t("gate.seal", locale)}</p>
              <input
                data-touch
                value={form.seal}
                aria-label={t("gate.sealPrompt", locale)}
                placeholder={t("gate.sealPrompt", locale)}
                onChange={(event) =>
                  patch({
                    seal: event.target.value.toUpperCase(),
                    noSeal: false,
                    sealChecked: false,
                    sealDecision: null,
                    sealReason: "",
                  })
                }
                className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-id"
              />
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  data-touch
                  className="min-h-touch-field rounded-card border-2 border-slate-950 bg-white px-4 text-fl-label"
                  onClick={() => patch({ noSeal: true, seal: "", sealChecked: true, sealDecision: null })}
                >
                  {t("gate.noSeal", locale)}
                </button>
                <button
                  type="button"
                  data-touch
                  className="min-h-touch-field rounded-card bg-slate-950 px-4 text-fl-label text-white"
                  onClick={() => patch({ sealChecked: true })}
                >
                  {t("gate.checkSeal", locale)}
                </button>
              </div>
              {sealMismatch && glyphs ? (
                <div className="rounded-card bg-flag-seal p-4 text-white">
                  <p className="text-fl-title">{t("gate.sealMismatch", locale)}</p>
                  <p className="mt-3 text-fl-meta">{t("gate.expected", locale)}</p>
                  <DigitRow glyphs={glyphs.expected} />
                  <p className="mt-3 text-fl-meta">{t("gate.found", locale)}</p>
                  <DigitRow glyphs={glyphs.found} />
                  <div className="mt-4 flex flex-wrap gap-4">
                    <button
                      type="button"
                      data-touch
                      className="min-h-touch-field rounded-card bg-white px-4 text-fl-label text-slate-950"
                      onClick={() => patch({ seal: "", sealChecked: false, sealDecision: null, sealReason: "" })}
                    >
                      {t("gate.reenter", locale)}
                    </button>
                    <button
                      type="button"
                      data-touch
                      className="min-h-touch-field rounded-card bg-slate-950 px-4 text-fl-label text-yellow-300"
                      onClick={() => patch({ sealDecision: "hold", locationId: "" })}
                    >
                      {t("gate.hold", locale)}
                    </button>
                    {policies.sealMismatchPolicy !== "hold" ? (
                      <button
                        type="button"
                        data-touch
                        className="min-h-touch-field rounded-card border-2 border-white px-4 text-fl-label"
                        onClick={() => patch({ sealDecision: "accept" })}
                      >
                        {t("gate.accept", locale)}
                      </button>
                    ) : null}
                  </div>
                  {form.sealDecision ? (
                    <div className="mt-4 flex flex-wrap gap-4">
                      {REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          data-touch
                          className={cn(
                            "min-h-touch-field rounded-card border-2 px-4 text-fl-label",
                            form.sealReason === reason ? "border-yellow-300 bg-yellow-300 text-slate-950" : "border-white",
                          )}
                          onClick={() => patch({ sealReason: reason })}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-fl-label">{t("gate.reefer", locale)}</p>
                <button
                  type="button"
                  data-touch
                  className={cn(
                    "min-h-touch-field rounded-card border-2 px-4 text-fl-label",
                    form.isReefer ? "border-flag-reefer bg-flag-reefer text-white" : "border-line bg-white",
                  )}
                  onClick={() => patch({ isReefer: !form.isReefer })}
                >
                  Reefer trailer
                </button>
              </div>
              {form.isReefer ? (
                <>
                  {reefer?.outOfRange ? (
                    <div className="flex flex-wrap gap-2">
                      {reefer.tempOutOfRange ? <FlagChip code="reefer_temp" detail={reefer.reasons[0]} /> : null}
                      {reefer.fuelLow ? <FlagChip code="reefer_fuel" /> : null}
                      {reefer.unitOff ? <FlagChip code="reefer_unit" /> : null}
                    </div>
                  ) : null}
                  <p className="text-fl-label">{t("gate.unitRunning", locale)}</p>
                  <div role="radiogroup" aria-label="Unit running" className="flex gap-4">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        role="radio"
                        aria-checked={form.unitRunning === value}
                        data-touch
                        className={cn(
                          "min-h-touch-field flex-1 rounded-card border-2 text-fl-label",
                          form.unitRunning === value ? "border-primary bg-primary text-white" : "border-line bg-white",
                        )}
                        onClick={() => patch({ unitRunning: value })}
                      >
                        {value ? t("gate.yes", locale) : t("gate.no", locale)}
                      </button>
                    ))}
                  </div>
                  <Stepper label={t("gate.setPoint", locale)} value={form.setpointF} onChange={(setpointF) => patch({ setpointF })} />
                  <Stepper label={t("gate.display", locale)} value={form.tempF} onChange={(tempF) => patch({ tempF })} />
                  <p className="text-fl-label">{t("gate.fuel", locale)}</p>
                  <div role="radiogroup" aria-label="Fuel" className="flex flex-wrap gap-4">
                    {FUELS.map((mark) => (
                      <button
                        key={mark}
                        type="button"
                        role="radio"
                        aria-checked={form.fuel === mark}
                        data-touch
                        className={cn(
                          "min-h-touch-field min-w-touch-field rounded-card border-2 px-3 font-id text-fl-label",
                          form.fuel === mark ? "border-primary bg-primary text-white" : "border-line bg-white",
                        )}
                        onClick={() => patch({ fuel: mark })}
                      >
                        {mark}
                      </button>
                    ))}
                  </div>
                  {reefer && !reefer.outOfRange && form.tempF != null ? (
                    <p className="text-fl-label text-emerald-800">{t("gate.inRange", locale)}</p>
                  ) : null}
                </>
              ) : null}
            </section>

            <label className="flex flex-col gap-2">
              <span className="text-fl-label">Driver</span>
              <input
                data-touch
                value={form.driverName}
                onChange={(event) => patch({ driverName: event.target.value })}
                className="min-h-touch-field rounded-card border-2 border-line px-3 text-fl-body"
              />
            </label>
          </div>

          <aside className="flex flex-col gap-4 rounded-card border-2 border-line bg-white p-4 lg:sticky lg:top-24">
            <p className="font-id text-fl-id">{form.trailerNumber || "—"}</p>
            <p className="text-fl-body">{form.carrierName || "Carrier"} {form.scac}</p>
            <p className="text-fl-meta">Arrived {formatSiteTime(form.arrivedAt, state.site.timezone)}</p>
            <div className="flex flex-wrap gap-2">
              {sealMismatch ? <FlagChip code="seal_mismatch" /> : null}
              {form.sealDecision === "hold" ? <FlagChip code="hold" /> : null}
              {reefer?.tempOutOfRange ? <FlagChip code="reefer_temp" /> : null}
              {reefer?.fuelLow ? <FlagChip code="reefer_fuel" /> : null}
            </div>
            <div className="rounded-card border-2 border-dashed border-line p-3">
              <p className="text-fl-meta text-ink-muted">Suggested spot</p>
              <p className="font-id text-fl-id">{suggested && policies.spotsNumbered ? suggested.name : suggested?.type ?? "None open"}</p>
              {suggested ? (
                <button
                  type="button"
                  data-touch
                  className="mt-3 min-h-touch-field w-full rounded-card bg-primary text-fl-label text-white"
                  onClick={() => patch({ locationId: suggested.id })}
                >
                  {t("gate.useSpot", locale)} {policies.spotsNumbered ? suggested.name : suggested.type}
                </button>
              ) : null}
            </div>
            <label className="flex flex-col gap-2 text-fl-label">
              {t("gate.chooseAnother", locale)}
              <select
                data-touch
                className="min-h-touch-field rounded-card border-2 border-line bg-white px-2"
                value={form.locationId}
                onChange={(event) => patch({ locationId: event.target.value })}
              >
                <option value="">Suggested</option>
                {spotChoices.map((spot) => (
                  <option key={spot.id} value={spot.id} disabled={occupied.has(spot.id)}>
                    {policies.spotsNumbered ? spot.name : spot.type}
                    {occupied.has(spot.id) ? " occupied" : ""}
                  </option>
                ))}
              </select>
            </label>
            {missing.length ? (
              <ul className="text-fl-meta text-red-800">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              data-primary
              data-touch
              disabled={missing.length > 0}
              className="min-h-touch-primary rounded-card bg-primary text-fl-title text-white disabled:opacity-50"
              onClick={() => void submitCheckIn()}
            >
              {t("gate.checkIn", locale)}
              {missing.length ? ` (${missing.length} left)` : ""}
            </button>
            {!sync.online ? (
              <p className="flex items-center gap-2 text-fl-meta text-slate-900">
                <CloudOff aria-hidden className="size-4" /> Saved on this tablet until the network returns
              </p>
            ) : null}
          </aside>
        </div>
      )}

      {success ? (
        <p className="rounded-card bg-emerald-100 p-4 text-fl-title text-emerald-900" role="status">
          {success}
        </p>
      ) : null}
    </div>
  );
}

function DigitRow({ glyphs }: { glyphs: { char: string; differs: boolean }[] }) {
  return (
    <p className="mt-1 flex flex-wrap gap-1 font-id text-fl-hero">
      {glyphs.map((glyph, index) => (
        <span
          key={`${glyph.char}-${index}`}
          className={cn(
            "inline-flex min-w-10 justify-center",
            glyph.differs && "underline decoration-4 underline-offset-4 outline outline-2 outline-yellow-300",
          )}
        >
          {glyph.char}
        </span>
      ))}
    </p>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const current = value ?? 0;
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        data-touch
        aria-label={`Decrease ${label}`}
        className="min-h-touch-field min-w-touch-field rounded-card border-2 border-slate-950 text-fl-title"
        onClick={() => onChange(current - 1)}
      >
        −
      </button>
      <div>
        <p className="text-fl-meta">{label}</p>
        <p className="font-id text-fl-hero">{value == null ? "—" : `${value}°F`}</p>
      </div>
      <button
        type="button"
        data-touch
        aria-label={`Increase ${label}`}
        className="min-h-touch-field min-w-touch-field rounded-card border-2 border-slate-950 text-fl-title"
        onClick={() => onChange((value ?? 0) + 1)}
      >
        +
      </button>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-touch
      className={cn(
        "min-h-touch-field rounded-card border-2 px-4 text-fl-label",
        active ? "border-primary bg-primary text-white" : "border-line bg-white",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Checkout({
  visits,
  visitId,
  sealOut,
  confirm,
  onVisit,
  onSeal,
  onAsk,
  onCancel,
  onConfirm,
  timezone,
}: {
  visits: { id: string; trailerNumber: string; scac: string; locationLabel: string | null; flags: { code: string }[] }[];
  visitId: string;
  sealOut: string;
  confirm: boolean;
  onVisit: (id: string) => void;
  onSeal: (value: string) => void;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  timezone: string;
}) {
  const selected = visits.find((visit) => visit.id === visitId) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        {visits.length === 0 ? <p className="text-fl-body">No trailers on site.</p> : null}
        {visits.map((visit) => (
          <button
            key={visit.id}
            type="button"
            data-touch
            className={cn(
              "min-h-touch-field rounded-card border-2 px-4 text-left",
              visitId === visit.id ? "border-primary bg-blue-50" : "border-line bg-white",
            )}
            onClick={() => onVisit(visit.id)}
          >
            <span className="font-id text-fl-id">{visit.trailerNumber}</span>
            <span className="block text-fl-body">
              {visit.scac} · {visit.locationLabel}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {selected ? (
          <>
            <p className="text-fl-body">
              {selected.trailerNumber} leaves at {formatSiteTime(new Date().toISOString(), timezone)}
            </p>
            {selected.flags.some((flag) => flag.code === "hold") ? (
              <p className="text-fl-body text-red-800">HOLD is open. Gate cannot check this trailer out.</p>
            ) : null}
            <input
              data-touch
              value={sealOut}
              aria-label="Outbound seal"
              placeholder="Outbound seal"
              onChange={(event) => onSeal(event.target.value.toUpperCase())}
              className="min-h-touch-field rounded-card border-2 border-line px-3 font-id text-fl-id"
            />
            {!confirm ? (
              <button
                type="button"
                data-primary
                data-touch
                className="min-h-touch-primary rounded-card bg-primary text-fl-title text-white"
                onClick={onAsk}
              >
                Check out
              </button>
            ) : (
              <div className="flex flex-col gap-4 rounded-card border-2 border-slate-950 p-4">
                <p className="text-fl-title">Check out {selected.trailerNumber}?</p>
                <p className="font-id text-fl-hero">{sealOut || "No seal"}</p>
                <button type="button" data-primary data-touch className="min-h-touch-primary rounded-card bg-primary text-fl-title text-white" onClick={onConfirm}>
                  Confirm check-out
                </button>
                <button type="button" data-touch className="min-h-touch-field rounded-card border-2 border-slate-950 text-fl-label" onClick={onCancel}>
                  Go back
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-fl-body text-ink-muted">Pick a trailer on site.</p>
        )}
      </div>
    </div>
  );
}
