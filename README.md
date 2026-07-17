# Team Work Tracker

A single-owner work tracker: a dashboard (counts + charts), a filterable/
sortable table of items, a side-panel activity history, and a Settings panel
for the editable Type/Function/Priority/Status dropdown lists. One person
(the team leader) edits; anyone with the link can view read-only.

**Stack:** Vite + React (frontend) · Vercel serverless functions (`/api`) ·
Neon Postgres (`pg` driver) · no ORM, plain versioned SQL migrations.

## Architecture

```
src/            React app (Vite). Talks only to /api/* — never touches Postgres directly.
api/            Vercel serverless functions. Each file/folder = one route:
  _db.js          shared pg Pool (reads DATABASE_URL)
  _auth.js        editor-password check for write routes
  _itemLogic.js   history logging + recurring-item rollover (server-authoritative)
  items.js        GET  /api/items         POST /api/items         DELETE /api/items?sample=true
  items/[id].js   PATCH/DELETE /api/items/:id
  items/seed.js   POST /api/items/seed    (no-op unless the table is empty)
  config.js       GET/PATCH /api/config   (dropdown lists, columns, thresholds)
migrations/     Numbered SQL files, applied in order by scripts/migrate.mjs
```

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in a `DATABASE_URL` (see below) and
   an `EDITOR_PASSWORD`.
3. `npm run migrate` — applies `migrations/*.sql` against `DATABASE_URL`,
   tracking what's already run in a `_migrations` table (safe to re-run).
4. `vercel dev` (recommended — serves the Vite app *and* `/api/*` together,
   exactly like production) or `npm run dev` (Vite only; `/api/*` calls will
   404 unless you also run something to serve them).

## Setting up Neon

1. Create a project at [neon.tech](https://neon.tech) (free tier is fine).
2. In the project dashboard, open **Connection Details** and copy the
   **pooled** connection string (hostname contains `-pooler`) — that's what
   `DATABASE_URL` should be, both locally and on Vercel. The pooled string
   plays nicely with serverless functions opening many short-lived
   connections; the direct string is only better for long-running scripts.
3. Run `npm run migrate` once (from your machine, using the connection
   string) to create the schema. Vercel does not run migrations for you —
   this is a deliberate one-time step, same as any real migration tool.

## Deploying to Vercel

This repo needs no Netlify-specific config removed — it never had any; it
was built directly against Vercel's conventions (`vercel.json`,
`/api` serverless functions, Vite's `dist/` output).

1. Import this repository in the Vercel dashboard ("Add New Project").
   Framework preset should auto-detect as Vite; `vercel.json` pins the
   build command (`npm run build`) and output directory (`dist`) explicitly
   either way.
2. **Environment variables to set in the Vercel dashboard** (Project
   Settings → Environment Variables) before the first deploy:

   | Name | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | your Neon **pooled** connection string | Used by every `/api/*` function. |
   | `EDITOR_PASSWORD` | a password of your choosing | Gates Add/Edit/Delete — see "Access control" below. Changing it later just needs a redeploy (or Vercel env var update + redeploy), no code change. |

3. Deploy. On first load with an empty database, the app calls
   `/api/items/seed` once automatically to insert 6 sample rows — clear them
   from Settings → Data whenever you're ready to use it for real.

No other manual dashboard steps are required — there's no Vercel KV, no
Vercel Postgres, no Netlify Functions/redirects to migrate away from.

## Access control

You're the only real editor; anyone with the link can view. There's no per-
user login — instead, `EDITOR_PASSWORD` gates every write endpoint
server-side (`api/_auth.js`), and the browser prompts for it once (top-right
"View only" → "Editing unlocked") and remembers it for that browser tab via
`sessionStorage`.

**This is a soft lock, not real auth.** Anyone who learns the password can
edit from any browser; there's no concept of "who" made a change beyond
what they type into Owner/Raised By. That's an intentional trade-off for a
small internal tool with one real editor — if this ever needs real
authentication (e.g. sharing the editor role with a second person, or
wanting an audit trail of *who* changed what), swap `api/_auth.js` for
something like Vercel's own auth integrations or a lightweight session
system; nothing else in the app needs to change since every write already
funnels through the same handful of API routes.

## Extending the data model

- **New item field:** add a column in a new `migrations/000N_*.sql` file,
  map it in `api/_itemLogic.js` (`rowToItem` / `WRITABLE_ITEM_COLUMNS`), add
  it to the relevant form in `src/components/ItemFormModal.jsx` or
  `Panel.jsx`, and to `COLUMN_DEFS` in `src/lib/constants.js` if it should
  be a table column.
- **New dropdown list / status / priority:** these are already fully
  data-driven (`tracker_config.lists`), editable from Settings → Manage
  Lists — no code change needed.
- **New risk rule or threshold:** `api/_itemLogic.js` and
  `src/lib/datamodel.js` both have the rules (kept in sync manually — the
  server copy is authoritative for writes, the client copy is for display).
