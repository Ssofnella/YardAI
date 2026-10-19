import { activeProvider } from "@/lib/ai/provider";
import { askContext } from "@/lib/ai/snapshot";
import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { readClock, requireSite } from "@/lib/yard/context";
import { logSiteSuggestion } from "@/lib/yard/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = body.question?.trim() ?? "";
    if (question.length < 3) {
      return Response.json({ error: "Ask a longer question." }, { status: 400 });
    }
    const db = await getDatabase();
    const site = await requireSite(db);
    const clock = await readClock(db, site.id);
    const answer = await activeProvider().ask(question, await askContext(db, clock.asOf));
    const suggestionId = `ask:${crypto.randomUUID()}`;
    await logSiteSuggestion(db, {
      kind: "ask",
      suggestionId,
      eventType: "ai.asked",
      source: "manual",
      payload: {
        question,
        answer: answer.text,
        provider: answer.provider,
        matches: answer.matches.slice(0, 12),
      },
    });
    return Response.json({ ...answer, suggestionId });
  } catch (error) {
    return apiError(error);
  }
}
