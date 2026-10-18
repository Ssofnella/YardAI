import { getDatabase } from "@/lib/db/client";
import { ensureRunner } from "@/lib/simulator/runner";
import { readClock, requireSite } from "@/lib/yard/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const pulse = async () => {
        try {
          ensureRunner();
          const db = await getDatabase();
          const site = await requireSite(db);
          const clock = await readClock(db, site.id);
          const rows = await db.query<{ count: number }>(
            `select count(*)::int as count from events where site_id = $1`,
            [site.id],
          );
          send({
            asOf: clock.asOf,
            eventCount: Number(rows[0]?.count ?? 0),
            simStatus: clock.status,
            speed: clock.speed,
            mode: clock.mode,
            lastError: clock.lastError,
          });
        } catch (error) {
          send({ error: error instanceof Error ? error.message : "stream failed" });
        }
      };
      await pulse();
      const timer = setInterval(() => {
        void pulse();
      }, 1000);
      const close = () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
