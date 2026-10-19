import { PGlite } from "@electric-sql/pglite";
import type { Database, Sql } from "@/lib/db/types";

function wrap(queryable: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  exec: (text: string) => Promise<unknown>;
}): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await queryable.query(text, params);
      return result.rows as T[];
    },
    async exec(text: string) {
      await queryable.exec(text);
    },
  };
}

export function wrapPglite(pg: PGlite): Database {
  return {
    ...wrap(pg),
    transaction(fn) {
      return pg.transaction(async (tx) => fn(wrap(tx)));
    },
    close() {
      return pg.close();
    },
  };
}

export async function openPglite(dataDir?: string): Promise<Database> {
  const pg = dataDir
    ? new PGlite(dataDir, { relaxedDurability: true })
    : new PGlite();
  await pg.waitReady;
  return wrapPglite(pg);
}
