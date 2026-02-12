-- Upload artifacts (PDFs, photos, code files) tied to daily/assignments.
--
-- Plain language:
-- - This is the "file cabinet" for Brady's work.
-- - Because Storage policy changes require elevated privileges, we store
--   small files directly in the database as base64 for now.
-- - This is OK for a single student workflow and avoids "it didn't save".

create table if not exists public.brady_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  day date not null,
  practice_kind text not null check (practice_kind in (
    'daily_warmup',
    'daily_target',
    'daily_mixed',
    'daily_ai',
    'reading',
    'assignment'
  )),

  assignment_id text not null,

  filename text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes >= 0 and size_bytes <= 8000000),

  -- Base64 payload only (no data: prefix) so we can reconstruct a Blob in the browser.
  content_base64 text not null,

  created_at timestamptz not null default now()
);

create index if not exists brady_artifacts_user_day_kind_idx
  on public.brady_artifacts (user_id, day, practice_kind, created_at desc);

alter table public.brady_artifacts enable row level security;

drop policy if exists brady_artifacts_owner_only on public.brady_artifacts;
create policy brady_artifacts_owner_only
  on public.brady_artifacts
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) in ('bradyhyro67@gmail.com', 'james@jamesbrady.org')
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) in ('bradyhyro67@gmail.com', 'james@jamesbrady.org')
    )
  );
