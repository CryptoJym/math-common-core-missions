-- Add explicit workbook fields for reading logs/drafts:
-- - pages_read: what pages/chapters were read
-- - remembered_notes: what the learner remembers before peeking back

alter table if exists public.brady_reading_log
  add column if not exists pages_read text null;

alter table if exists public.brady_reading_log
  add column if not exists remembered_notes text null;

alter table if exists public.brady_reading_drafts
  add column if not exists pages_read text null;

alter table if exists public.brady_reading_drafts
  add column if not exists remembered_notes text null;
