import { createHash, randomBytes } from "node:crypto";

export function hashFeedKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newFeedKey(): { key: string; hint: string; hash: string } {
  const key = `yl_${randomBytes(18).toString("hex")}`;
  return { key, hint: key.slice(-4), hash: hashFeedKey(key) };
}
