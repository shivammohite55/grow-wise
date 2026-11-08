-- ============================================================
-- Grow Wise — login migration (8 Nov 2026)
-- Run ONCE in Supabase: SQL Editor > New query
-- Safe to run again (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- What it does:
--   1. Adds organiser_id to drives, so a drive knows which
--      account created it (needed for "Your drives & volunteers").
--   2. Lets NGO / College / Municipal / CSR accounts publish
--      drives, and edit their own drives.
-- No change to profiles (own read/insert/update already exist),
-- plans, trees or drive_joins (volunteer lists are already
-- readable, which is what the organiser panel uses).
-- ============================================================

alter table public.drives
  add column if not exists organiser_id uuid references auth.users (id) on delete set null;

drop policy if exists "drives organiser insert" on public.drives;
create policy "drives organiser insert"
  on public.drives for insert with check (
    auth.uid() = organiser_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('ngo', 'college', 'municipal', 'csr')
    )
  );

drop policy if exists "drives organiser update" on public.drives;
create policy "drives organiser update"
  on public.drives for update using (auth.uid() = organiser_id);

-- Check: expect one row, organiser_id
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'drives'
  and column_name = 'organiser_id';
