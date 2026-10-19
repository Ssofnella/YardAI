export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
};

export type Database = Sql & {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export class YardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "YardError";
    this.status = status;
  }
}
