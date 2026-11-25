-- Private upload links: a counsellor sends a student a link, and the student uploads documents to their own profile
-- from a phone, without an account. Uploads arrive "to check" for the counsellor and, when the application is with
-- the central admission team, for that team too.

create table upload_links (
  id              serial primary key,
  contact_id      uuid not null references contacts(id) on delete cascade,
  application_id  uuid references applications(id) on delete cascade,  -- documents go on this application's checklist
  token_hash      text not null unique,                                -- sha256 of the token in the link; the link itself is never stored in plain text
  token_enc       text not null,                                       -- the token, encrypted, so staff can copy the link again
  doc_types       text[] not null default '{}',                        -- what the student is asked for (when there's no application)
  note            text,                                                -- shown to the student
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  revoked_by      uuid references users(id),
  last_used_at    timestamptz,
  uploads         integer not null default 0,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index upload_links_contact_idx on upload_links(contact_id, created_at desc);

alter table documents add column via_link_id integer references upload_links(id) on delete set null;
