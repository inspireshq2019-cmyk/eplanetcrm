-- Eplanet CRM schema, version 1.
-- Runs on PostgreSQL 15+ (works on Supabase). All money is stored as numeric with its currency.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ───────────────────────── Organisation ─────────────────────────

create table countries (
  code        text primary key,               -- ISO 3166-1 alpha-2, e.g. BD, NP, AU
  name        text not null,
  currency    text not null                   -- default currency, e.g. BDT
);

create table branches (
  id              serial primary key,
  code            text not null unique,       -- short code used in references, e.g. DHK
  name            text not null,              -- e.g. Dhaka (Uttara)
  country_code    text not null references countries(code),
  city            text,
  address         text,
  phone           text,
  email           text,
  timezone        text not null default 'UTC',
  currency        text not null,
  is_head_office  boolean not null default false,
  receipt_prefix  text not null,              -- e.g. DHK-R
  receipt_seq     integer not null default 0, -- last receipt number issued
  invoice_seq     integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table roles (
  key          text primary key,              -- e.g. counsellor
  name         text not null,
  description  text,
  scope        text not null check (scope in ('all','country','branch','own')),
  permissions  text[] not null default '{}',
  is_system    boolean not null default false
);

create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  name               text not null,
  title              text,
  phone              text,
  role_key           text not null references roles(key),
  primary_branch_id  integer not null references branches(id),
  marn               text,                    -- OMARA registration number, for registered migration agents
  marn_expiry        date,
  qualification      text,                    -- counsellor credential register
  active             boolean not null default true,
  last_login_at      timestamptz,
  created_at         timestamptz not null default now()
);

create table user_branches (                  -- extra branches a user can work in
  user_id    uuid not null references users(id) on delete cascade,
  branch_id  integer not null references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

-- ───────────────────────── Catalogue ─────────────────────────

create table partners (
  id             serial primary key,
  name           text not null,
  kind           text not null default 'university'
                 check (kind in ('university','college','school','english','insurer','aggregator','other')),
  country_code   text references countries(code),
  city           text,
  website        text,
  email          text,
  phone          text,
  cricos         text,
  is_partner     boolean not null default true, -- on Eplanet's official partner list
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (name, country_code)
);

create table partner_agreements (
  id              serial primary key,
  partner_id      integer not null references partners(id) on delete cascade,
  via_partner_id  integer references partners(id), -- aggregator the agreement runs through, if any
  commission_pct  numeric(6,3),
  bonus           text,
  claim_basis     text,                           -- e.g. "first-year tuition, after census"
  currency        text,
  valid_from      date,
  valid_to        date,
  notes           text,
  created_at      timestamptz not null default now()
);

create table courses (
  id               serial primary key,
  partner_id       integer not null references partners(id) on delete cascade,
  title            text not null,
  level            text not null check (level in ('FOUNDATION','DIPLOMA','BACHELOR','MASTER','DOCTORATE','ENGLISH','OTHER')),
  field            text,
  campus           text,
  duration_years   numeric(4,2),
  intakes          text[] not null default '{}',
  tuition_per_year numeric(12,2),
  currency         text,
  fee_year         text,
  ielts            text,
  cricos           text,
  url              text,
  notes            text,
  checked_on       date,
  active           boolean not null default true,
  unique (partner_id, title)
);

-- ───────────────────────── People ─────────────────────────

create sequence contact_ref_seq start 1001;

create table contacts (
  id                     uuid primary key default gen_random_uuid(),
  ref                    text not null unique default ('C-' || nextval('contact_ref_seq')),
  stage                  text not null default 'lead' check (stage in ('lead','prospect','client','archived')),
  first_name             text not null,
  last_name              text,
  email                  text,
  phone                  text,                    -- E.164, e.g. +8801345203093
  whatsapp               text,
  dob                    date,
  gender                 text,
  nationality            text references countries(code),
  passport_no            text,
  passport_expiry        date,
  address                text,
  city                   text,
  source                 text,                    -- walk-in, website, facebook, whatsapp, event, referral, agentcis-import
  source_detail          text,
  interested_destinations text[] not null default '{}',
  interested_level       text,
  interested_field       text,
  intake                 text,
  budget_amount          numeric(14,2),
  budget_currency        text,
  onshore                boolean not null default false, -- currently in the destination country
  branch_id              integer not null references branches(id),
  owner_id               uuid references users(id),
  tags                   text[] not null default '{}',
  rating                 smallint check (rating between 1 and 5),
  lost_reason            text,
  guardian_name          text,
  guardian_phone         text,
  consent_at             timestamptz,             -- consent to store and use personal data
  consent_source         text,
  created_by             uuid references users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index contacts_branch_idx on contacts(branch_id, stage);
create index contacts_owner_idx on contacts(owner_id);
create index contacts_phone_idx on contacts(phone);
create index contacts_email_idx on contacts(lower(email));
create index contacts_search_idx on contacts using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || ref) gin_trgm_ops);

