-- Adds james@jamesbrady.org to the allowed email list for Brady-only pages.
-- Mirrors Supabase migration: brady_whitelist_add_james_email

drop policy if exists allowed_students_insert_brady_only on public.allowed_students;
drop policy if exists allowed_students_update_own_brady_only on public.allowed_students;

drop policy if exists allowed_students_insert_whitelisted_emails on public.allowed_students;
create policy allowed_students_insert_whitelisted_emails
  on public.allowed_students
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and lower(email) = lower((auth.jwt() ->> 'email'))
    and lower(email) in ('bradyhyro67@gmail.com', 'james@jamesbrady.org')
  );

drop policy if exists allowed_students_update_own_whitelisted_emails on public.allowed_students;
create policy allowed_students_update_own_whitelisted_emails
  on public.allowed_students
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and lower(email) = lower((auth.jwt() ->> 'email'))
    and lower(email) in ('bradyhyro67@gmail.com', 'james@jamesbrady.org')
  );

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

