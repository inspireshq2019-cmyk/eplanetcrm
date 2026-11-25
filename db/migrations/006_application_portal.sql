-- Application portal: branches and sub-agents send applications to the central admission team,
-- which submits them to institutions directly, through master agents, or through admission portals.

-- Sub-agents: outside agencies with their own logins, each looked after by a home branch.
alter table sub_agents add column home_branch_id integer references branches(id);
alter table sub_agents add column created_at timestamptz not null default now();
alter table users add column sub_agent_id integer references sub_agents(id);
alter table contacts add column sub_agent_id integer references sub_agents(id);
create index contacts_sub_agent_idx on contacts(sub_agent_id) where sub_agent_id is not null;

-- A sub-agent sees only their own agency's students ("agent" scope).
alter table roles drop constraint roles_scope_check;
alter table roles add constraint roles_scope_check check (scope in ('all','country','branch','own','agent'));

-- Admission portals (e.g. an online application platform) as a kind of partner; master agents stay "aggregator".
alter table partners drop constraint partners_kind_check;
alter table partners add constraint partners_kind_check check (kind in ('university','college','school','english','insurer','aggregator','portal','other'));

-- Where an application is with the central admission team.
alter table applications add column adm_status text check (adm_status in ('submitted','in_review','needs_info','lodged','offer','refused','withdrawn'));
alter table applications add column adm_officer_id uuid references users(id);
alter table applications add column adm_sent_at timestamptz;
alter table applications add column adm_sent_by uuid references users(id);
alter table applications add column adm_updated_at timestamptz;
alter table applications add column adm_request text;      -- what the admission team needs from the branch, while needs_info
create index applications_adm_idx on applications(adm_status, adm_updated_at) where adm_status is not null;

-- Conversation on an application between the branch or sub-agent and the admission team.
-- internal = admission team notes the branch and sub-agent never see.
create table application_messages (
  id              bigserial primary key,
  application_id  uuid not null references applications(id) on delete cascade,
  author_id       uuid references users(id),
  body            text not null,
  internal        boolean not null default false,
  kind            text not null default 'message' check (kind in ('message','status','email')),
  created_at      timestamptz not null default now()
);
create index application_messages_app_idx on application_messages(application_id, created_at);

create table application_reads (
  user_id         uuid not null references users(id) on delete cascade,
  application_id  uuid not null references applications(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, application_id)
);

-- How Eplanet sends applications to each institution: directly, through a master agent, or through a portal.
create table partner_routes (
  id              serial primary key,
  partner_id      integer not null references partners(id) on delete cascade,   -- the institution
  route_kind      text not null check (route_kind in ('direct','master_agent','portal')),
  via_partner_id  integer references partners(id),                              -- the master agent or portal
  method          text not null default 'portal' check (method in ('portal','email')),
  portal_url      text,
  email           text,
  notes           text,
  preferred       boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index partner_routes_partner_idx on partner_routes(partner_id) where active;

-- Each time the admission team submits an application to an institution, and what came back.
create table application_submissions (
  id              serial primary key,
  application_id  uuid not null references applications(id) on delete cascade,
  route_id        integer references partner_routes(id),
  route_kind      text not null check (route_kind in ('direct','master_agent','portal')),
  via_partner_id  integer references partners(id),
  method          text not null check (method in ('portal','email')),
  external_ref    text,
  submitted_on    date not null default current_date,
  submitted_by    uuid references users(id),
  outcome         text not null default 'pending' check (outcome in ('pending','conditional','unconditional','refused','withdrawn')),
  outcome_on      date,
  notes           text,
  created_at      timestamptz not null default now()
);
create index application_submissions_app_idx on application_submissions(application_id);

-- Settings that hold secrets (e.g. the admissions mailbox connection), stored encrypted, on the existing settings table.
alter table app_settings alter column value set default '{}';
alter table app_settings add column secret_enc text;
alter table app_settings add column updated_by uuid references users(id);
alter table app_settings add column updated_at timestamptz not null default now();

-- One-time sign-in codes for sub-agents, who don't have eplanetintl.com Google accounts.
create table login_codes (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index login_codes_user_idx on login_codes(user_id, created_at desc);

-- Permissions for existing system roles (new installs get them from the seed).
update roles set permissions = array_append(permissions, 'admissions.manage')
 where is_system and key in ('owner','country_director') and not ('admissions.manage' = any(permissions));
update roles set permissions = array_append(permissions, 'subagents.manage')
 where is_system and key in ('owner','country_director','branch_head') and not ('subagents.manage' = any(permissions));
