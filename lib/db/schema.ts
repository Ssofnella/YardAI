import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

export function schemaSql(): string {
  if (!cached) {
    cached = readFileSync(
      join(process.cwd(), "supabase/migrations/0001_schema.sql"),
      "utf8",
    );
  }
  return cached;
}
