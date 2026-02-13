-- Structured learner profile memory for the AI coach.
--
-- Plain language:
-- - This is the "memory" for Hyro's AI coach.
-- - It stores two JSON blobs:
--     1) manual: parent/teacher-entered facts and preferences (editable)
--     2) memory: AI-maintained summary (strengths, weaknesses, next focus, etc.)
-- - This is stored per learner (user_id) and protected by RLS so only:
--     - the learner themselves, or
--     - an allowed admin who is linked via brady_sub_accounts
--   can read/write it.

create table if not exists public.brady_ai_learner_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version int not null default 1,
  manual jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.brady_ai_learner_profile enable row level security;

-- Access rule (intentionally strict):
-- - Learner can access their own profile
-- - Admin (allowed actor) can access learner profiles they manage
drop policy if exists brady_ai_learner_profile_access on public.brady_ai_learner_profile;
create policy brady_ai_learner_profile_access
  on public.brady_ai_learner_profile
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.brady_sub_accounts link
      where link.admin_user_id = auth.uid()
        and link.learner_id = public.brady_ai_learner_profile.user_id
        and link.is_active = true
        and public.brady_is_allowed_actor()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.brady_sub_accounts link
      where link.admin_user_id = auth.uid()
        and link.learner_id = public.brady_ai_learner_profile.user_id
        and link.is_active = true
        and public.brady_is_allowed_actor()
    )
  );

