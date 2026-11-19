-- Registration forms for fairs, seminars and other events. Students open them by QR code;
-- each registration becomes a lead in the form's branch.

create table lead_forms (
  id            serial primary key,
  branch_id     integer not null references branches(id),
  slug          text not null unique,                -- the public address: /f/<slug>
  title         text not null,                       -- e.g. "Australia Education Fair 2026"
  intro         text,
  event_date    date,
  event_time    text,                                -- shown as written, e.g. "10am – 5pm"
  venue         text,
  fields        jsonb not null default '{}',         -- standard questions: { email: "required" | "optional" | "off", ... }
  questions     jsonb not null default '[]',         -- extra questions: [{ label, type: "text" | "choice", options: [], required }]
  owner_id      uuid references users(id),           -- counsellor who gets the registrations; null = the branch's rule
  follow_up     boolean not null default true,       -- give a call task for each registration
  thank_you     text,
  active        boolean not null default true,
  closes_on     date,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index lead_forms_branch_idx on lead_forms(branch_id, created_at desc);

create table form_submissions (
  id          bigserial primary key,
  form_id     integer not null references lead_forms(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  status      text not null check (status in ('created','existing')),
  ip_hash     text,                                  -- hashed, used only to slow down repeated submissions
  created_at  timestamptz not null default now()
);
create index form_submissions_form_idx on form_submissions(form_id, created_at desc);
create index form_submissions_ip_idx on form_submissions(ip_hash, created_at);

update roles set permissions = array_append(permissions, 'forms.manage')
 where is_system and key in ('owner','country_director','branch_head','operations_manager','marketing') and not ('forms.manage' = any(permissions));
