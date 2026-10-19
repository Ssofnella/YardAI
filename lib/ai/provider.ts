import { askYard, groundAnswer } from "@/lib/ai/ask";
import { proposeMoves, rankPlaces, recommendPlace } from "@/lib/ai/heuristic";
import type {
  AiProviderId,
  AskAnswer,
  AskContext,
  OptimizeInput,
  OptimizeMove,
  PlaceRecommendation,
  RecommendInput,
} from "@/lib/ai/types";

export type YardAiProvider = {
  id: AiProviderId;
  recommend(input: RecommendInput): Promise<PlaceRecommendation>;
  optimize(input: OptimizeInput): Promise<{ moves: OptimizeMove[]; provider: AiProviderId }>;
  ask(question: string, ctx: AskContext): Promise<AskAnswer>;
};

export function heuristicProvider(): YardAiProvider {
  return {
    id: "heuristic",
    async recommend(input) {
      return recommendPlace(input);
    },
    async optimize(input) {
      return { moves: proposeMoves(input), provider: "heuristic" };
    },
    async ask(question, ctx) {
      return groundAnswer({ ...askYard(question, ctx), asOf: ctx.now }, ctx);
    },
  };
}

type ChatMessage = { role: "system" | "user"; content: string | ChatContent[] };
type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function completeText(options: {
  system: string;
  user: string;
  imageDataUrl?: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const key = process.env.YARD_AI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.YARD_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.YARD_AI_MODEL || (options.imageDataUrl ? "gpt-4o-mini" : "gpt-4o-mini");
  const content: ChatContent[] = [{ type: "text", text: options.user }];
  if (options.imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: options.imageDataUrl } });
  }
  const messages: ChatMessage[] = [
    { role: "system", content: options.system },
    { role: "user", content: options.imageDataUrl ? content : options.user },
  ];
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

function modelProvider(fallback: YardAiProvider): YardAiProvider {
  return {
    id: "model",
    async recommend(input) {
      const base = await fallback.recommend(input);
      const ranked = rankPlaces(input).slice(0, 3);
      const raw = await completeText({
        system:
          "You assign yard trailers. Reply with JSON only: {\"id\":\"place id\",\"reason\":\"one sentence\"}. Pick only from the candidate ids.",
        user: JSON.stringify({
          request: input.request,
          candidates: ranked.map((item) => ({
            id: item.place.id,
            name: item.place.name,
            kind: item.place.kind,
            reason: item.reason,
          })),
        }),
        timeoutMs: 6000,
      });
      if (!raw) return { ...base, provider: "heuristic" };
      try {
        const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
          id?: string;
          reason?: string;
        };
        const picked = ranked.find((item) => item.place.id === parsed.id);
        if (!picked) return { ...base, provider: "heuristic" };
        const reason = (parsed.reason ?? picked.reason).replace(/\s+/g, " ").trim();
        return {
          ...picked,
          reason: reason || picked.reason,
          provider: "model",
        };
      } catch {
        return { ...base, provider: "heuristic" };
      }
    },
    async optimize(input) {
      const result = await fallback.optimize(input);
      return result;
    },
    async ask(question, ctx) {
      const grounded = await fallback.ask(question, ctx);
      if (grounded.action) return grounded;
      const raw = await completeText({
        system:
          "Answer a yard clerk in one or two sentences using only the JSON. If the JSON does not contain the answer, say so. Do not invent trailers.",
        user: JSON.stringify({
          question,
          heuristic: grounded.text,
          visits: ctx.visits.slice(0, 40),
          appointments: ctx.appointments.slice(0, 40),
        }),
        timeoutMs: 8000,
      });
      if (!raw) return grounded;
      return groundAnswer(
        { ...grounded, text: raw.replace(/\s+/g, " ").trim(), provider: "model" },
        ctx,
      );
    },
  };
}

export function providerFor(env: { key?: string | null } = {}): YardAiProvider {
  const key = env.key ?? process.env.YARD_AI_API_KEY;
  if (!key?.trim()) return heuristicProvider();
  return modelProvider(heuristicProvider());
}

export function activeProvider(): YardAiProvider {
  return providerFor();
}
