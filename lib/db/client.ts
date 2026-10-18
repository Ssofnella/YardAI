import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { schemaSql } from "@/lib/db/schema";
import { openPglite } from "@/lib/db/pglite";
import { openPostgres } from "@/lib/db/postgres";
import type { Database } from "@/lib/db/types";

const globalStore = globalThis as { __yardlineDb?: Promise<Database> };

export function dataDir(): string {
  return process.env.YARD_DATA_DIR || join(process.cwd(), ".data", "pglite");
}

export function usingEmbeddedPostgres(): boolean {
  return !process.env.DATABASE_URL;
}

async function open(): Promise<Database> {
  const db = process.env.DATABASE_URL
    ? openPostgres(process.env.DATABASE_URL)
    : await openMemoryOrFile();
  await db.exec(schemaSql());
  const { backfillExpectedSeals, seedIfEmpty } = await import("@/lib/seed/demo");
  await seedIfEmpty(db);
  await backfillExpectedSeals(db);
  return db;
}

async function openMemoryOrFile(): Promise<Database> {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return openPglite(dir);
}

export function getDatabase(): Promise<Database> {
  if (!globalStore.__yardlineDb) {
    globalStore.__yardlineDb = open().catch((error) => {
      globalStore.__yardlineDb = undefined;
      throw error;
    });
  }
  return globalStore.__yardlineDb;
}
