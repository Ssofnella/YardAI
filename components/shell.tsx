"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatSiteClock } from "@/lib/domain/time";
import { cn } from "cn";
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
  const timezone = state?.site.timezone ?? "America/Chicago";
  const clock = asOf ? formatSiteClock(asOf, timezone) : "Loading clock…";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link href="/" className="equip text-sm font-semibold tracking-[0.22em] text-primary">
                YARDLINE
              </Link>
              <p className="text-sm text-muted-foreground">
                {state ? `${state.site.companyName} · ${state.site.name}` : "Loading the yard…"}
              </p>
            </div>
            <p className="equip text-sm text-foreground">{clock}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
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
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground">
        Fictional demo. Lakeshore Provisions, the carriers, and the drivers are not real.
      </footer>
    </div>
  );
}
