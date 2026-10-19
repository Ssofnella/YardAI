import { stratMapForTile, txgioExportUrl } from "@/lib/imagery/txgio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ z: string; x: string; y: string }> };

const tileCache = new Map<string, { bytes: Buffer; type: string; at: number }>();

function tileResponse(bytes: Buffer, type: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600",
      "X-Yard-Imagery": "txgio-stratmap",
    },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const { z, x, y } = await params;
  const tile = parseTile(z, x, y);
  if (!tile) return new Response(null, { status: 400 });
  const hit = stratMapForTile(tile.z, tile.x, tile.y);
  if (!hit) return new Response(null, { status: 404 });
  try {
    const upstream = txgioExportUrl(hit.service.id, hit.bbox);
    const cached = tileCache.get(upstream);
    if (cached && Date.now() - cached.at < 60 * 60 * 1000) {
      return tileResponse(cached.bytes, cached.type);
    }
    const response = await fetch(upstream, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) return new Response(null, { status: 502 });
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return new Response(null, { status: 502 });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 2_000_000) return new Response(null, { status: 502 });
    const contentType = type.startsWith("image/jpeg") ? "image/jpeg" : "image/png";
    tileCache.set(upstream, { bytes, type: contentType, at: Date.now() });
    if (tileCache.size > 200) {
      const oldest = tileCache.keys().next().value;
      if (oldest) tileCache.delete(oldest);
    }
    return tileResponse(bytes, contentType);
  } catch {
    return new Response(null, { status: 502 });
  }
}

function parseTile(z: string, x: string, y: string): { z: number; x: number; y: number } | null {
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,8}$/.test(x) || !/^\d{1,8}$/.test(y)) return null;
  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(y);
  if (zi < 12 || zi > 20) return null;
  const limit = 2 ** zi;
  if (xi >= limit || yi >= limit) return null;
  return { z: zi, x: xi, y: yi };
}