create table contact_education (
  id           serial primary key,
  contact_id   uuid not null references contacts(id) on delete cascade,
  level        text not null,                     -- SSC, HSC, A_LEVEL, DIPLOMA, BACHELOR, MASTER
  institution  text,
  country_code text,
  result       text,                              -- e.g. GPA 4.50/5
  year         integer
);

create table contact_tests (
  id          serial primary key,
  contact_id  uuid not null references contacts(id) on delete cascade,
  test        text not null,                      -- IELTS_ACADEMIC, IELTS_UKVI, PTE, TOEFL_IBT, DUOLINGO
  overall     numeric(5,1),
  listening   numeric(4,1),
  reading     numeric(4,1),
  writing     numeric(4,1),
  speaking    numeric(4,1),
  test_date   date,
  expiry      date
);

-- ───────────────────────── Work ─────────────────────────

create table workflows (
  id           serial primary key,
  name         text not null,
  service      text not null check (service in ('admission','visa','oshc','english','other')),
  destination  text,                              -- AU, UK, CA, US, NZ, EU or null for any
  active       boolean not null default true
);

create table workflow_stages (
  id                  serial primary key,
  workflow_id         integer not null references workflows(id) on delete cascade,
  position            integer not null,
  name                text not null,
  outcome             text check (outcome in ('won','lost')),  -- final stages only
  commission_trigger  boolean not null default false,          -- reaching this stage makes commission claimable
  unique (workflow_id, position)
);

create sequence application_ref_seq start 2001;

