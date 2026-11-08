# Grow Wise — GreenPlan AI

**Intelligent Tree Plantation Planning and Health Monitoring System**

Team Grow Wise · Hackathon project · Built for individuals, NGOs, colleges, municipal bodies and CSR teams in Pune district, Maharashtra, India — other districts are the scaling roadmap.

> Most plantation drives count trees planted. Grow Wise counts trees that survive.

## What it does

- **Dashboard** — Live plantation stats, monsoon timeline, watering-due list.
- **Plan a Plantation** — Five journeys: Community, Species Already Chosen, Date Fixed, Location Fixed, and Individual / Volunteer.
- **Dynamic recommendation engine** — A transparent rule engine that scores Location, Timing, Weather, Water, Soil and AQI, and changes its species mix, timing advice, water need and survival forecast with your inputs. A December date in Pune scores Timing 40/100 with an irrigation warning instead of repeating a fixed answer; a pre-selected species such as Neem is kept and scored, never dropped.
- **My Trees tracker** — Save a plan in one click, add trees manually, log watering, update health, and watch the dashboard update.
- **Drives** — 5 Pune-district drives, 13 Dec 2026 – 24 Jan 2027, with filters and a real join form (name + 10-digit mobile, in-page confirmation).
- **Learn** — Six in-depth guides plus a searchable 12-species library from the Pune dataset.
- **Health Check** — Photo upload, scan animation and a care report. Labelled in the app as a demo model.

## Run it

This is a static site — no build step, no backend.

```bash
# Option 1: open it directly
open index.html

# Option 2: serve it locally
python3 -m http.server 8000
# then open http://localhost:8000
```

Or enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / `/ (root)`) and open `https://<your-username>.github.io/grow-wise/`.

## Project structure

```
grow-wise/
├── index.html            # App markup — Dashboard, Plan, Tracker, Drives, Learn, Health Check
├── assets/
│   ├── css/
│   │   └── style.css     # All styles (formal, light, professional theme)
│   └── js/
│       └── app.js        # Recommendation engine, tracker, drives, species data, health demo
├── README.md
└── .gitignore
```

## Notes for evaluators

- Pune district only: 14 talukas, 12 species, 5 drives — built on 500 synthetic Pune sites × 12 species (6,000 site–species examples). Match bands: High ≥75, Moderate 55–75, Low <55. The engine is rule-based and explainable by design; survival is a synthetic-model estimate, not a field outcome. Live IMD weather, CPCB AQI and soil data are the next integration; the app does not claim a live satellite feed.
- The Health Check photo analysis is a demo model in this prototype.
- Tracker, plans and drive joins save to Supabase (PostgreSQL) with a browser backup, so they survive a refresh. See `supabase/` for the schema and the Pune-only migration.

## Team

Team Grow Wise — GreenPlan AI.
