import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Encrypts connection secrets (Facebook page tokens, Google lead form keys) before they are stored.
// TOKEN_ENCRYPTION_KEY should be its own long random value on the live system; changing it means
// reconnecting every Facebook page and Google form.
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("TOKEN_ENCRYPTION_KEY (or SESSION_SECRET) must be at least 32 characters");
  return createHash("sha256").update("eplanet-lead-sources:" + raw).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function open(sealed: string): string {
  if (!sealed.startsWith("v1:")) throw new Error("Unknown secret format");
  const buf = Buffer.from(sealed.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function sameSecret(a: string, b: string) {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

export const newSecret = (bytes = 24) => randomBytes(bytes).toString("base64url");
