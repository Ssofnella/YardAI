import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDatabase();
  const rows = await db.query<{ content_type: string; bytes: unknown }>(
    `select content_type, bytes from photos where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return new Response("Photo not found", { status: 404 });
  const bytes = toBytes(row.bytes);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function toBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    return Buffer.from(hex, "hex");
  }
  throw new Error("Unreadable photo");
}
