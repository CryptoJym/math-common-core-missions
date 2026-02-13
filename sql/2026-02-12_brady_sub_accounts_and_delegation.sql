-- Brady sub-accounts and delegation.
--
-- Supports parent/teacher accounts managing one or more learner accounts.
-- Learner context writes are stored by the learner's user_id while access
-- remains controlled by explicit parent/learner relationships.

create extension if not exists pgcrypto;

create table if not exists public.brady_sub_accounts (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  learner_id uuid null references auth.users(id) on delete cascade,
  learner_email text not null,
  learner_name text null,
  learner_role text not null default 'student' check (learner_role in ('parent', 'teacher', 'student', 'child')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists brady_sub_accounts_admin_email_unique
  on public.brady_sub_accounts (admin_user_id, lower(learner_email));

create index if not exists brady_sub_accounts_admin_idx
  on public.brady_sub_accounts (admin_user_id, learner_id, is_active);

create index if not exists brady_sub_accounts_learner_idx
  on public.brady_sub_accounts (learner_id, is_active);

alter table public.brady_sub_accounts enable row level security;

create or replace function public.brady_is_allowed_actor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.allowed_students a
    where a.user_id = auth.uid()
  );
$$;

-- Access rule:
-- 1) Allowed actor can access their own data.
-- 2) Allowed actor can access any learner they manage.
-- 3) Learners can access learner rows that belong to the same parent/admin.
create or replace function public.brady_can_access_user_data(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    auth.uid() is not null
    and (
      (public.brady_is_allowed_actor() and target_user_id = auth.uid())
      or exists (
        select 1
        from public.brady_sub_accounts admin_link
        where admin_link.admin_user_id = auth.uid()
          and admin_link.learner_id = target_user_id
          and admin_link.is_active = true
          and public.brady_is_allowed_actor()
      )
      or exists (
        select 1
        from public.brady_sub_accounts learner_link
        where learner_link.learner_id = auth.uid()
          and learner_link.is_active = true
          and exists (
            select 1
            from public.brady_sub_accounts sibling_link
            where sibling_link.admin_user_id = learner_link.admin_user_id
              and sibling_link.learner_id = target_user_id
              and sibling_link.is_active = true
          )
      )
    );
$$;

drop policy if exists brady_sub_accounts_select on public.brady_sub_accounts;
drop policy if exists brady_sub_accounts_insert on public.brady_sub_accounts;
drop policy if exists brady_sub_accounts_update on public.brady_sub_accounts;
drop policy if exists brady_sub_accounts_delete on public.brady_sub_accounts;

create policy brady_sub_accounts_select
  on public.brady_sub_accounts
  for select
  to authenticated
  using (
    admin_user_id = auth.uid()
    or (learner_id = auth.uid() and is_active = true)
  );

create policy brady_sub_accounts_insert
  on public.brady_sub_accounts
  for insert
  to authenticated
  with check (
    admin_user_id = auth.uid()
    and public.brady_is_allowed_actor()
  );

create policy brady_sub_accounts_update
  on public.brady_sub_accounts
  for update
  to authenticated
  using (
    admin_user_id = auth.uid()
    and public.brady_is_allowed_actor()
    or (
      learner_id is null
      and is_active = true
      and lower(learner_email) = lower((auth.jwt() ->> 'email'))
      )
  )
  with check (
    admin_user_id = auth.uid()
    and public.brady_is_allowed_actor()
    or (
      learner_id = auth.uid()
      and is_active = true
      and lower(learner_email) = lower((auth.jwt() ->> 'email'))
      )
  );

create policy brady_sub_accounts_delete
  on public.brady_sub_accounts
  for delete
  to authenticated
  using (
    admin_user_id = auth.uid()
    and public.brady_is_allowed_actor()
  );

-- Update all Brady tables to use shared delegation check.
drop policy if exists brady_assignment_progress_owner_only on public.brady_assignment_progress;
create policy brady_assignment_progress_owner_only
  on public.brady_assignment_progress
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_daily_training_log_owner_only on public.brady_daily_training_log;
create policy brady_daily_training_log_owner_only
  on public.brady_daily_training_log
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_reading_log_owner_only on public.brady_reading_log;
create policy brady_reading_log_owner_only
  on public.brady_reading_log
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_assignment_attempts_owner_only on public.brady_assignment_attempts;
create policy brady_assignment_attempts_owner_only
  on public.brady_assignment_attempts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_practice_attempts_owner_only on public.brady_practice_attempts;
create policy brady_practice_attempts_owner_only
  on public.brady_practice_attempts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_practice_drafts_owner_only on public.brady_practice_drafts;
create policy brady_practice_drafts_owner_only
  on public.brady_practice_drafts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_artifacts_owner_only on public.brady_artifacts;
create policy brady_artifacts_owner_only
  on public.brady_artifacts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_ai_reviews_owner_only on public.brady_ai_reviews;
create policy brady_ai_reviews_owner_only
  on public.brady_ai_reviews
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

drop policy if exists brady_generated_quizzes_owner_only on public.brady_generated_quizzes;
create policy brady_generated_quizzes_owner_only
  on public.brady_generated_quizzes
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));
