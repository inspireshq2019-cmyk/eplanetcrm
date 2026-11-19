-- Ad lead sources: each branch connects its own Facebook/Instagram pages and Google Ads lead forms,
-- and leads from them arrive in that branch automatically.

create table lead_sources (
  id             serial primary key,
  branch_id      integer not null references branches(id),
  kind           text not null check (kind in ('facebook','google')),
  name           text not null,                    -- Facebook page name, or a label for the Google connection
  external_id    text,                             -- Facebook page id
  secret_enc     text,                             -- encrypted: Facebook page access token, or the Google key
  url_token_hash text unique,                      -- Google: sha256 of the secret part of the webhook address
  active         boolean not null default true,
  connected_by   uuid references users(id),
  connected_at   timestamptz not null default now(),
  last_lead_at   timestamptz,
  last_test_at   timestamptz,
  last_error     text,
  last_error_at  timestamptz
);
-- A Facebook page can be connected to one branch at a time.
create unique index lead_sources_fb_page_idx on lead_sources(external_id) where kind = 'facebook' and active;
create index lead_sources_branch_idx on lead_sources(branch_id);

-- One row per lead delivered by Facebook or Google, so a lead delivered twice is only added once.
create table lead_events (
  id                bigserial primary key,
  source_id         integer not null references lead_sources(id),
  branch_id         integer not null references branches(id),
  kind              text not null,
  external_lead_id  text not null,
  status            text not null check (status in ('processing','created','existing','test','error')),
  contact_id        uuid references contacts(id) on delete set null,
  error             text,
  received_at       timestamptz not null default now(),
  unique (kind, external_lead_id)
);
create index lead_events_branch_idx on lead_events(branch_id, received_at desc);

-- Facebook sign-in returns a list of pages; it is held here (encrypted, 15 minutes) while the person picks pages.
create table meta_connect_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  branch_id   integer not null references branches(id),
  pages_enc   text not null,
  expires_at  timestamptz not null default now() + interval '15 minutes'
);

-- Who gets new ad leads in each branch: shared among counsellors in turn, or left for the branch head.
alter table branches add column lead_assign text not null default 'unassigned' check (lead_assign in ('rotate','unassigned'));

-- New permission for connecting lead sources (existing system roles; new installs get it from the seed).
update roles set permissions = array_append(permissions, 'leads.connect')
 where is_system and key in ('owner','country_director','branch_head','operations_manager','marketing') and not ('leads.connect' = any(permissions));