create table applications (
  id                     uuid primary key default gen_random_uuid(),
  ref                    text not null unique default ('A-' || nextval('application_ref_seq')),
  contact_id             uuid not null references contacts(id) on delete cascade,
  branch_id              integer not null references branches(id),
  owner_id               uuid references users(id),
  workflow_id            integer not null references workflows(id),
  stage_id               integer not null references workflow_stages(id),
  destination            text,
  partner_id             integer references partners(id),
  course_id              integer references courses(id),
  course_title           text,
  intake                 text,
  channel                text not null default 'direct' check (channel in ('direct','applyboard','crizac','infinite','studylink','other')),
  student_id_at_provider text,
  tuition_fee            numeric(12,2),
  fee_currency           text,
  onshore_transfer       boolean not null default false, -- Australia: provider commission not allowed after 31 Mar 2026
  accepted_date          date,                           -- date the provider accepted the student
  status                 text not null default 'open' check (status in ('open','won','lost')),
  lost_reason            text,
  created_by             uuid references users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index applications_branch_idx on applications(branch_id, status);
create index applications_contact_idx on applications(contact_id);
create index applications_stage_idx on applications(stage_id);

create table stage_history (
  id              bigserial primary key,
  application_id  uuid not null references applications(id) on delete cascade,
  from_stage_id   integer references workflow_stages(id),
  to_stage_id     integer not null references workflow_stages(id),
  changed_by      uuid references users(id),
  changed_at      timestamptz not null default now(),
  note            text
);

create sequence visa_ref_seq start 3001;

create table visa_cases (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique default ('V-' || nextval('visa_ref_seq')),
  contact_id       uuid not null references contacts(id) on delete cascade,
  application_id   uuid references applications(id) on delete set null,
  branch_id        integer not null references branches(id),
  agent_id         uuid references users(id),        -- registered migration agent handling the case
  destination      text not null,
  subclass         text,                             -- e.g. 500, 485, Student route, Study permit
  status           text not null default 'preparing'
                   check (status in ('preparing','lodged','further_info','granted','refused','withdrawn')),
  lodged_on        date,
  trn              text,                             -- transaction / application reference
  decision_on      date,
  visa_expiry      date,
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table oshc_policies (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  branch_id     integer not null references branches(id),
  insurer_id    integer references partners(id),
  policy_no     text,
  cover_type    text not null default 'single' check (cover_type in ('single','couple','family','single_parent')),
  start_date    date,
  end_date      date,
  premium       numeric(12,2),
  currency      text not null default 'AUD',
  commission    numeric(12,2),
  status        text not null default 'quoted' check (status in ('quoted','purchased','active','cancelled','expired')),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);

create table classes (
  id           serial primary key,
  branch_id    integer not null references branches(id),
  name         text not null,                     -- e.g. IELTS Evening Batch 12
  test         text not null default 'IELTS',
  start_date   date,
  end_date     date,
  schedule     text,                              -- e.g. Sun, Tue, Thu 18:00-20:00
  trainer_id   uuid references users(id),
  capacity     integer,
  fee          numeric(12,2),
  currency     text,
  status       text not null default 'planned' check (status in ('planned','running','completed','cancelled')),
  created_at   timestamptz not null default now()
);

create table class_enrolments (
  class_id     integer not null references classes(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  status       text not null default 'enrolled' check (status in ('enrolled','completed','dropped')),
  primary key (class_id, contact_id)
);

create table class_attendance (
  class_id      integer not null references classes(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  session_date  date not null,
  present       boolean not null,
  primary key (class_id, contact_id, session_date)
);

create table mock_scores (
  id          serial primary key,
  class_id    integer references classes(id) on delete set null,
  contact_id  uuid not null references contacts(id) on delete cascade,
  taken_on    date not null,
  listening   numeric(4,1),
  reading     numeric(4,1),
  writing     numeric(4,1),
  speaking    numeric(4,1),
  overall     numeric(4,1)
);

create table checkins (
  id            serial primary key,
  branch_id     integer not null references branches(id),
  contact_id    uuid references contacts(id) on delete set null,
  visitor_name  text not null,
  phone         text,
  purpose       text,
  status        text not null default 'waiting' check (status in ('waiting','attending','completed')),
  host_id       uuid references users(id),
  arrived_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  rating        smallint check (rating between 1 and 5)
);
create index checkins_branch_day_idx on checkins(branch_id, arrived_at);

create table tasks (
  id              serial primary key,
  title           text not null,
  description     text,
  due_at          timestamptz,
  priority        text not null default 'normal' check (priority in ('low','normal','high')),
  status          text not null default 'open' check (status in ('open','done')),
  assignee_id     uuid references users(id),
  branch_id       integer not null references branches(id),
  contact_id      uuid references contacts(id) on delete cascade,
  application_id  uuid references applications(id) on delete cascade,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index tasks_assignee_idx on tasks(assignee_id, status, due_at);

create table appointments (
  id          serial primary key,
  contact_id  uuid references contacts(id) on delete cascade,
  branch_id   integer not null references branches(id),
  user_id     uuid references users(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  mode        text not null default 'office' check (mode in ('office','video','phone')),
  status      text not null default 'booked' check (status in ('booked','done','no_show','cancelled')),
  notes       text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table activities (                       -- the timeline on a student's record; never edited
  id              bigserial primary key,
  contact_id      uuid references contacts(id) on delete cascade,
  application_id  uuid references applications(id) on delete cascade,
  kind            text not null,                  -- note, call, email, whatsapp, stage, checkin, payment, visa, system
  body            text,
  meta            jsonb not null default '{}',
  user_id         uuid references users(id),
  created_at      timestamptz not null default now()
);
create index activities_contact_idx on activities(contact_id, created_at desc);

-- ───────────────────────── Documents ─────────────────────────

create table documents (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references contacts(id) on delete cascade,
  application_id  uuid references applications(id) on delete set null,
  visa_case_id    uuid references visa_cases(id) on delete set null,
  doc_type        text not null,                  -- passport, transcript, ielts, sop, financials, offer, coe, visa_grant, other
  filename        text not null,
  storage_key     text not null,
  size_bytes      bigint,
  mime            text,
  expiry          date,
  uploaded_by     uuid references users(id),
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table checklist_items (
  id           serial primary key,
  workflow_id  integer not null references workflows(id) on delete cascade,
  name         text not null,
  doc_type     text,
  required     boolean not null default true,
  position     integer not null default 0
);

create table application_checklist (
  application_id  uuid not null references applications(id) on delete cascade,
  item_id         integer not null references checklist_items(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','received','verified','not_needed')),
  document_id     uuid references documents(id) on delete set null,
  updated_by      uuid references users(id),
  updated_at      timestamptz not null default now(),
  primary key (application_id, item_id)
);

-- ───────────────────────── Money ─────────────────────────

create table sub_agents (
  id                 serial primary key,
  name               text not null,
  contact_person     text,
  email              text,
  phone              text,
  country_code       text references countries(code),
  default_share_pct  numeric(6,3),
  active             boolean not null default true
);

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,           -- e.g. DHK-INV-0001
  branch_id       integer not null references branches(id),
  kind            text not null check (kind in ('client','commission_gross','commission_net','general')),
  contact_id      uuid references contacts(id) on delete set null,
  partner_id      integer references partners(id),
  application_id  uuid references applications(id) on delete set null,
  issue_date      date not null default current_date,
  due_date        date,
  currency        text not null,
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  paid            numeric(14,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft','sent','part_paid','paid','void')),
  notes           text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create table invoice_lines (
  id              serial primary key,
  invoice_id      uuid not null references invoices(id) on delete cascade,
  description     text not null,
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(14,2) not null default 0,
  commission_pct  numeric(6,3),                  -- for commission lines: % of tuition
  amount          numeric(14,2) not null default 0
);

-- Eplanet has a no-cash policy in every branch: cash is not an allowed payment method.
create table payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete restrict,
  branch_id    integer not null references branches(id),
  receipt_no   text not null unique,              -- sequential per branch, e.g. DHK-R-000123
  received_on  date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  currency     text not null,
  method       text not null check (method in ('bank_transfer','card','bkash','nagad','rocket','esewa','khalti','fonepay','upi','gcash','stripe','cheque','online_other')),
  reference    text not null,                     -- bank or wallet transaction reference
  received_by  uuid references users(id),
  created_at   timestamptz not null default now()
);

create table income_shares (                    -- commission shared with a sub-agent or another branch
  id            serial primary key,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  sub_agent_id  integer references sub_agents(id),
  branch_id     integer references branches(id),
  share_pct     numeric(6,3) not null,
  amount        numeric(14,2) not null,
  status        text not null default 'owed' check (status in ('owed','paid')),
  paid_on       date,
  check (sub_agent_id is not null or branch_id is not null)
);

-- ───────────────────────── Governance ─────────────────────────

create table audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid references users(id),
  action     text not null,                       -- create, update, delete, view_sensitive, login, export
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  ip         text
);
create index audit_entity_idx on audit_log(entity, entity_id);

create table app_settings (
  key    text primary key,
  value  jsonb not null
);

create table schema_migrations (
  version  text primary key,
  applied_at timestamptz not null default now()
);
