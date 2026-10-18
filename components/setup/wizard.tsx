"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  TIMEZONES,
  defaultPolicies,
  slugKey,
  validateSnapshot,
  type CheckInField,
  type DoorType,
  type FieldType,
  type SiteConfigSnapshot,
  type SpotType,
  type StatusDef,
} from "@/lib/domain/config";
import { formatSiteTime } from "@/lib/domain/time";
import { controlClass, spotTypeLabel } from "@/components/labels";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useYard } from "@/components/yard-provider";

const STEPS = ["Site", "Doors", "Yard", "Statuses", "Check-in form", "Rules", "Review"] as const;

export function SetupWizard() {
  const { state, mutate } = useYard();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SiteConfigSnapshot | null>(null);
  const [note, setNote] = useState("Layout change");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const version = state?.config.version;
  const configId = state?.config.id;
  const snapshotRef = useRef(state?.config.snapshot);
  snapshotRef.current = state?.config.snapshot;

  useEffect(() => {
    if (!snapshotRef.current) return;
    setDraft(structuredClone(snapshotRef.current));
  }, [version, configId]);

  if (!state || !draft) return <p className="text-muted-foreground">Loading setup…</p>;

  const timezone = state.site.timezone;

  function update(partial: Partial<SiteConfigSnapshot>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
    setError(null);
  }

  async function publish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const snapshot = validateSnapshot(draft);
      const result = await mutate("/api/config", { snapshot, note });
      toast.success(`Published version ${String(result.version)}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not publish";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!rollbackId) return;
    setBusy(true);
    try {
      const result = await mutate("/api/config/rollback", { configId: rollbackId });
      toast.success(`Rolled back to version ${String(result.version)}`);
      setRollbackId(null);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Rollback failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Site setup</h1>
        <p className="text-sm text-muted-foreground">
          Version {state.config.version} is live. Publishing saves a new version the yard, doors, and gate
          all read. You can roll back.
        </p>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`h-11 rounded-full px-4 text-sm font-semibold ${
                step === index ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company">
            <input className={controlClass} value={draft.companyName} onChange={(event) => update({ companyName: event.target.value })} />
          </Field>
          <Field label="Site">
            <input className={controlClass} value={draft.siteName} onChange={(event) => update({ siteName: event.target.value })} />
          </Field>
          <Field label="Timezone">
            <select className={controlClass} value={draft.timezone} onChange={(event) => update({ timezone: event.target.value })}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Door count">
              <input
                className={controlClass}
                type="number"
                min={1}
                max={80}
                value={draft.doors.length}
                onChange={(event) => update({ doors: resizeDoors(draft.doors, Number(event.target.value)) })}
              />
            </Field>
            <Button variant="outline" className="h-12" onClick={() => update({ doors: [...draft.doors, newDoor(draft.doors.length + 1, draft.doors)] })}>
              Add door
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {draft.doors.map((door, index) => (
                  <tr key={door.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <input
                        className={`${controlClass} equip`}
                        value={door.name}
                        onChange={(event) => {
                          const doors = draft.doors.slice();
                          doors[index] = { ...door, name: event.target.value };
                          update({ doors });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={controlClass}
                        value={door.type}
                        onChange={(event) => {
                          const doors = draft.doors.slice();
                          doors[index] = { ...door, type: event.target.value as DoorType };
                          update({ doors });
                        }}
                      >
                        <option value="dry">Dry</option>
                        <option value="reefer">Reefer</option>
                        <option value="both">Dry + reefer</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        disabled={draft.doors.length === 1}
                        onClick={() => update({ doors: draft.doors.filter((item) => item.id !== door.id).map((item, i) => ({ ...item, sort: i + 1 })) })}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === 2 ? <YardStep draft={draft} update={update} /> : null}
      {step === 3 ? <StatusStep draft={draft} update={update} /> : null}
      {step === 4 ? <FormStep draft={draft} update={update} /> : null}
      {step === 5 ? <RulesStep draft={draft} update={update} /> : null}

      {step === 6 ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold">
              {draft.siteName} · {draft.timezone}
            </p>
            <p className="mt-1">
              {draft.doors.length} doors ({draft.doors.filter((door) => door.type !== "dry").length} reefer-capable) ·{" "}
              {draft.zones.length} zones · {draft.spots.length} spots ·{" "}
              {draft.checkInFields.filter((field) => field.enabled).length} check-in fields
            </p>
            <p className="mt-1">
              Reefer alert when temperature is more than {draft.reefer.tempToleranceF}°F off set point, or fuel is
              under {draft.reefer.minFuelPct}%.
            </p>
          </div>
          <Field label="Note for this version">
            <input className={controlClass} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="h-12" disabled={busy} onClick={() => void publish()}>
            {busy ? "Publishing…" : "Publish config"}
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Versions</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {state.versions.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm">
                  <span>
                    <span className="font-semibold">v{item.version}</span>
                    {item.id === state.config.id ? " · live" : ""} · {item.note || "No note"} ·{" "}
                    {formatSiteTime(item.createdAt, timezone)}
                  </span>
                  {item.id === state.config.id ? null : (
                    <Button variant="outline" className="h-10" onClick={() => setRollbackId(item.id)}>
                      Roll back
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" className="h-11" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
          Back
        </Button>
        <Button className="h-11" disabled={step === STEPS.length - 1} onClick={() => setStep((value) => value + 1)}>
          Next
        </Button>
      </div>

      <Dialog open={Boolean(rollbackId)} onOpenChange={(open) => !open && setRollbackId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back this config?</DialogTitle>
            <DialogDescription>
              The yard board, door board, and gate form switch to that version immediately. Later versions stay
              in the history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackId(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void rollback()}>
              Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YardStep({
  draft,
  update,
}: {
  draft: SiteConfigSnapshot;
  update: (partial: Partial<SiteConfigSnapshot>) => void;
}) {
  const [zoneName, setZoneName] = useState("New zone");
  const [count, setCount] = useState(4);
  const [prefix, setPrefix] = useState("X");
  const [zoneId, setZoneId] = useState(draft.zones[0]?.id ?? "");
  const [type, setType] = useState<SpotType>("dry");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {draft.zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1">
            <input
              className="w-32 bg-transparent text-sm font-semibold outline-none"
              value={zone.name}
              onChange={(event) =>
                update({
                  zones: draft.zones.map((item) => (item.id === zone.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <button
              type="button"
              className="text-xs font-semibold"
              onClick={() =>
                update({
                  zones: draft.zones.filter((item) => item.id !== zone.id),
                  spots: draft.spots.filter((spot) => spot.zoneId !== zone.id),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="New zone">
          <input className={controlClass} value={zoneName} onChange={(event) => setZoneName(event.target.value)} />
        </Field>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => {
            const id = crypto.randomUUID();
            update({ zones: [...draft.zones, { id, name: zoneName || "Zone", sort: draft.zones.length + 1 }] });
            setZoneId(id);
          }}
        >
          Add zone
        </Button>
      </div>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
        <Field label="Zone">
          <select className={controlClass} value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
            {draft.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many spots">
          <input className={controlClass} type="number" min={1} max={40} value={count} onChange={(event) => setCount(Number(event.target.value))} />
        </Field>
        <Field label="Name prefix">
          <input className={controlClass} value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase())} />
        </Field>
        <Field label="Type">
          <select className={controlClass} value={type} onChange={(event) => setType(event.target.value as SpotType)}>
            <option value="dry">Dry</option>
            <option value="reefer">Reefer plug</option>
            <option value="staging">Staging</option>
            <option value="holding">Holding</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </Field>
        <Button
          className="h-12 md:col-span-4"
          onClick={() => update({ spots: addSpots(draft.spots, zoneId, count, prefix || "S", type) })}
        >
          Add spots
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {draft.zones.map((zone) => {
          const spots = draft.spots.filter((spot) => spot.zoneId === zone.id);
          return (
            <section key={zone.id}>
              <h2 className="mb-2 font-semibold">
                {zone.name} · {spots.length}
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {spots.map((spot) => (
                  <div key={spot.id} className="rounded-lg border border-border bg-card p-2">
                    <input
                      className="equip w-full bg-transparent font-semibold outline-none"
                      value={spot.name}
                      onChange={(event) =>
                        update({
                          spots: draft.spots.map((item) => (item.id === spot.id ? { ...item, name: event.target.value } : item)),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">{spotTypeLabel(spot.type)}</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-destructive"
                      onClick={() => update({ spots: draft.spots.filter((item) => item.id !== spot.id) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StatusStep({
  draft,
  update,
}: {
  draft: SiteConfigSnapshot;
  update: (partial: Partial<SiteConfigSnapshot>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StatusEditor
        title="Trailer statuses"
        statuses={draft.trailerStatuses}
        onChange={(trailerStatuses) => update({ trailerStatuses })}
      />
      <StatusEditor
        title="Door statuses"
        statuses={draft.doorStatuses}
        onChange={(doorStatuses) => update({ doorStatuses })}
      />
    </div>
  );
}

function StatusEditor({
  title,
  statuses,
  onChange,
}: {
  title: string;
  statuses: StatusDef[];
  onChange: (statuses: StatusDef[]) => void;
}) {
  const [label, setLabel] = useState("");
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {statuses
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map((status, index, list) => (
          <div key={status.id} className="grid items-center gap-2 rounded-lg border border-border bg-card p-2 md:grid-cols-[auto_1fr_auto_auto]">
            <input
              type="color"
              value={status.color}
              aria-label={`${status.label} color`}
              className="h-11 w-14 cursor-pointer rounded-md border border-input bg-card"
              onChange={(event) => onChange(statuses.map((item) => (item.id === status.id ? { ...item, color: event.target.value } : item)))}
            />
            <input
              className={controlClass}
              value={status.label}
              onChange={(event) => onChange(statuses.map((item) => (item.id === status.id ? { ...item, label: event.target.value } : item)))}
            />
            <StatusPill label={status.label} color={status.color} />
            <div className="flex gap-1">
              <Button variant="outline" className="h-11" disabled={index === 0} onClick={() => onChange(moveStatus(list, index, -1))}>
                Up
              </Button>
              <Button variant="outline" className="h-11" disabled={index === list.length - 1} onClick={() => onChange(moveStatus(list, index, 1))}>
                Down
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                disabled={status.system}
                onClick={() => onChange(statuses.filter((item) => item.id !== status.id).map((item, i) => ({ ...item, sort: i + 1 })))}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="New status">
          <input className={controlClass} value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => {
            const keyBase = slugKey(label);
            if (!keyBase || !label.trim()) return;
            let key = keyBase;
            let n = 2;
            while (statuses.some((item) => item.key === key)) {
              key = `${keyBase}_${n}`;
              n += 1;
            }
            onChange([
              ...statuses,
              { id: crypto.randomUUID(), key, label: label.trim(), color: "#1d4ed8", sort: statuses.length + 1 },
            ]);
            setLabel("");
          }}
        >
          Add status
        </Button>
      </div>
    </section>
  );
}

function FormStep({
  draft,
  update,
}: {
  draft: SiteConfigSnapshot;
  update: (partial: Partial<SiteConfigSnapshot>) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);

  function patchField(id: string, partial: Partial<CheckInField>) {
    update({
      checkInFields: draft.checkInFields.map((field) => (field.id === id ? { ...field, ...partial } : field)),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Temperature tolerance (°F)">
          <input
            className={controlClass}
            type="number"
            min={0}
            max={40}
            value={draft.reefer.tempToleranceF}
            onChange={(event) => update({ reefer: { ...draft.reefer, tempToleranceF: Number(event.target.value) } })}
          />
        </Field>
        <Field label="Fuel floor (%)">
          <input
            className={controlClass}
            type="number"
            min={0}
            max={100}
            value={draft.reefer.minFuelPct}
            onChange={(event) => update({ reefer: { ...draft.reefer, minFuelPct: Number(event.target.value) } })}
          />
        </Field>
      </div>
      <ul className="flex flex-col gap-2">
        {draft.checkInFields.map((field) => (
          <li key={field.id} className="grid items-center gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[1fr_auto_auto_auto]">
            <div>
              <p className="font-medium">{field.label}</p>
              <p className="text-xs text-muted-foreground">
                {field.type}
                {field.builtin ? "" : " · custom"}
                {field.showWhen === "reefer" ? " · reefer only" : ""}
                {field.locked ? " · required" : ""}
              </p>
            </div>
            <Toggle
              label="Shown"
              checked={field.enabled}
              disabled={field.locked}
              onChange={(enabled) => patchField(field.id, { enabled })}
            />
            <Toggle
              label="Required"
              checked={field.required}
              disabled={field.locked || !field.enabled}
              onChange={(next) => patchField(field.id, { required: next })}
            />
            {field.builtin ? <span /> : (
              <Button variant="ghost" onClick={() => update({ checkInFields: draft.checkInFields.filter((item) => item.id !== field.id) })}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <Field label="New field label">
          <input className={controlClass} value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field label="Type">
          <select className={controlClass} value={type} onChange={(event) => setType(event.target.value as FieldType)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="checkbox">Checkbox</option>
            <option value="dropdown">Dropdown</option>
            <option value="photo">Photo</option>
            <option value="signature">Signature</option>
          </select>
        </Field>
        {type === "dropdown" ? (
          <Field label="Options, comma separated">
            <input className={controlClass} value={options} onChange={(event) => setOptions(event.target.value)} />
          </Field>
        ) : null}
        <Toggle label="Required" checked={required} onChange={setRequired} />
        <Button
          className="h-12"
          onClick={() => {
            const key = `custom_${slugKey(label)}`;
            if (!label.trim() || draft.checkInFields.some((field) => field.key === key)) return;
            const field: CheckInField = {
              id: crypto.randomUUID(),
              key,
              label: label.trim(),
              type,
              required,
              builtin: false,
              enabled: true,
              options: type === "dropdown" ? options.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
            };
            update({ checkInFields: [...draft.checkInFields, field] });
            setLabel("");
            setOptions("");
            setRequired(false);
          }}
        >
          Add field
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-5" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function resizeDoors(doors: SiteConfigSnapshot["doors"], count: number) {
  const safe = Math.max(1, Math.min(80, Number.isFinite(count) ? count : doors.length));
  const next = doors.slice(0, safe).map((door, index) => ({ ...door, sort: index + 1 }));
  while (next.length < safe) next.push(newDoor(next.length + 1, next));
  return next;
}

function newDoor(n: number, existing: { name: string }[]) {
  let name = `D${String(n).padStart(2, "0")}`;
  while (existing.some((door) => door.name === name)) name = `${name}B`;
  return { id: crypto.randomUUID(), name, type: "dry" as const, sort: n };
}

function RulesStep({
  draft,
  update,
}: {
  draft: SiteConfigSnapshot;
  update: (partial: Partial<SiteConfigSnapshot>) => void;
}) {
  const policies = draft.policies ?? defaultPolicies();
  function setPolicies(partial: Partial<typeof policies>) {
    update({ policies: { ...policies, ...partial } });
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Device">
        <select className={controlClass} value={policies.deviceType} onChange={(event) => setPolicies({ deviceType: event.target.value as typeof policies.deviceType })}>
          <option value="ipad_landscape">iPad landscape</option>
          <option value="ipad_portrait">iPad portrait</option>
          <option value="android_tablet">Android tablet</option>
          <option value="phone">Phone</option>
        </select>
      </Field>
      <Field label="Language">
        <select className={controlClass} value={policies.locale} onChange={(event) => setPolicies({ locale: event.target.value === "es" ? "es" : "en" })}>
          <option value="en">English</option>
          <option value="es">Español (catalog not shipped yet)</option>
        </select>
      </Field>
      <Field label="Gates">
        <select className={controlClass} value={String(policies.gateCount)} onChange={(event) => setPolicies({ gateCount: event.target.value === "2" ? 2 : 1 })}>
          <option value="1">One gate</option>
          <option value="2">Two gates</option>
        </select>
      </Field>
      <Field label="Spot numbers">
        <select className={controlClass} value={policies.spotsNumbered ? "yes" : "no"} onChange={(event) => setPolicies({ spotsNumbered: event.target.value === "yes" })}>
          <option value="yes">Numbered spots</option>
          <option value="no">Unnumbered rows</option>
        </select>
      </Field>
      <Field label="Seal mismatch">
        <select className={controlClass} value={policies.sealMismatchPolicy} onChange={(event) => setPolicies({ sealMismatchPolicy: event.target.value as typeof policies.sealMismatchPolicy })}>
          <option value="allow_with_reason">Hold or accept with a reason</option>
          <option value="hold">Hold only</option>
          <option value="note">Note it and keep moving</option>
        </select>
      </Field>
      <Field label="Who can clear TEMP">
        <select
          className={controlClass}
          value={policies.clearTempRoles.includes("gate") ? "all" : "office"}
          onChange={(event) =>
            setPolicies({
              clearTempRoles: event.target.value === "all" ? ["admin", "office", "gate"] : ["admin", "office"],
            })
          }
        >
          <option value="office">Office and admin</option>
          <option value="all">Gate can clear it too</option>
        </select>
      </Field>
      <Field label="Temperature tolerance (°F)">
        <input
          className={controlClass}
          type="number"
          min={0}
          max={40}
          value={draft.reefer.tempToleranceF}
          onChange={(event) => update({ reefer: { ...draft.reefer, tempToleranceF: Number(event.target.value) } })}
        />
      </Field>
      <Field label="Low fuel at or below">
        <select className={controlClass} value={policies.lowFuelAtOrBelow} onChange={(event) => setPolicies({ lowFuelAtOrBelow: event.target.value as typeof policies.lowFuelAtOrBelow })}>
          <option value="E">E</option>
          <option value="1/4">1/4</option>
          <option value="1/2">1/2</option>
        </select>
      </Field>
      <Field label="Free time (minutes)">
        <input className={controlClass} type="number" min={0} max={1440} value={policies.freeTimeMinutes} onChange={(event) => setPolicies({ freeTimeMinutes: Number(event.target.value) })} />
      </Field>
      <Field label="Warn before free time (minutes)">
        <input className={controlClass} type="number" min={0} value={policies.warnBeforeMinutes} onChange={(event) => setPolicies({ warnBeforeMinutes: Number(event.target.value) })} />
      </Field>
      <p className="md:col-span-2 text-sm text-muted-foreground">
        Blind seal entry is {policies.blindSealEntry ? "on" : "off"}. The expected seal stays hidden until the clerk checks what is on the trailer.
      </p>
    </div>
  );
}

function addSpots(
  spots: SiteConfigSnapshot["spots"],
  zoneId: string,
  count: number,
  prefix: string,
  type: SpotType,
) {
  const next = spots.slice();
  const safeCount = Math.max(1, Math.min(40, count || 1));
  const cols = 8;
  const inZone = next.filter((spot) => spot.zoneId === zoneId).length;
  for (let i = 0; i < safeCount; i += 1) {
    const index = inZone + i;
    let name = `${prefix}${String(index + 1).padStart(2, "0")}`;
    while (next.some((spot) => spot.name.toLowerCase() === name.toLowerCase())) name = `${name}B`;
    next.push({
      id: crypto.randomUUID(),
      zoneId,
      name,
      type,
      row: Math.floor(index / cols),
      col: index % cols,
    });
  }
  return next;
}

function moveStatus(list: StatusDef[], index: number, direction: number) {
  const sorted = list.slice().sort((a, b) => a.sort - b.sort);
  const target = index + direction;
  const copy = sorted.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  return copy.map((status, i) => ({ ...status, sort: i + 1 }));
}
