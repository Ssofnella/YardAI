import { hashFeedKey } from "@/lib/onboarding/keys";
import type { CsvArrival } from "@/lib/onboarding/csv";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { readClock, requireSite } from "@/lib/yard/context";
import { importArrivals } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const presented = request.headers.get("x-yard-key")?.trim() ?? "";
    if (!presented) return Response.json({ error: "Missing x-yard-key" }, { status: 401 });
    const db = await getDatabase();
    const site = await requireSite(db);
    const keys = await db.query<{ key_hash: string }>(
      `select key_hash from feed_keys where site_id = $1`,
      [site.id],
    );
    const hash = hashFeedKey(presented);
    if (!keys.some((row) => row.key_hash === hash)) {
      return Response.json({ error: "Unknown yard key" }, { status: 401 });
    }
    const body = (await request.json()) as Partial<CsvArrival>;
    if (!body.code || !body.trailerNumber || !body.scac || !body.plannedAt) {
      return Response.json(
        { error: "Need code, trailerNumber, scac, and plannedAt." },
        { status: 400 },
      );
    }
    const row: CsvArrival = {
      code: body.code,
      carrierName: body.carrierName || "Webhook carrier",
      scac: body.scac.toUpperCase(),
      trailerNumber: body.trailerNumber,
      loadId: body.loadId || body.code,
      loadType: body.loadType || "inbound",
      emptyOrLoaded: body.emptyOrLoaded === "empty" ? "empty" : "loaded",
      isReefer: Boolean(body.isReefer),
      plannedAt: new Date(body.plannedAt).toISOString(),
      setpointF: body.setpointF ?? null,
      expectedSeal: body.expectedSeal ?? null,
      driverName: body.driverName ?? null,
    };
    const clock = await readClock(db, site.id);
    const result = await importArrivals(db, [row], "manual", clock.asOf);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
