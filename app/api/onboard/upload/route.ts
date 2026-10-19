import { completeText } from "@/lib/ai/provider";
import { apiError } from "@/lib/http";
import { PHOTO_SYSTEM, parseVisionMarks, type PhotoKind } from "@/lib/onboarding/photo-draft";
import { requireSite } from "@/lib/yard/context";
import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/;

const MANUAL =
  "No AI key. The photo stays as a reference underlay. Place doors on it yourself. Nothing is saved until you accept it.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { dataUrl?: string; kind?: PhotoKind };
    const match = DATA_URL.exec(body.dataUrl ?? "");
    if (!match) {
      return Response.json({ error: "Upload a JPEG, PNG, WebP, or PDF" }, { status: 400 });
    }
    const contentType = match[1];
    const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    const limit = contentType === "application/pdf" ? 4_000_000 : 1_500_000;
    if (bytes.length < 32) return Response.json({ error: "That file looks empty" }, { status: 400 });
    if (bytes.length > limit) return Response.json({ error: "File must be under the upload limit" }, { status: 400 });
    if (body.dataUrl?.startsWith("http")) {
      return Response.json({ error: "Upload the file itself. Remote imagery is not accepted." }, { status: 400 });
    }

    const db = await getDatabase();
    const site = await requireSite(db);
    const id = crypto.randomUUID();
    await db.query(
      `insert into photos (id, site_id, company_id, content_type, bytes) values ($1, $2, $3, $4, $5)`,
      [id, site.id, site.companyId, contentType, bytes],
    );
    const url = `/api/photos/${id}`;
    const kind: PhotoKind = body.kind === "plan" || body.kind === "overhead" || body.kind === "dock_wall" ? body.kind : "dock_wall";

    if (contentType === "application/pdf") {
      return Response.json({
        url,
        contentType,
        manual: true,
        vision: null,
        note: "The PDF is saved as your reference. Yardline does not copy text out of it. Export a page image if you want it under the map, or place doors on the aerial image.",
      });
    }

    const key = process.env.YARD_AI_API_KEY?.trim();
    if (!key) {
      return Response.json({ url, contentType, manual: true, vision: null, note: MANUAL });
    }
    const raw = await completeText({
      system: PHOTO_SYSTEM,
      user: "Count and place the doors you can see. Spots only if this is an overhead photo or a site plan.",
      imageDataUrl: `data:${contentType};base64,${match[2].replace(/\s/g, "")}`,
      timeoutMs: 20000,
    });
    const vision = raw ? parseVisionMarks(raw, kind) : null;
    return Response.json({
      url,
      contentType,
      manual: !vision,
      vision,
      note: vision
        ? "The photo draft is a suggestion. Accept each door or spot before it can be saved."
        : "The photo is on the map as a reference. No door marks came back, so place them yourself.",
    });
  } catch (error) {
    return apiError(error);
  }
}
