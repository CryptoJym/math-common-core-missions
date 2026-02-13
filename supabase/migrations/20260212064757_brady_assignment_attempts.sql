-- Stores auto-graded test attempts for Brady assignments.
-- Mirrors Supabase migration: brady_assignment_attempts_table

create table if not exists public.brady_assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id text not null,
  seed int not null,
  attempted_at timestamptz not null default now(),
  score_percent int not null check (score_percent >= 0 and score_percent <= 100),
  total_questions int not null check (total_questions > 0),
  correct_questions int not null check (correct_questions >= 0 and correct_questions <= total_questions),
  answers jsonb not null,
  results jsonb not null
);

create index if not exists brady_assignment_attempts_user_assignment_time_idx
  on public.brady_assignment_attempts (user_id, assignment_id, attempted_at desc);

alter table public.brady_assignment_attempts enable row level security;

drop policy if exists brady_assignment_attempts_owner_only on public.brady_assignment_attempts;
create policy brady_assignment_attempts_owner_only
  on public.brady_assignment_attempts
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

