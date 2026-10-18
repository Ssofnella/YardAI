import postgres from "postgres";
import type { Database, Sql } from "@/lib/db/types";

function wrap(sql: postgres.Sql | postgres.TransactionSql): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
  };
}

export function openPostgres(url: string): Database {
  const sql = postgres(url, {
    max: 4,
    prepare: false,
    idle_timeout: 20,
  });
  return {
    ...wrap(sql),
    transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      return sql.begin(async (tx) => fn(wrap(tx))) as Promise<T>;
    },
    close() {
      return sql.end();
    },
  };
}
