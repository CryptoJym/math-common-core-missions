-- AI review cache for uploaded artifacts.
--
-- Plain language:
-- - This stores "teacher feedback from AI" for each uploaded file.
-- - Review is cached so repeated clicks do not regenerate/spend tokens.
-- - Each user can only read/write their own reviews (plus email allowlist).

create table if not exists public.brady_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.brady_artifacts(id) on delete cascade,

  provider text not null check (provider in ('openai', 'gemini')),
  model text not null,
  score_percent int not null check (score_percent >= 0 and score_percent <= 100),
  feedback text not null,
  next_steps jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  constraint brady_ai_reviews_user_artifact_unique unique (user_id, artifact_id)
);

create index if not exists brady_ai_reviews_user_created_idx
  on public.brady_ai_reviews (user_id, created_at desc);

create index if not exists brady_ai_reviews_artifact_idx
  on public.brady_ai_reviews (artifact_id);

alter table public.brady_ai_reviews enable row level security;

drop policy if exists brady_ai_reviews_owner_only on public.brady_ai_reviews;
create policy brady_ai_reviews_owner_only
  on public.brady_ai_reviews
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
