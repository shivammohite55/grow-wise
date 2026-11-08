-- ============================================================
-- Grow Wise — tracker test-data cleanup (8 Nov 2026)
-- Run ONCE in Supabase: SQL Editor > New query
-- Safe to run again: after the first run there is nothing
-- left to delete, so a second run changes nothing.
--
-- What it does, in order:
--   1. Deletes tracked trees whose species is NOT one of the
--      12 Pune-dataset species (e.g. Mango, Rain Tree,
--      Gulmohar, Tamarind left over from earlier tests).
--   2. Deletes duplicate tracked trees, keeping only the
--      NEWEST row for each user + species + location +
--      planted date (so the Pune City 20 Dec 2026 plan that
--      was saved twice keeps one entry: Karanj x4,
--      Bahava (Amaltas) x4, Amla x2).
--   3. Deletes duplicate plans the same way, keeping the newest.
--   4. Shows what is left, so you can check the result.
-- It does NOT delete the newest entries, and it does NOT
-- touch drives, drive_joins or species.
-- ============================================================

-- 1. Non-Pune species (leftover test data)
delete from public.trees
where species not in (
  'Neem', 'Karanj', 'Bahava (Amaltas)', 'Jamun', 'Banyan', 'Peepal',
  'Amla', 'Arjun', 'Mahua', 'Shirish', 'Kachnar', 'Dudhi'
);

-- 2. Duplicate trees: keep only the newest per user + species + location + planted date
delete from public.trees t
using public.trees d
where t.user_id is not distinct from d.user_id
  and t.species = d.species
  and t.location is not distinct from d.location
  and t.planted_on is not distinct from d.planted_on
  and t.created_at < d.created_at;

-- 3. Duplicate plans: keep only the newest per user + taluka + planting date + tree count
delete from public.plans p
using public.plans q
where p.user_id is not distinct from q.user_id
  and p.district = q.district
  and p.planting_date = q.planting_date
  and p.tree_count = q.tree_count
  and p.created_at < q.created_at;

-- 4. Check what is left (expect: no Mango / Rain Tree / Gulmohar /
--    Tamarind rows, and only one row per species + location + date)
select species, location, planted_on, count(*) as rows
from public.trees
group by species, location, planted_on
order by planted_on desc, species;

select count(*) as total_trees from public.trees;
select count(*) as total_plans from public.plans;
