-- Data imports (e.g. a CSV export from Agentcis). Raw rows are kept only until the import runs, then cleared.
create table import_batches (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references users(id),
  branch_id   integer not null references branches(id),
  filename    text not null,
  headers     text[] not null,
  rows        jsonb,                       -- array of string arrays; set to null once imported
  row_count   integer not null,
  mapping     jsonb,
  status      text not null default 'pending' check (status in ('pending','done','cancelled')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
