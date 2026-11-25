import "server-only";
import { q, q1 } from "./db";
import { open, seal } from "./secret-box";

// The shared admissions mailbox (e.g. admissions@eplanetintl.com), connected once by an owner.
// The CRM can only SEND from it (Gmail "send" permission); it never reads the inbox.
// Used for application packs to institutions and sign-in codes for sub-agents.

export const GOOGLE_AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const USERINFO_URL = () => process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL = () => (process.env.GMAIL_API_BASE || "https://gmail.googleapis.com").replace(/\/$/, "");
export const MAILBOX_SCOPES = "openid email https://www.googleapis.com/auth/gmail.send";
const KEY = "admissions_mailbox";

export type Mailbox = { email: string; connected_at: string; connected_by: string | null };

export async function getMailbox(): Promise<Mailbox | null> {
  const r = await q1<{ value: Mailbox; secret_enc: string | null }>("select value, secret_enc from app_settings where key=$1", [KEY]);
  return r?.secret_enc && r.value?.email ? r.value : null;
}

/** Finishes connecting: exchanges Google's code, checks which mailbox it is, and stores the send permission (encrypted). */
export async function connectMailbox(code: string, redirectUri: string, userId: string, userName: string) {
  const t = await fetch(TOKEN_URL(), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15000),
  });
  const tok = (await t.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string };
  if (!t.ok || !tok.access_token) throw new Error("Google didn't complete the connection.");
  if (!tok.refresh_token) throw new Error("Google didn't give lasting access. Remove Eplanet CRM from the mailbox's Google account permissions and connect again.");
  if (tok.scope && !tok.scope.includes("gmail.send")) throw new Error("The permission to send email wasn't granted. Connect again and allow sending.");
  const info = await fetch(USERINFO_URL(), { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) });
  const me = (await info.json().catch(() => ({}))) as { email?: string; email_verified?: boolean };
  const email = (me.email ?? "").toLowerCase();
  if (!email || me.email_verified === false) throw new Error("Couldn't confirm which mailbox was connected.");
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length && !domains.includes(email.split("@")[1] ?? "")) throw new Error(`Connect a mailbox on ${domains.join(" or ")}, not ${email}.`);
  const expected = (process.env.ADMISSIONS_MAILBOX ?? "").trim().toLowerCase();
  if (expected && email !== expected) throw new Error(`Sign in as ${expected} to connect it (you signed in as ${email}).`);
  await q(
    `insert into app_settings(key,value,secret_enc,updated_by,updated_at) values($1,$2,$3,$4,now())
     on conflict (key) do update set value=excluded.value, secret_enc=excluded.secret_enc, updated_by=excluded.updated_by, updated_at=now()`,
    [KEY, JSON.stringify({ email, connected_at: new Date().toISOString(), connected_by: userName }), seal(tok.refresh_token), userId]);
  accessCache = null;
  return email;
}

export async function disconnectMailbox() {
  await q("delete from app_settings where key=$1", [KEY]);
  accessCache = null;
}

let accessCache: { token: string; until: number } | null = null;
async function accessToken() {
  if (accessCache && accessCache.until > Date.now() + 60_000) return accessCache.token;
  const r = await q1<{ secret_enc: string | null }>("select secret_enc from app_settings where key=$1", [KEY]);
  if (!r?.secret_enc) throw new Error("The admissions mailbox isn't connected. An owner can connect it in Settings › Admissions mailbox.");
  const t = await fetch(TOKEN_URL(), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: open(r.secret_enc), grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await t.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!t.ok || !j.access_token) throw new Error(j.error === "invalid_grant" ? "The admissions mailbox connection has expired. An owner needs to connect it again." : "Couldn't reach Google to send the email.");
  accessCache = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return j.access_token;
}

// --- Building the email --------------------------------------------------------------------------
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (m) => m + "\r\n");
export const validAddress = (a: string) => /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\]]+$/.test(a);

export type Attachment = { filename: string; mime: string; data: Buffer };

export function buildMime(o: { from: string; to: string[]; cc?: string[]; replyTo?: string; subject: string; text: string; attachments?: Attachment[] }) {
  for (const a of [...o.to, ...(o.cc ?? []), o.from, ...(o.replyTo ? [o.replyTo] : [])]) if (!validAddress(a)) throw new Error(`Check the email address “${a}”.`);
  const boundary = `eplanet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const head = [
    `From: Eplanet Admissions <${o.from}>`,
    `To: ${o.to.join(", ")}`,
    ...(o.cc?.length ? [`Cc: ${o.cc.join(", ")}`] : []),
    ...(o.replyTo ? [`Reply-To: ${o.replyTo}`] : []),
    `Subject: ${encWord(oneLine(o.subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n");
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(Buffer.from(o.text, "utf8").toString("base64"))}`,
    ...(o.attachments ?? []).map((a) => {
      const name = oneLine(a.filename).replace(/"/g, "'");
      return `--${boundary}\r\nContent-Type: ${a.mime}; name="${encWord(name)}"\r\nContent-Disposition: attachment; filename="${encWord(name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(a.data.toString("base64"))}`;
    }),
  ];
  return `${head}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--\r\n`;
}

/** Sends an email from the admissions mailbox. Returns Gmail's message id. */
export async function sendMail(o: { to: string[]; cc?: string[]; subject: string; text: string; attachments?: Attachment[] }) {
  const box = await getMailbox();
  if (!box) throw new Error("The admissions mailbox isn't connected. An owner can connect it in Settings › Admissions mailbox.");
  const raw = buildMime({ ...o, from: box.email });
  if (raw.length > 34 * 1024 * 1024) throw new Error("The email is too large for Gmail (about 25 MB of attachments at most). Leave some files out.");
  const token = await accessToken();
  const r = await fetch(`${GMAIL()}/gmail/v1/users/me/messages/send`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }), signal: AbortSignal.timeout(60000),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`Gmail didn't send it${j.error?.message ? `: ${j.error.message}` : "."}`);
  return { id: j.id, from: box.email };
}
