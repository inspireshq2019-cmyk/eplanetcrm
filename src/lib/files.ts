import "server-only";

// The file types the CRM accepts for student documents, checked by their first bytes,
// so a renamed file can't pass as a PDF or image.
export const ALLOWED_DOC_MIME: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function sniffDoc(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return "application/msword";
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

/** A file name that is safe to store and show. */
export const safeFilename = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(0, 150) || "document";
