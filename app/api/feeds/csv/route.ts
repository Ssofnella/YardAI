import { parseArrivalCsv } from "@/lib/onboarding/csv";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { readClock, requireSite } from "@/lib/yard/context";
import { importArrivals } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { csv?: string };
    const parsed = parseArrivalCsv(body.csv ?? "");
    if (!parsed.rows.length) {
      return Response.json({ error: parsed.errors[0] ?? "Nothing to import", errors: parsed.errors }, { status: 400 });
    }
    const db = await getDatabase();
    const site = await requireSite(db);
    const clock = await readClock(db, site.id);
    const result = await importArrivals(db, parsed.rows, "manual", clock.asOf);
    return Response.json({ ...result, errors: parsed.errors });
  } catch (error) {
    return apiError(error);
  }
}
