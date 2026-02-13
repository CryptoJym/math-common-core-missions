-- Assignment + Reading drafts (autosave on refresh/page change).

create table if not exists public.brady_assignment_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  assignment_id text not null,
  seed int not null,

  draft_kind text not null check (draft_kind in ('test')),
  quiz jsonb not null default '{}'::jsonb,
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

create table if not exists public.brady_reading_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  day date not null,
  book_id text not null,

  minutes int null check (minutes is null or (minutes >= 0 and minutes <= 600)),
  journal text null,

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists brady_reading_drafts_user_day_book_unique
  on public.brady_reading_drafts (user_id, day, book_id);

create index if not exists brady_reading_drafts_user_day_updated_idx
  on public.brady_reading_drafts (user_id, day, updated_at desc);

alter table public.brady_reading_drafts enable row level security;

drop policy if exists brady_reading_drafts_owner_only on public.brady_reading_drafts;
create policy brady_reading_drafts_owner_only
  on public.brady_reading_drafts
  for all
  to authenticated
  using (public.brady_can_access_user_data(user_id))
  with check (public.brady_can_access_user_data(user_id));
