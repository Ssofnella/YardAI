"use client";

import type { ImageryConfig } from "@/lib/imagery/naip";
import type { ListingFact } from "@/lib/onboarding/listings";
import type { PhotoKind } from "@/lib/onboarding/photo-draft";

export function ImagerySourceCard({ imagery }: { imagery: ImageryConfig | null }) {
  return (
    <div data-testid="imagery-source-card" className="rounded-card border-2 border-slate-950 bg-white p-3">
      <p className="text-sm font-semibold">Imagery source</p>
      {imagery ? (
        <>
          <p className="mt-1 text-sm">{imagery.label}</p>
          <p className="mt-1 text-sm text-ink-muted">{imagery.note}</p>
          <p className="mt-2 text-xs text-ink-muted">{imagery.attribution}</p>
          {imagery.provider === "txgio" ? (
            <p className="mt-2 text-xs">
              Public-domain StratMap county ortho from the Texas Geographic Information Office (formerly TNRIS). This is not the licensed Hexagon Texas Imagery Service. Google, Mapbox, and Esri imagery are not used.
            </p>
          ) : (
            <p className="mt-2 text-xs">USDA NAIP is the fallback outside a published TxGIO county service. It is not sent to a model.</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">Loading the imagery settings…</p>
      )}
    </div>
  );
}

export function ListingFactsCard({
  facts,
  note,
  skipped,
  onLookup,
  onDemo,
  onDismiss,
  busy,
}: {
  facts: ListingFact[];
  note: string | null;
  skipped: boolean;
  onLookup: () => void;
  onDemo: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  return (
    <div data-testid="listing-facts-card" className="rounded-card border-2 border-slate-950 bg-white p-3">
      <p className="text-sm font-semibold">Listing and records facts</p>
      <p className="mt-1 text-sm text-ink-muted">
        A search API and an AI step can read public listings and appraisal pages for door counts, square footage, and clear height. Yardline keeps the number and the source link. It does not scrape sites, log in, or store listing text or photos.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="min-h-12 rounded-card border-2 border-slate-950 px-3 text-sm font-semibold" disabled={busy} onClick={onLookup}>
          Look up this address
        </button>
        <button type="button" className="min-h-12 rounded-card border-2 border-slate-950 px-3 text-sm font-semibold" disabled={busy} onClick={onDemo}>
          Show demo facts
        </button>
        {facts.length ? (
          <button type="button" className="min-h-12 rounded-card border-2 border-slate-950 px-3 text-sm font-semibold" onClick={onDismiss}>
            Don&apos;t use these facts
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
      {skipped && !facts.length ? <p className="mt-2 text-sm">Lookup skipped. You can still type a door count or upload a photo.</p> : null}
      {facts.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {facts.map((fact) => (
            <li key={fact.field} className="text-sm">
              {fact.display}{" "}
              <a className="underline" href={fact.sourceUrl} target="_blank" rel="noreferrer">
                source
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PhotoUploadCard({
  kind,
  onKind,
  note,
  fileName,
  busy,
  onFile,
  onDemoPhoto,
}: {
  kind: PhotoKind;
  onKind: (kind: PhotoKind) => void;
  note: string | null;
  fileName: string | null;
  busy: boolean;
  onFile: (file: File) => void;
  onDemoPhoto: () => void;
}) {
  return (
    <div data-testid="photo-upload" className="rounded-card border-2 border-slate-950 bg-white p-3">
      <p className="text-sm font-semibold">Your photo or plan</p>
      <p className="mt-1 text-sm text-ink-muted">
        Upload a site plan, a drone photo, or phone photos of the dock wall. With an AI key, vision proposes doors. Without one, the image stays under the map and you place doors yourself.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ["dock_wall", "Dock wall"],
            ["overhead", "Overhead"],
            ["plan", "Site plan"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              kind === id
                ? "min-h-12 rounded-card bg-primary px-3 text-sm font-semibold text-white"
                : "min-h-12 rounded-card border-2 border-slate-950 px-3 text-sm font-semibold"
            }
            onClick={() => onKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="min-h-12 cursor-pointer rounded-card border-2 border-slate-950 px-3 py-3 text-sm font-semibold">
          Choose file
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
        <button type="button" className="min-h-12 rounded-card border-2 border-slate-950 px-3 text-sm font-semibold" disabled={busy} onClick={onDemoPhoto}>
          Use demo dock photo
        </button>
        {fileName ? <span className="text-sm">{fileName}</span> : null}
      </div>
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
    </div>
  );
}
