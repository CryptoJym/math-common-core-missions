-- Stores in-progress ASSIGNMENT test work so refresh/page changes don't lose answers.
--
-- Plain language:
-- - A "draft" is unfinished work (answers typed but not submitted yet).
-- - This autosaves while the student works.
-- - On Submit & Grade (a real attempt), we clear the draft.

create table if not exists public.brady_assignment_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  assignment_id text not null,
  seed int not null,

  -- Reserved for future expansion (practice/test), but only "test" is used today.
  draft_kind text not null check (draft_kind in ('test')),

  -- Snapshot of the quiz used (questions + grading key) so drafts can re-render
  -- even if the quiz bank changes later.
  quiz jsonb not null default '{}'::jsonb,

  -- Map of { q1: "...", q2: "...", ... }
  answers jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists brady_assignment_drafts_user_assignment_seed_kind_unique
  on public.brady_assignment_drafts (user_id, assignment_id, seed, draft_kind);

create index if not exists brady_assignment_drafts_user_updated_idx
  on public.brady_assignment_drafts (user_id, updated_at desc);

alter table public.brady_assignment_drafts enable row level security;

drop policy if exists brady_assignment_drafts_owner_only on public.brady_assignment_drafts;
create policy brady_assignment_drafts_owner_only
  on public.brady_assignment_drafts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));

