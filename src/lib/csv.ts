/** Small RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, optional BOM. Detects ; or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const first = s.slice(0, s.indexOf("\n") === -1 ? s.length : s.indexOf("\n"));
  const counts = { ",": first.split(",").length, ";": first.split(";").length, "\t": first.split("\t").length };
  const d = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as string;
  const out: string[][] = [];
  let row: string[] = [], field = "", i = 0, quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === d) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}
