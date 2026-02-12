-- Stores auto-graded PRACTICE attempts (not tests).
--
-- Plain language:
-- - Practice is "real work" with real problems and auto-checking.
-- - We store the score so the system can prove the student completed the work.
-- - We also store the answers/results so the exact practice set can be reviewed later.
--
-- Kinds:
-- - assignment_retake: required practice after failing a test (unlocks retake)
-- - daily_*: daily training sections (warmup / target / mixed / ai)

create table if not exists public.brady_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What this practice attempt was for.
  practice_kind text not null check (practice_kind in (
    'assignment_retake',
    'daily_warmup',
    'daily_target',
    'daily_mixed',
    'daily_ai'
  )),

  -- For daily practice sections.
  day date null,

  -- Usually an assignment id; for daily_ai we use 'daily_ai'.
  assignment_id text not null,

  -- For assignment_retake practice, this ties practice to a specific failed test attempt.
  based_on_attempted_at timestamptz null,

  seed int not null,
  practiced_at timestamptz not null default now(),
  score_percent int not null check (score_percent >= 0 and score_percent <= 100),
  total_questions int not null check (total_questions > 0),
  correct_questions int not null check (correct_questions >= 0 and correct_questions <= total_questions),
  answers jsonb not null,
  results jsonb not null
);

create index if not exists brady_practice_attempts_user_kind_time_idx
  on public.brady_practice_attempts (user_id, practice_kind, practiced_at desc);

create index if not exists brady_practice_attempts_user_assignment_based_idx
  on public.brady_practice_attempts (user_id, assignment_id, based_on_attempted_at, practiced_at desc);

create index if not exists brady_practice_attempts_user_day_kind_idx
  on public.brady_practice_attempts (user_id, day, practice_kind, practiced_at desc);

alter table public.brady_practice_attempts enable row level security;

drop policy if exists brady_practice_attempts_owner_only on public.brady_practice_attempts;
create policy brady_practice_attempts_owner_only
  on public.brady_practice_attempts
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

