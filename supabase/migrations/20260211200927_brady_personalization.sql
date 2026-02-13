-- Brady-only personalization tables + RLS.
--
-- Plain language:
-- - "RLS" are database rules that decide who can read/write rows.
-- - These tables store Brady's *private* progress and journal data.
-- - Only the logged-in account with email bradyhyro67@gmail.com can access them.
-- - Everyone else is blocked even if they guess the table names or page URLs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Whitelist table: proves the logged-in user is allowed to use Brady pages
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_students (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.allowed_students enable row level security;

drop policy if exists allowed_students_read_own on public.allowed_students;
create policy allowed_students_read_own
  on public.allowed_students
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists allowed_students_insert_brady_only on public.allowed_students;
create policy allowed_students_insert_brady_only
  on public.allowed_students
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and lower(email) = 'bradyhyro67@gmail.com'
    and lower((auth.jwt() ->> 'email')) = 'bradyhyro67@gmail.com'
  );

drop policy if exists allowed_students_update_own_brady_only on public.allowed_students;
create policy allowed_students_update_own_brady_only
  on public.allowed_students
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and lower(email) = 'bradyhyro67@gmail.com'
    and lower((auth.jwt() ->> 'email')) = 'bradyhyro67@gmail.com'
  );

-- ---------------------------------------------------------------------------
-- Brady assignment progress
-- ---------------------------------------------------------------------------
create table if not exists public.brady_assignment_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id text not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','mastered')),
  score int null,
  last_attempt_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now()
);

create unique index if not exists brady_assignment_progress_user_assignment_unique
  on public.brady_assignment_progress (user_id, assignment_id);

alter table public.brady_assignment_progress enable row level security;

drop policy if exists brady_assignment_progress_owner_only on public.brady_assignment_progress;
create policy brady_assignment_progress_owner_only
  on public.brady_assignment_progress
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  );

-- ---------------------------------------------------------------------------
-- Brady daily training logs
-- ---------------------------------------------------------------------------
create table if not exists public.brady_daily_training_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  completed boolean not null default false,
  warmup_done boolean not null default false,
  target_done boolean not null default false,
  target_assignment_id text null,
  mixed_review_done boolean not null default false,
  ai_task_done boolean not null default false,
  reflection text null,
  created_at timestamptz not null default now()
);

create unique index if not exists brady_daily_training_log_user_day_unique
  on public.brady_daily_training_log (user_id, day);

alter table public.brady_daily_training_log enable row level security;

drop policy if exists brady_daily_training_log_owner_only on public.brady_daily_training_log;
create policy brady_daily_training_log_owner_only
  on public.brady_daily_training_log
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  );

-- ---------------------------------------------------------------------------
-- Brady reading logs + journal
-- ---------------------------------------------------------------------------
create table if not exists public.brady_reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  book_id text not null,
  minutes int not null check (minutes >= 0 and minutes <= 600),
  journal text null,
  created_at timestamptz not null default now()
);

create unique index if not exists brady_reading_log_user_day_book_unique
  on public.brady_reading_log (user_id, day, book_id);

alter table public.brady_reading_log enable row level security;

drop policy if exists brady_reading_log_owner_only on public.brady_reading_log;
create policy brady_reading_log_owner_only
  on public.brady_reading_log
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.allowed_students s
      where s.user_id = auth.uid()
        and lower(s.email) = 'bradyhyro67@gmail.com'
    )
  );
