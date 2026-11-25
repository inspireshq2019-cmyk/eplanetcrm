"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFromLink } from "./actions";

const LIMIT = 4 * 1024 * 1024;

/** Phone photos are often 3–8 MB; shrink them to a sharp, readable JPEG before sending. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(file.type) || (file.size < 1.5 * 1024 * 1024 && file.type !== "image/heic")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

const STATUS: Record<string, [string, string]> = {
  needed: ["Needed", "badge-warn"], received: ["Uploaded · being checked", ""], checked: ["Checked", "badge-ok"],
};

export function UploadItem({ token, docType, label, status, n }: { token: string; docType: string; label: string; status: string; n: number }) {
  const [msgs, setMsgs] = useState<{ ok?: string; error?: string }[]>([]);
  const [busy, setBusy] = useState("");
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const id = `file-${n}`;

  async function send(files: FileList | null) {
    if (!files?.length) return;
    const out: { ok?: string; error?: string }[] = [];
    for (const [i, raw] of Array.from(files).entries()) {
      setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
      const file = await shrink(raw);
      if (file.size > LIMIT) { out.push({ error: `${raw.name} is larger than 4 MB. Take a photo instead, or make the PDF smaller.` }); continue; }
      const fd = new FormData(); fd.set("token", token); fd.set("doc_type", docType); fd.set("file", file);
      try { out.push(await uploadFromLink(fd)); } catch { out.push({ error: `${raw.name} didn't upload. Check your internet connection and try again.` }); }
    }
    setBusy(""); setMsgs(out);
    if (input.current) input.current.value = "";
    start(() => router.refresh());
  }

  const [statusLabel, badge] = STATUS[status] ?? STATUS.needed;
  return (
    <li className="grid gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold" id={`${id}-label`}>{label}</span>
        {docType !== "other" && <span className={`badge shrink-0 ${badge}`}>{statusLabel}</span>}
      </div>
      <label htmlFor={id} className={`btn ${status === "needed" ? "btn-navy" : ""} h-11 w-full cursor-pointer justify-center ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy || (status === "needed" ? "Choose photo or file" : "Upload another")}
      </label>
      <input ref={input} id={id} type="file" multiple className="sr-only" aria-labelledby={`${id}-label`}
        accept="image/*,.pdf,.doc,.docx,application/pdf" disabled={!!busy} onChange={(e) => send(e.currentTarget.files)} />
      {msgs.map((m, i) => <p key={i} role={m.error ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${m.error ? "bg-red-tint text-red-dark" : "bg-ok-tint text-ok"}`}>{m.error ?? m.ok}</p>)}
    </li>
  );
}
