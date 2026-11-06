-- ============================================================
-- Grow Wise — GreenPlan AI
-- Supabase / PostgreSQL schema
-- Run this whole file once in Supabase: SQL Editor > New query
-- Project: grow-wise  |  Database: Postgres
-- ============================================================

-- UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: one row per user (linked to Supabase Auth)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text check (role in ('individual','ngo','college','municipal','csr')),
  district text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- species: reference library (public read)
-- water_need 1-5 (1 = very low, 5 = very high)
-- drought_tolerance 1-5 (1 = low, 5 = very high)
-- ------------------------------------------------------------
create table if not exists public.species (
  id bigint generated always as identity primary key,
  name text not null unique,
  scientific_name text,
  water_need int not null check (water_need between 1 and 5),
  drought_tolerance int not null check (drought_tolerance between 1 and 5),
  best_soils text[] not null default '{}',
  height text,
  growth_rate text,
  best_use text,
  note text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- plans: one plantation plan, with its recommendation saved
-- recommendation is JSONB so the rule engine result is stored
-- exactly as shown to the user (scores + species mix).
-- ------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  journey text not null check (journey in ('community','species_selected','date_fixed','location_fixed','individual')),
  district text not null,
  planting_date date not null,
  tree_count int not null check (tree_count > 0),
  purpose text,
  soil text,
  water_source text,
  maintenance text,
  location_text text,
  species_requested text,
  recommendation jsonb not null default '{}'::jsonb,
  suitability_score int check (suitability_score between 0 and 100),
  survival_forecast int check (survival_forecast between 0 and 100),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- trees: a planted / tracked tree (belongs to a user, optionally a plan)
-- health: healthy | stressed | needs_attention | dead
-- ------------------------------------------------------------
create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  species text not null,
  location text,
  planted_on date,
  health text not null default 'healthy'
    check (health in ('healthy','stressed','needs_attention','dead')),
  last_watered_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- watering_logs: one row per watering event
-- ------------------------------------------------------------
create table if not exists public.watering_logs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  watered_on date not null default current_date,
  litres numeric,
  note text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- health_checks: one Health Check report per tree
-- photo_url points at Supabase Storage (bucket: tree-photos)
-- ------------------------------------------------------------
create table if not exists public.health_checks (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.trees (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  photo_url text,
  health_score int check (health_score between 0 and 100),
  stress_signs text,
  advice text,
  model text not null default 'demo',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- drives: plantation drives (public read)
-- ------------------------------------------------------------
create table if not exists public.drives (
  id bigint generated always as identity primary key,
  title text not null,
  organiser text not null,
  type text not null check (type in ('NGO','College','Municipal','CSR','Community')),
  city text not null,
  district text,
  drive_date date not null,
  start_time text,
  venue text,
  trees_target int not null default 0,
  joined_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- drive_joins: one registration per person per drive
-- A mobile number can join the same drive only once.
-- ------------------------------------------------------------
create table if not exists public.drive_joins (
  id uuid primary key default gen_random_uuid(),
  drive_id bigint not null references public.drives (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  mobile text not null,
  volunteers_count int not null default 1 check (volunteers_count > 0),
  created_at timestamptz not null default now(),
  unique (drive_id, mobile)
);

-- ------------------------------------------------------------
-- Indexes (joins / dashboard queries)
-- ------------------------------------------------------------
create index if not exists idx_plans_user on public.plans (user_id, created_at desc);
create index if not exists idx_trees_user on public.trees (user_id, created_at desc);
create index if not exists idx_trees_plan on public.trees (plan_id);
create index if not exists idx_watering_tree on public.watering_logs (tree_id, watered_on desc);
create index if not exists idx_health_tree on public.health_checks (tree_id, created_at desc);
create index if not exists idx_drives_date on public.drives (drive_date);
create index if not exists idx_joins_drive on public.drive_joins (drive_id, created_at desc);

-- ------------------------------------------------------------
-- Row Level Security
-- Public: anyone can read species and drives.
-- Own data: a signed-in user can read/insert/update their own
-- plans, trees, watering logs and health checks.
-- Joins: anyone can register (name + mobile), but only the
-- organiser / owner flow should read the full list in future.
-- For the hackathon demo, drive_joins are readable so the
-- joined count can be shown live; tighten this before launch.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.species enable row level security;
alter table public.plans enable row level security;
alter table public.trees enable row level security;
alter table public.watering_logs enable row level security;
alter table public.health_checks enable row level security;
alter table public.drives enable row level security;
alter table public.drive_joins enable row level security;

-- species: public read, no public write
drop policy if exists "species public read" on public.species;
create policy "species public read"
  on public.species for select using (true);

-- drives: public read, no public write
drop policy if exists "drives public read" on public.drives;
create policy "drives public read"
  on public.drives for select using (true);

-- profiles: user reads/updates their own row
drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read"
  on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert"
  on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update"
  on public.profiles for update using (auth.uid() = id);

-- plans: own rows only
drop policy if exists "plans own select" on public.plans;
create policy "plans own select"
  on public.plans for select using (auth.uid() = user_id);
drop policy if exists "plans own insert" on public.plans;
create policy "plans own insert"
  on public.plans for insert with check (auth.uid() = user_id);
drop policy if exists "plans own update" on public.plans;
create policy "plans own update"
  on public.plans for update using (auth.uid() = user_id);

-- trees: own rows only
drop policy if exists "trees own select" on public.trees;
create policy "trees own select"
  on public.trees for select using (auth.uid() = user_id);
drop policy if exists "trees own insert" on public.trees;
create policy "trees own insert"
  on public.trees for insert with check (auth.uid() = user_id);
drop policy if exists "trees own update" on public.trees;
create policy "trees own update"
  on public.trees for update using (auth.uid() = user_id);

-- watering_logs: via the tree owner
drop policy if exists "watering own select" on public.watering_logs;
create policy "watering own select"
  on public.watering_logs for select using (
    exists (select 1 from public.trees t
            where t.id = watering_logs.tree_id and t.user_id = auth.uid())
  );
drop policy if exists "watering own insert" on public.watering_logs;
create policy "watering own insert"
  on public.watering_logs for insert with check (
    exists (select 1 from public.trees t
            where t.id = watering_logs.tree_id and t.user_id = auth.uid())
  );

-- health_checks: own rows only
drop policy if exists "health own select" on public.health_checks;
create policy "health own select"
  on public.health_checks for select using (auth.uid() = user_id);
drop policy if exists "health own insert" on public.health_checks;
create policy "health own insert"
  on public.health_checks for insert with check (auth.uid() = user_id);

-- drive_joins: anyone can register; anyone can read the count
-- (tighten to organiser-only reads before a public launch)
drop policy if exists "joins public read" on public.drive_joins;
create policy "joins public read"
  on public.drive_joins for select using (true);
drop policy if exists "joins public insert" on public.drive_joins;
create policy "joins public insert"
  on public.drive_joins for insert with check (true);

-- ------------------------------------------------------------
-- Storage: bucket for Health Check photos
-- Run in the SQL Editor too (Storage tables are in the
-- storage schema). If this block errors, create the bucket
-- in Dashboard > Storage > New bucket: name "tree-photos",
-- Public bucket: ON.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tree-photos', 'tree-photos', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Seed data: species (matches the app's 10-species library)
-- ------------------------------------------------------------
insert into public.species
  (name, scientific_name, water_need, drought_tolerance, best_soils, height, growth_rate, best_use, note)
values
  ('Neem', 'Azadirachta indica', 2, 5, '{black,red,rocky,sandy}', '15–20 m', 'Fast', 'Shade, air quality, medicinal', 'Extremely hardy; the safest pick for dry, rocky or low-care sites.'),
  ('Karanj', 'Pongamia pinnata', 2, 4, '{black,red,alluvial,clay}', '10–15 m', 'Fast', 'Shade, riverbanks, avenue', 'Tolerates waterlogging and poor soil; excellent all-rounder.'),
  ('Bahava (Amaltas)', 'Cassia fistula', 3, 3, '{red,alluvial,black}', '8–12 m', 'Medium', 'Ornamental, campuses, bees', 'Golden summer flowers; needs decent drainage and early water.'),
  ('Jamun', 'Syzygium cumini', 4, 2, '{alluvial,black,clay}', '12–18 m', 'Medium', 'Fruit, birds, shade', 'Loves moisture; superb near ponds and riverbanks, poor in drought.'),
  ('Banyan', 'Ficus benghalensis', 3, 3, '{alluvial,red,black}', '20–30 m', 'Slow', 'Landmark shade, biodiversity', 'Needs 15 m+ space. Never near buildings, wires or small plots.'),
  ('Peepal', 'Ficus religiosa', 3, 4, '{red,rocky,alluvial}', '15–25 m', 'Fast', 'Biodiversity, oxygen, shade', 'Bird magnet; keep away from walls — roots are powerful.'),
  ('Mango', 'Mangifera indica', 3, 3, '{red,alluvial,black}', '10–15 m', 'Medium', 'Fruit, shade, community', 'Community favourite — people protect what feeds them.'),
  ('Rain Tree', 'Samanea saman', 4, 2, '{alluvial,black,clay}', '15–20 m', 'Very fast', 'Instant shade, large grounds', 'Huge umbrella canopy; needs space and reliable water.'),
  ('Gulmohar', 'Delonix regia', 3, 3, '{red,sandy,alluvial}', '10–12 m', 'Fast', 'Ornamental avenues', 'Spectacular red bloom; shallow roots — avoid near paving.'),
  ('Tamarind', 'Tamarindus indica', 2, 5, '{black,red,rocky,sandy}', '15–20 m', 'Slow', 'Fruit, shade, drought zones', 'Nearly indestructible once established; ideal for dry districts.')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Seed data: drives, 13 Dec 2026 – 31 Jan 2027
-- ------------------------------------------------------------
insert into public.drives
  (title, organiser, type, city, district, drive_date, start_time, venue, trees_target, joined_count)
values
  ('Baner Hills Restoration Drive', 'Green Pune Foundation', 'NGO', 'Pune', 'Pune', '2026-12-13', '7:00 AM', 'Baner Hill Trailhead, Pune', 300, 84),
  ('PCCOE Campus Green Cover Drive', 'PCCOE Green Club', 'College', 'Pune', 'Pune', '2026-12-19', '8:00 AM', 'PCCOE Campus, Nigdi, Pune', 150, 62),
  ('Mula Riverbank Plantation', 'Pune Municipal Corporation', 'Municipal', 'Pune', 'Pune', '2026-12-20', '7:30 AM', 'Mula Riverbank, Kharadi', 500, 141),
  ('Godavari Ghat Greening', 'Nashik Eco Trust', 'NGO', 'Nashik', 'Nashik', '2026-12-27', '7:00 AM', 'Ramkund Ghat, Nashik', 250, 73),
  ('Futala Lake Shade Drive', 'Nagpur Green Brigade', 'NGO', 'Nagpur', 'Nagpur', '2027-01-03', '7:00 AM', 'Futala Lake Promenade, Nagpur', 200, 58),
  ('Rankala Lakeside Plantation', 'Kolhapur Municipal Council', 'Municipal', 'Kolhapur', 'Kolhapur', '2027-01-09', '8:00 AM', 'Rankala Lake Garden, Kolhapur', 350, 97),
  ('Yeoor Hills Buffer Planting', 'Thane Creek Guardians', 'NGO', 'Thane', 'Thane', '2027-01-10', '6:30 AM', 'Yeoor Hills Gate, Thane', 400, 112),
  ('CSR Avenue Plantation — Hinjewadi', 'TechPark CSR Collective', 'CSR', 'Pune', 'Pune', '2027-01-17', '7:00 AM', 'Phase 2 Avenue, Hinjewadi', 600, 188),
  ('College Biodiversity Park Drive', 'Fergusson College NSS', 'College', 'Pune', 'Pune', '2027-01-24', '8:00 AM', 'Fergusson Hill, Pune', 180, 49),
  ('Ambazari Biodiversity Drive', 'Nagpur CSR Forum', 'CSR', 'Nagpur', 'Nagpur', '2027-01-31', '7:30 AM', 'Ambazari Garden, Nagpur', 450, 126);

-- Done. Verify with:
--   select count(*) from public.species;  -- 10
--   select count(*) from public.drives;   -- 10
