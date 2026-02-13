-- Stores in-progress DAILY work so refresh/page changes don't lose answers.
--
-- Plain language:
-- - A "draft" is unfinished work (answers typed but not submitted yet).
-- - This lets the page autosave while the student types.
-- - When they submit & grade, we can clear the draft.

create table if not exists public.brady_practice_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  practice_kind text not null check (practice_kind in (
    'daily_warmup',
    'daily_target',
    'daily_mixed',
    'daily_ai'
  )),

  day date not null,
  assignment_id text not null,
  seed int not null,

  -- Map of { q1: "...", q2: "...", ... }
  answers jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

create unique index if not exists brady_practice_drafts_user_day_kind_assignment_unique
  on public.brady_practice_drafts (user_id, day, practice_kind, assignment_id);

create index if not exists brady_practice_drafts_user_day_updated_idx
  on public.brady_practice_drafts (user_id, day, updated_at desc);

alter table public.brady_practice_drafts enable row level security;

drop policy if exists brady_practice_drafts_owner_only on public.brady_practice_drafts;
create policy brady_practice_drafts_owner_only
  on public.brady_practice_drafts
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
