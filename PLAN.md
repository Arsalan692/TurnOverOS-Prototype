# TurnoverOS — Prototype Plan

**Goal:** Impress Junny Ko (KO Realty) with a working prototype that answers his Q1
("how would you cut days-vacant?") and backs up Q2 ("can you rebuild software like Yardi?").

**Deadline:** Reply by **Oct 25, 2026** (3 days from Oct 22 email).

---

## 1. The problem (why this matters to Junny)

- KO Realty manages ~800 rental units in Calgary and Edmonton.
- Every empty day = lost rent. 1-bed averages: Calgary ~$1,465/mo, Edmonton ~$1,250/mo
  → roughly **$41–48 lost per unit per day**.
- Market is getting harder: Calgary vacancy ~6.8%, Edmonton ~5.8% (Q2 2026), rents falling.
  Units take longer to fill → speed matters more.
- Industry research: most vacant days are lost in **handoffs** (waiting for cleaner,
  photos, listing, slow screening), not in the work itself.

## 2. What we build: TurnoverOS

A web app that tracks every unit from **"tenant gave notice"** to **"new tenant moved in"**,
shows where units get stuck, and uses AI (Gemini) to speed up the slow steps.

### Turnover stages (each unit moves through these)
1. Notice received
2. Pre-marketing (listing goes live BEFORE old tenant leaves)
3. Move-out inspection (mandatory in Alberta)
4. Make-ready (cleaning + repairs)
5. Photos
6. Listed (Rentfaster / Facebook)
7. Showings
8. Application screening
9. Lease signed
10. Moved in

Each stage has a **target time**. Over target → unit flagged red.

### Where vacant days are lost (the problem)
| Cause | Why |
|---|---|
| Late start | Marketing begins after move-out, though notice arrives ~30 days earlier |
| Make-ready | Cleaners/repairs booked late, slow handoffs |
| Listing | Photos + ad writing delayed |
| Wrong price | Overpriced unit gets few leads, sits for weeks (worse as Calgary rents fall) |
| Slow lead replies | Renters wait hours/days for an answer and rent elsewhere |
| Screening | Manual application review takes days |
| No visibility | Nobody sees which step is losing days across 800 units |

### Features (Software + Data + Automation) — ordered by impact
| # | Feature | Type | How it cuts days |
|---|---|---|---|
| F1 | **Notice Autopilot** — when notice is logged, auto-create the full turnover: book move-out inspection, schedule cleaner/repairs/photos for move-out day, pre-list the unit immediately | Automation | **Biggest lever.** Next tenant can be signed before old one leaves → gap near zero |
| F2 | **Turnover Board** (Kanban, units across 10 stages, red when over target) | Software | Staff see and act on stuck units |
| F3 | **AI Listing Writer** (Gemini) — unit facts → ready ad for Rentfaster / Facebook | AI | Ad in seconds, not days |
| F4 | **Smart Price Suggestion** — compares unit to similar units and its lead count; suggests rent drop if leads are low after X days | Data | Stops units sitting for weeks overpriced |
| F5 | **Lead Reply Bot** (demo) — answers renter questions about a listing and offers showing slots | Automation (bot experience) | No leads lost to slow replies |
| F6 | **AI Application Reader** (Gemini) — upload application (PDF/image) → structured data + screening summary | AI (HBL IDP) | Screening in hours, not days |
| F7 | **Vacancy Dashboard** — avg days vacant, $ lost, slowest stage, Calgary vs Edmonton, before/after | Data | **Measures success** |
| F8 | **Savings calculator** — "cut X days at stage Y → owners save $Z/yr" | Data | Turns the idea into money |
| F9 *(stretch)* | **Stuck-unit alerts / daily digest** | Automation | Nothing slips |

Savings per feature are industry estimates — presented to Junny as targets to test, not proven results.

### Demo data
~800 fake but realistic units (Calgary + Edmonton neighbourhoods, real rent ranges),
12 months of past turnovers so the dashboard has real-looking history.
Built-in story: "before" vs "after pre-marketing" to show the impact.

## 3. Tech stack

| Layer | Choice |
|---|---|
| Backend | Python, **FastAPI**, SQLAlchemy, Alembic (migrations), Pydantic |
| Database | **PostgreSQL** (Docker locally, Neon free tier online) |
| Frontend | **React** + Vite + TypeScript, Tailwind CSS, Recharts (charts), drag-and-drop for board |
| AI | **Gemini API** via `google-genai` SDK, structured JSON output (key provided by you in Phase 4) |
| Hosting | Frontend → Vercel, Backend → Render (or Railway), DB → Neon |
| Code | GitHub repo (public), README with screenshots |

## 4. Data model (Yardi-style core, built from scratch)

```
Owner ──< Property ──< Unit ──< Lease >── Tenant
                         │
                         └──< Turnover ──< StageEvent (stage, entered_at, exited_at)
                                   │
                                   ├──< WorkOrder (cleaning/repair, vendor, cost)
                                   ├──< Task (auto-created by Notice Autopilot: inspection, clean, photos…)
                                   ├──< Listing (AI text, channel, price, posted_at)
                                   ├──< Lead (enquiries per listing → feeds price suggestion)
                                   └──< Application (AI-extracted fields, status)
```

This same structure (Property → Unit → Lease → Tenant + work orders) is what tools like
Yardi are built on. That's our proof for Q2.

## 5. Phases

Each phase ends with a **simple explanation to you** of what was built.

| Phase | What | Output |
|---|---|---|
| **0. Setup** | Folders, Git, Docker Postgres, FastAPI + React skeletons | Both apps run locally |
| **1. Database + seed data** | Tables from the data model, 800 units + 12 months of turnovers | Realistic data in Postgres |
| **2. Backend API** | Endpoints: units, turnovers, move stage, Notice Autopilot, price suggestion, dashboard metrics | API docs at `/docs` |
| **3. Frontend core** | Turnover Board (drag & drop), Unit detail, Log Notice (autopilot), Dashboard, savings calculator | Usable app |
| **4. AI features** | Gemini listing writer + application reader + lead reply bot (needs your API key) | AI working end-to-end |
| **5. Polish** | Clean design, KO-style colours, loading states, sample applications, README | Looks professional |
| **6. Deploy** | Neon + Render + Vercel, live link | Public URL |
| **7. Submission** | 2-min demo video script, Q1 answer (<300 words), Q2 answer, bot section, final email draft | Ready to send |

### Rough timeline
- **Day 1 (Oct 23):** Phases 0–2
- **Day 2 (Oct 24):** Phases 3–4
- **Day 3 (Oct 25):** Phases 5–7, send email

## 6. How we measure success (also goes in the Q1 answer)
- **Main metric:** Average days vacant per turnover (move-out → move-in).
- **Supporting:** Days per stage, % of units pre-marketed before move-out,
  application-to-approval time, lost rent ($) per month.
- **Target:** Show that cutting e.g. 5 days across 800 units ≈ large yearly savings for owners.

## 7. Rules we follow
- Build everything from scratch — no copying Yardi code, design or private APIs.
- Social media automation only through **official APIs** (Meta Graph API / Messenger),
  no unofficial Marketplace bots.
- All data is fake; no real tenant info.
- Keep answers in the email short and plain, as Junny asked.

## 8. What I need from you
- **Gemini API key** (Phase 4).
- **GitHub account** to push the repo (Phase 6).
- Accounts on **Vercel, Render, Neon** (free) for deploy (Phase 6).
- Recording the demo video yourself (I'll write the script).
