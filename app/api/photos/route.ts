import { getDatabase } from "@/lib/db/client";
import { apiError } from "@/lib/http";
import { requireSite } from "@/lib/yard/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { dataUrl?: string };
    const match = DATA_URL.exec(body.dataUrl ?? "");
    if (!match) {
      return Response.json({ error: "Upload a JPEG, PNG, or WebP photo" }, { status: 400 });
    }
    const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (bytes.length < 32) {
      return Response.json({ error: "That photo looks empty" }, { status: 400 });
    }
    if (bytes.length > 1_500_000) {
      return Response.json({ error: "Photo must be under 1.5 MB" }, { status: 400 });
    }
    const db = await getDatabase();
    const site = await requireSite(db);
    const id = crypto.randomUUID();
    await db.query(
      `insert into photos (id, site_id, company_id, content_type, bytes) values ($1, $2, $3, $4, $5)`,
      [id, site.id, site.companyId, match[1], bytes],
    );
    return Response.json({ id, url: `/api/photos/${id}` });
  } catch (error) {
    return apiError(error);
  }
}
