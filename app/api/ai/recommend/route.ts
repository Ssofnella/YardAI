import { recommendPlace } from "@/lib/ai/heuristic";
import { activeProvider } from "@/lib/ai/provider";
import type { ArrivalRequest } from "@/lib/ai/types";
import { recommendInput } from "@/lib/ai/snapshot";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { readClock, requireSite } from "@/lib/yard/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ArrivalRequest>;
    const db = await getDatabase();
    const site = await requireSite(db);
    const clock = await readClock(db, site.id);
    const input = await recommendInput(db, clock.asOf, {
      isReefer: Boolean(body.isReefer),
      loadType: body.loadType || "inbound",
      emptyOrLoaded: body.emptyOrLoaded === "empty" ? "empty" : "loaded",
      handling: body.handling ?? "auto",
      plannedAt: body.plannedAt ?? null,
      restrict: body.restrict ?? null,
    });
    const rules = recommendPlace(input);
    const provider = activeProvider();
    if (provider.id === "heuristic") return Response.json({ recommendation: rules });
    const raced = await Promise.race([
      provider.recommend(input),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return Response.json({ recommendation: raced ?? rules });
  } catch (error) {
    return apiError(error);
  }
}
