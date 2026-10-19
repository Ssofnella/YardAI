import { inkFor } from "@/components/labels";

export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex h-6 max-w-full items-center truncate rounded-full px-2 text-xs font-semibold"
      style={{ background: color, color: inkFor(color) }}
    >
      {label}
    </span>
  );
}
