"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CloudCheck, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { formatSiteClock } from "@/lib/domain/time";
import { t } from "@/lib/i18n";
import { cn } from "cn";
import { useSync } from "@/components/sync/sync-provider";
import { useYard } from "@/components/yard-provider";

const NAV = [
  { href: "/", label: "Yard" },
  { href: "/doors", label: "Doors" },
  { href: "/gate", label: "Gate" },
  { href: "/setup", label: "Setup" },
  { href: "/events", label: "Events" },
  { href: "/simulator", label: "Simulator" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, asOf, error } = useYard();
  const sync = useSync();
  const timezone = state?.site.timezone ?? "America/Chicago";
  const clock = asOf ? formatSiteClock(asOf, timezone) : "Loading clock…";
  const locale = state?.config.snapshot.policies?.locale === "es" ? "es" : "en";

  if (pathname.startsWith("/tv")) {
    return <div className="min-h-dvh bg-white text-slate-950">{children}</div>;
  }

  return (
    <div className="min-h-dvh bg-white text-slate-950">
      <header className="sticky top-0 z-30 border-b-2 border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/" data-touch className="inline-flex min-h-touch-min items-center text-sm font-semibold tracking-[0.22em] text-primary">
                {t("app.name", locale).toUpperCase()}
              </Link>
              <p className="text-fl-meta text-ink-muted">
                {state ? `${state.site.companyName} · ${state.site.name}` : "Loading the yard…"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="font-id text-fl-meta">{clock}</p>
              <SyncPill online={sync.online} pending={sync.pending} failed={sync.failed} sending={sync.sending} />
            </div>
          </div>
          <nav className="flex gap-4 overflow-x-auto pb-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-touch
                  className={cn(
                    "inline-flex min-h-touch-field shrink-0 items-center rounded-card border-2 px-4 text-fl-label",
                    active ? "border-primary bg-primary text-white" : "border-slate-950 bg-white text-slate-950",
                  )}
                >
                  {t(
                    item.href === "/"
                      ? "nav.yard"
                      : item.href === "/doors"
                        ? "nav.doors"
                        : item.href === "/gate"
                          ? "nav.gate"
                          : item.href === "/setup"
                            ? "nav.setup"
                            : item.href === "/events"
                              ? "nav.events"
                              : "nav.simulator",
                    locale,
                  )}
                </Link>
              );
            })}
            <RoleSwitch />
          </nav>
        </div>
      </header>
      {state?.clock.mode === "sim" ? (
        <div className="border-b border-amber-700/30 bg-amber-100 px-4 py-2 text-sm text-amber-950">
          Simulated shift time. Dwell and new gate stamps follow this clock until the day is reset.
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-fl-meta text-ink-muted">
        Fictional demo. Lakeshore Provisions, the carriers, and the drivers are not real.
        {state?.config.snapshot.policies
          ? ` Device ${state.config.snapshot.policies.deviceType.replaceAll("_", " ")}. ${
              state.config.snapshot.policies.spotsNumbered ? "Spots are numbered." : "Spots are unnumbered."
            } ${state.config.snapshot.policies.gateCount === 1 ? "One gate." : "Two gates."}`
          : ""}
      </footer>
    </div>
  );
}

function SyncPill({
  online,
  pending,
  failed,
  sending,
}: {
  online: boolean;
  pending: number;
  failed: number;
  sending: boolean;
}) {
  if (failed > 0) {
    return (
      <p className="inline-flex min-h-touch-min items-center gap-2 rounded-full bg-flag-seal px-3 text-fl-meta text-white">
        <TriangleAlert aria-hidden className="size-4" /> {failed} needs review
      </p>
    );
  }
  if (!online) {
    return (
      <p className="inline-flex min-h-touch-min items-center gap-2 rounded-full bg-slate-200 px-3 text-fl-meta text-slate-900">
        <CloudOff aria-hidden className="size-4" /> Offline. {pending} saved on this tablet
      </p>
    );
  }
  if (sending || pending > 0) {
    return (
      <p className="inline-flex min-h-touch-min items-center gap-2 rounded-full bg-slate-200 px-3 text-fl-meta text-slate-900">
        <RefreshCw aria-hidden className="size-4 animate-spin" /> Sending {pending}...
      </p>
    );
  }
  return (
    <p className="inline-flex min-h-touch-min items-center gap-2 rounded-full bg-emerald-100 px-3 text-fl-meta text-emerald-900">
      <CloudCheck aria-hidden className="size-4" /> All sent
    </p>
  );
}

function RoleSwitch() {
  const [role, setRole] = useState("gate");
  useEffect(() => {
    setRole(window.localStorage.getItem("yardline.role") ?? "gate");
  }, []);
  return (
    <label className="inline-flex min-h-touch-field items-center gap-2 text-fl-meta">
      Acting as
      <select
        data-touch
        value={role}
        aria-label="Acting role"
        className="min-h-touch-field rounded-card border-2 border-line bg-white px-2"
        onChange={(event) => {
          setRole(event.target.value);
          window.localStorage.setItem("yardline.role", event.target.value);
        }}
      >
        <option value="gate">Gate</option>
        <option value="office">Office</option>
        <option value="admin">Admin</option>
      </select>
    </label>
  );
}
