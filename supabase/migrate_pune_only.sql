-- ============================================================
-- Grow Wise — Pune-only migration (8 Nov 2026)
-- Run ONCE in Supabase: SQL Editor > New query
-- Do NOT re-run the full schema.sql — it would duplicate drives.
-- This file updates the LIVE database to match the Pune-only site:
--   * drives: keep only the 5 Pune drives
--   * species: keep only the 12 Pune-dataset species, add 6 new ones
-- ============================================================

-- 1. Drives: drop every non-Pune drive.
--    Their drive_joins rows delete automatically (ON DELETE CASCADE).
delete from public.drives where coalesce(district, '') <> 'Pune';

-- 2. Species: drop the 4 species that are not in the Pune dataset.
delete from public.species where name in ('Mango', 'Rain Tree', 'Gulmohar', 'Tamarind');

-- 3. Dataset tolerance columns (safe to run on an older schema).
alter table public.species add column if not exists ph_min numeric;
alter table public.species add column if not exists ph_max numeric;
alter table public.species add column if not exists rain_min_mm int;
alter table public.species add column if not exists rain_max_mm int;
alter table public.species add column if not exists temp_min_c int;
alter table public.species add column if not exists temp_max_c int;
alter table public.species add column if not exists spacing_m numeric;
alter table public.species add column if not exists canopy_m numeric;
alter table public.species add column if not exists dataset_match_score numeric;
alter table public.species add column if not exists dataset_survival_pct numeric;

-- 4. Add the 6 dataset species missing from the old 10-species library.
insert into public.species
  (name, scientific_name, water_need, drought_tolerance, best_soils, height, growth_rate, best_use, note,
   ph_min, ph_max, rain_min_mm, rain_max_mm, temp_min_c, temp_max_c, spacing_m, canopy_m, dataset_match_score, dataset_survival_pct)
values
  ('Amla', 'Phyllanthus emblica', 2, 4, '{lateritic,black,loamy}', 'up to 15 m', 'Medium', 'Fruit, community orchards', 'Dataset match 81.6/100, synthetic survival 87.2%.', 5.0, 8.5, 500, 1500, 18, 42, 6, 7, 81.6, 87.2),
  ('Arjun', 'Terminalia arjuna', 5, 3, '{loamy,black,clayey}', 'up to 25 m', 'Medium', 'Riverbanks, shade, avenue', 'Highest water need in the dataset; lowest dataset match at 73.8/100.', 5.0, 8.0, 800, 2500, 18, 40, 8, 10, 73.8, 75.2),
  ('Mahua', 'Madhuca longifolia', 2, 4, '{lateritic,black,sandyloam}', 'up to 25 m', 'Slow', 'Fruit, shade, community', 'Dataset match 81.2/100, synthetic survival 87.0%.', 5.0, 8.5, 600, 1800, 18, 42, 10, 10, 81.2, 87.0),
  ('Shirish', 'Albizia lebbeck', 3, 4, '{lateritic,black,loamy}', 'up to 25 m', 'Fast', 'Avenue, shade, nitrogen fixer', 'Highest dataset match in Pune (82.3/100).', 5.0, 8.5, 500, 1800, 18, 42, 8, 10, 82.3, 80.3),
  ('Kachnar', 'Bauhinia variegata', 3, 3, '{lateritic,loamy,sandyloam}', 'up to 12 m', 'Medium', 'Ornamental, campuses, small plots', 'Compact 5 m spacing — highest capacity per site in the dataset (median 74 trees).', 5.0, 8.0, 600, 1800, 18, 40, 5, 6, 79.3, 78.7),
  ('Dudhi', 'Wrightia tinctoria', 2, 4, '{lateritic,black,sandyloam}', 'up to 12 m', 'Slow', 'Small plots, campuses, shade', 'Compact 5 m spacing, dataset match 81.8/100.', 5.0, 8.5, 500, 1500, 18, 42, 5, 6, 81.8, 87.0)
on conflict (name) do nothing;

-- 5. Update the 6 retained species to the dataset soil keys and tolerances.
update public.species set water_need = 3, best_soils = '{black,lateritic,sandyloam}', height = 'up to 35 m',
  ph_min = 5.0, ph_max = 8.5, rain_min_mm = 500, rain_max_mm = 1500, temp_min_c = 18, temp_max_c = 42,
  spacing_m = 8, canopy_m = 10, dataset_match_score = 81.6, dataset_survival_pct = 80.1 where name = 'Neem';
update public.species set best_soils = '{black,lateritic,loamy,clayey}', height = 'up to 20 m',
  ph_min = 5.5, ph_max = 8.5, rain_min_mm = 500, rain_max_mm = 1800, temp_min_c = 18, temp_max_c = 42,
  spacing_m = 7, canopy_m = 8, dataset_match_score = 82.2, dataset_survival_pct = 87.4 where name = 'Karanj';
update public.species set water_need = 2, best_soils = '{lateritic,loamy,black}', height = 'up to 15 m',
  ph_min = 5.0, ph_max = 8.5, rain_min_mm = 500, rain_max_mm = 1500, temp_min_c = 18, temp_max_c = 42,
  spacing_m = 6, canopy_m = 7, dataset_match_score = 81.7, dataset_survival_pct = 87.1 where name = 'Bahava (Amaltas)';
update public.species set best_soils = '{loamy,black,clayey}', height = 'up to 30 m',
  ph_min = 5.0, ph_max = 8.0, rain_min_mm = 700, rain_max_mm = 2200, temp_min_c = 18, temp_max_c = 40,
  spacing_m = 8, canopy_m = 10, dataset_match_score = 76.4, dataset_survival_pct = 77.1 where name = 'Jamun';
update public.species set best_soils = '{loamy,lateritic,black}', height = 'up to 30 m',
  ph_min = 5.0, ph_max = 8.0, rain_min_mm = 700, rain_max_mm = 2500, temp_min_c = 18, temp_max_c = 40,
  spacing_m = 15, canopy_m = 15, dataset_match_score = 77.5, dataset_survival_pct = 77.8 where name = 'Banyan';
update public.species set best_soils = '{lateritic,loamy}', height = 'up to 25 m',
  ph_min = 5.0, ph_max = 8.0, rain_min_mm = 600, rain_max_mm = 2000, temp_min_c = 18, temp_max_c = 40,
  spacing_m = 10, canopy_m = 12, dataset_match_score = 78.7, dataset_survival_pct = 78.4 where name = 'Peepal';

-- Verify (expect 12 and 5):
--   select count(*) from public.species;
--   select count(*) from public.drives;
--   select name from public.species order by name;
--   select title, city from public.drives order by drive_date;
