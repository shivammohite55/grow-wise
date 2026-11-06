# Grow Wise — Supabase setup

Backend: Supabase (PostgreSQL) for GreenPlan AI.

## 1. Create the project (5 minutes)

1. Go to https://supabase.com and sign in (use GitHub — same account as the repo).
2. **New project**
   - Name: `grow-wise`
   - Database password: choose a strong one and save it somewhere safe. This is *not* the key you send to Charlie.
   - Region: **Mumbai (ap-south-1)** — closest to Pune.
3. Wait about 2 minutes for the project to finish provisioning.

## 2. Run the schema (10 minutes)

1. In Supabase: **SQL Editor → New query**
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in, press **Run**.
3. It should finish with no errors. Verify:
   ```sql
   select count(*) from public.species;  -- expect 10
   select count(*) from public.drives;   -- expect 10
   ```

## 3. Auth — turn on what the app needs

In Supabase: **Authentication → Providers**
- **Email** — ON (this is how users sign in).
- **Anonymous sign-ins** — ON if you want the hackathon demo to work without forcing every judge to create an account first. The app will sign a visitor in anonymously, then upgrade them if they register with email.

## 4. Storage — Health Check photos

**Storage → New bucket**
- Name: `tree-photos`
- Public bucket: **ON**

The schema file also tries to create this bucket for you. If that step errors, creating it here is the fix.

## 5. Copy the two values Charlie needs

**Settings → API**
- **Project URL** — e.g. `https://abcdefghijklm.supabase.co`
- **anon / publishable key** — the long `eyJ...` key labelled `anon public`.

Send Charlie those two values only.

> **Never send the `service_role` key.** That key bypasses Row Level Security and must never go into frontend code, GitHub, or chat.

The anon key is designed to be public — it ends up in the frontend code anyway. Row Level Security (in `schema.sql`) is what actually protects the data.

## 6. What Charlie wires up next

- Supabase JS client in `assets/js/app.js` (loaded from CDN, no build step).
- `plans`, `trees`, `watering_logs`, `health_checks` and `drive_joins` move from in-memory to Supabase, with a browser backup so the demo never breaks offline.
- `drives` and `species` are read live from Supabase instead of being hardcoded.
- Realtime joined counts on drives, and dashboard stats from the user's own rows.

After wiring, the code is pushed to GitHub and GitHub Pages redeploys automatically.
