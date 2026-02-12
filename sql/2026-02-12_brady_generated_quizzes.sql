-- Stores AI-generated adaptive quizzes for Brady assignments.
--
-- Plain language:
-- - When a student fails (< 80%), after the cooldown the system can create a new
--   quiz version that focuses on what they missed.
-- - This table stores that generated quiz so we can reuse it (avoid re-calling
--   an LLM every page refresh) and so review mode can re-render the exact
--   questions that were shown.

create table if not exists public.brady_generated_quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id text not null,
  -- The failed attempt that this quiz was generated from (optional).
  based_on_attempted_at timestamptz null,
  focus_tags jsonb not null default '{}'::jsonb,
  quiz jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists brady_generated_quizzes_user_assignment_time_idx
  on public.brady_generated_quizzes (user_id, assignment_id, created_at desc);

create index if not exists brady_generated_quizzes_user_assignment_based_idx
  on public.brady_generated_quizzes (user_id, assignment_id, based_on_attempted_at);

alter table public.brady_generated_quizzes enable row level security;

drop policy if exists brady_generated_quizzes_owner_only on public.brady_generated_quizzes;
create policy brady_generated_quizzes_owner_only
  on public.brady_generated_quizzes
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

