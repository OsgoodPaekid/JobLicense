# License Job Record-Keeping & Tracking App

A simple explanation first: this is one project (one install, one lockfile) made of two parts that talk to each other:

- **backend** – a small program that talks to your database and hands out data as an API (a set of URLs your frontend calls). This is what does the math (outstanding balance, payment status, etc.) and stores everything.
- **frontend** – the website you actually click around in: Dashboard, Jobs, Clients, Middlemen, Payments, Reports, Settings.

It's set up as an **npm workspace**: the root `package.json` lists both `backend` and `frontend` as workspaces, so `npm install` at the top level installs both of their dependencies into one shared `node_modules`, and one `npm run dev` starts both. You still edit backend code in `backend/` and frontend code in `frontend/` — they're just no longer two separate projects you have to install and wire together yourself.

Both need to run at the same time (dev does this for you). The database lives on **Neon** (a hosted Postgres service) — you don't install a database yourself.

## 1. Create your Neon database

1. Go to https://neon.tech, sign up / log in, and create a new project.
2. Once created, open the project and copy the **connection string** shown on the dashboard. It looks like:
   `postgres://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`

## 2. Install everything

From the **top-level** `joblicense-app` folder (not inside backend or frontend):

```bash
npm install
```

That's it — one command. It installs the backend's dependencies, the frontend's dependencies, and a small helper (`concurrently`) that lets one command run both apps together, all into one shared `node_modules`.

## 3. Connect to your database

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and paste your Neon connection string into `DATABASE_URL`. Then, from the top-level folder, create all the tables in your Neon database (only needs to be run once):

```bash
npm run migrate
```

## 4. Run it

From the top-level `joblicense-app` folder:

```bash
npm run dev
```

This starts the backend and frontend together in one terminal, with `[backend]` and `[frontend]` labels on each line so you can tell which is which. The frontend will print a local address, usually `http://localhost:5173` — open that in your browser. Press `Ctrl+C` once to stop both.

(If you ever want to run them separately instead — e.g. to watch one's logs on its own — you still can: `npm run dev --prefix backend` or `npm run dev --prefix frontend`.)

## 4. Using the app

- **Middlemen** page: add the people/agencies who refer clients to you first (optional — a client can also have no referrer).
- **Clients** page: add clients, optionally linking them to the middleman who brought them.
- **Jobs** page: create a job for a client, set the total amount owed. Open a job to move it through stages, record payments, and see its full history.
- **Dashboard**: overview numbers and charts, calculated automatically from your data.
- **Reports**: download CSV files of jobs, payments, or middleman referral totals, optionally filtered by date.
- **Settings**: add or remove job stages (the steps a job can move through).

Everything money-related (outstanding balance, "Unpaid / Partially Paid / Fully Paid") is calculated automatically every time you add or delete a payment — you never enter it by hand.

## 5. Putting it online (optional, later)

When you're ready for others (or your phone) to reach it without your computer being on:
- The **backend** can be deployed to something like Render, Railway, or Fly.io (set `DATABASE_URL` there to the same Neon string).
- The **frontend** can be deployed to Vercel or Netlify (set `VITE_API_URL` to your deployed backend's address, e.g. `https://your-backend.onrender.com/api`).

## Project structure

```
package.json                 <- root: "npm run dev" starts backend + frontend together
backend/
  migrations/001_init.sql   <- the database structure (tables + the view that does the money math)
  src/
    db/                     <- database connection + migration runner
    routes/                 <- one file per section of the app (jobs, clients, middlemen, payments, dashboard, reports, stages)
    index.js                <- starts the server
frontend/
  src/
    pages/                  <- one file per page (Dashboard, Jobs, Clients, Middlemen, Payments, Reports, Settings)
    components/             <- small reusable pieces (sidebar, status badges, stat displays, form fields)
    index.css               <- the design system: colors, fonts, spacing tokens
    api.js                  <- where the frontend talks to the backend
```

## Look and feel

The design leans into what this app actually is — a registry/ledger, not a generic SaaS dashboard: ink-navy and brass instead of default blue/purple, a serif (Newsreader) for headings and money figures, IBM Plex Sans for everything else, IBM Plex Mono for job numbers and stage labels, and hairline dividers instead of a stack of identical shadowed cards. All of it lives in `frontend/src/index.css` as a small set of named color and font variables — change the values there and the whole app updates.

## Notes on what's built vs. what's a "nice to have" for later

Built and working: job records, customizable stages with full history, multi-payment tracking with automatic balance math, middleman → client → job linking with middleman profiles and rollups, dashboard with charts, search/filters, job detail page, CSV reports, settings for stages, and the "stuck jobs / overdue / unpaid / not started" alert list (available at the `/api/jobs/alerts/list` endpoint — wiring it into a bell icon in the UI is a quick next step).

Not built yet, since they need a decision from you first: login/password protection (right now, anyone with the link can use the app — fine for personal/local use, but worth adding before putting it on the public internet), and automated reminder emails/SMS (the alert *data* exists, sending notifications would need an email or SMS service connected).
