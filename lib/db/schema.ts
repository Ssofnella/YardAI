import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

export function schemaSql(): string {
  if (!cached) {
    const dir = join(process.cwd(), "supabase/migrations");
    cached = ["0001_schema.sql", "0003_onboarding.sql"]
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
  }
  return cached;
}
