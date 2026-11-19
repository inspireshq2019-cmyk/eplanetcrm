// Creates the schema and loads reference data. Safe to run more than once.
// Usage: DATABASE_URL=postgres://... npx tsx db/setup.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { BRANCHES, COUNTRIES, DHAKA_STAFF, INSURERS, ROLES, WORKFLOWS } from "./seed-data";

const DIR = __dirname;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const COUNTRY_BY_NAME: Record<string, string> = {
  Australia: "AU", Canada: "CA", France: "FR", Germany: "DE", Ireland: "IE", Malta: "MT", Netherlands: "NL",
  "New Zealand": "NZ", Spain: "ES", USA: "US", "United Kingdom": "GB", Sweden: "SE",
};
const DEST_TO_COUNTRY: Record<string, string> = { AU: "AU", UK: "GB", CA: "CA", US: "US", NZ: "NZ" };

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");

  // 1. Migrations
  for (const f of readdirSync(join(DIR, "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    const done = await db.query("select 1 from schema_migrations where version=$1", [f]);
    if (done.rowCount) continue;
    await db.query("begin");
    try {
      const sql = readFileSync(join(DIR, "migrations", f), "utf8").replace(/create table schema_migrations[\s\S]*?\);/, "");
      await db.query(sql);
      await db.query("insert into schema_migrations(version) values ($1)", [f]);
      await db.query("commit");
      console.log("applied", f);
    } catch (e) { await db.query("rollback"); throw e; }
  }

  // 2. Countries, branches, roles
  for (const [code, name, cur] of COUNTRIES)
    await db.query("insert into countries(code,name,currency) values($1,$2,$3) on conflict (code) do update set name=excluded.name, currency=excluded.currency", [code, name, cur]);
  for (const b of BRANCHES)
    await db.query(
      `insert into branches(code,name,country_code,city,address,phone,email,timezone,currency,is_head_office,receipt_prefix)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (code) do update set name=excluded.name, address=excluded.address, phone=excluded.phone, email=excluded.email, timezone=excluded.timezone`,
      [b.code, b.name, b.country, b.city, b.address, b.phone, b.email, b.timezone, b.currency, !!b.head, `${b.code}-R`]);
  for (const r of ROLES)
    await db.query(
      `insert into roles(key,name,description,scope,permissions,is_system) values($1,$2,$3,$4,$5,true)
       on conflict (key) do nothing`, [r.key, r.name, r.description, r.scope, r.permissions]);

  // 3. Pilot staff (Dhaka). Placeholder addresses end in .invalid so nobody can sign in until a real email is set.
  const dhk = (await db.query("select id from branches where code='DHK'")).rows[0].id;
  for (const s of DHAKA_STAFF) {
    const slug = s.name.toLowerCase().replace(/^md\.\s*/, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    await db.query(
      `insert into users(email,name,title,role_key,primary_branch_id) values($1,$2,$3,$4,$5) on conflict (email) do nothing`,
      [`${slug}@pending.eplanetintl.invalid`, s.name, s.title, s.role, dhk]);
  }

  // Staff photos already published on the website team page.
  const PHOTOS: Record<string, string> = {
    "Shah Zaman Bhuiyan": "team-shah-zaman-bhuiyan", "Abdullah Al Masum": "team-abdullah-al-masum", "Md. Saiful Adnan": "team-saiful-adnan",
    "Sonia Akter": "team-sonia-akter", "Kaniz Sanjana": "team-kaniz-sanjana", "Farjana Lima": "team-farjana-lima",
    "Md. Junaidul Islam": "team-junaidul-islam", "Happy Akter": "team-happy-akter", "Shahnoor Alam Bhuiyan": "team-shahnoor-alam-bhuiyan",
  };
  for (const [n, f] of Object.entries(PHOTOS)) await db.query("update users set photo_url=$1 where name=$2 and photo_url is null", [`/staff/${f}.jpg`, n]);

  // 4. Workflows, stages, checklists
  for (const w of WORKFLOWS) {
    const ex = await db.query("select id from workflows where name=$1", [w.name]);
    if (ex.rowCount) continue;
    const wid = (await db.query("insert into workflows(name,service,destination) values($1,'admission',$2) returning id", [w.name, w.destination])).rows[0].id;
    let pos = 0;
    for (const raw of w.stages) {
      pos++;
      const won = raw.endsWith("*"), lost = raw.endsWith("✗");
      const name = raw.replace(/[*✗]$/, "").trim();
      await db.query("insert into workflow_stages(workflow_id,position,name,outcome,commission_trigger) values($1,$2,$3,$4,$5)",
        [wid, pos, name, won ? "won" : lost ? "lost" : null, won]);
    }
    let cpos = 0;
    for (const [name, type] of w.checklist)
      await db.query("insert into checklist_items(workflow_id,name,doc_type,position) values($1,$2,$3,$4)", [wid, name, type, ++cpos]);
  }

  // 5. Partners (Eplanet partner list) and OSHC insurers
  const inst = parseCsv(readFileSync(join(DIR, "data/institutions.csv"), "utf8")).slice(1);
  let np = 0;
  for (const [name, dest, country] of inst) {
    const cc = COUNTRY_BY_NAME[country?.trim()] ?? DEST_TO_COUNTRY[dest?.trim()] ?? null;
    const kind = /college|institute|tafe|school|academy/i.test(name) && !/university/i.test(name) ? "college" : "university";
    const r = await db.query("insert into partners(name,kind,country_code,is_partner) values($1,$2,$3,true) on conflict (name,country_code) do nothing", [name.trim(), kind, cc]);
    np += r.rowCount ?? 0;
  }
  for (const n of INSURERS)
    await db.query("insert into partners(name,kind,country_code,is_partner) values($1,'insurer','AU',false) on conflict (name,country_code) do nothing", [n]);

  // 6. Checked courses from the website's course list
  const crows = parseCsv(readFileSync(join(DIR, "data/courses.csv"), "utf8"));
  const head = crows[0];
  const col = (r: string[], k: string) => r[head.indexOf(k)] ?? "";
  let nc = 0;
  for (const r of crows.slice(1)) {
    const uni = col(r, "university").trim();
    const cc = DEST_TO_COUNTRY[col(r, "country")] ?? col(r, "country");
    let p = await db.query("select id from partners where name=$1 and country_code=$2", [uni, cc]);
    if (!p.rowCount) p = await db.query("insert into partners(name,kind,country_code,is_partner) values($1,'university',$2,false) returning id", [uni, cc]);
    const fee = col(r, "tuition_per_year");
    const res = await db.query(
      `insert into courses(partner_id,title,level,field,intakes,tuition_per_year,currency,fee_year,ielts,url,notes,checked_on)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (partner_id,title) do nothing`,
      [p.rows[0].id, col(r, "title"), col(r, "level"), col(r, "field"),
       col(r, "intakes") ? col(r, "intakes").split(/[;,/]\s*/) : [],
       fee ? Number(fee) : null, col(r, "currency") || null, col(r, "fee_year") || null,
       col(r, "ielts") || null, col(r, "course_url") || null, col(r, "notes") || null, col(r, "checked") || null]);
    nc += res.rowCount ?? 0;
  }

  const counts = await db.query(`select (select count(*) from branches) b, (select count(*) from roles) r, (select count(*) from users) u,
    (select count(*) from workflows) w, (select count(*) from partners) p, (select count(*) from courses) c`);
  console.log("ready:", counts.rows[0], `(+${np} partners, +${nc} courses this run)`);
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
