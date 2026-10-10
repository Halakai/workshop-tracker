# Workshop Tracker

Mobile-first web app for our private car workshop: car flips, small jobs for friends, parts stock, the shared
workshop wallet and settling up between partners.

- **App:** https://halakai.github.io/workshop-tracker/ (install it with *Add to Home Screen*)
- **Design and decisions:** [docs/PLAN.md](docs/PLAN.md)
- **Stack:** Vite + React + TypeScript, Tailwind + shadcn/ui, TanStack Query, react-hook-form + zod, Supabase
  (Postgres + Auth + Edge Functions), GitHub Pages. Photos and receipts go to Google Drive (milestone 6).

## Status

| Milestone | What | State |
|---|---|---|
| M1 | Scaffold, sign-in, admin user management, CI + Pages deploy | in progress |
| M2 | Inventory and stock movements | |
| M3 | Cars and their costs | |
| M4 | Wallet, ledger and settling up | |
| M5 | Customer jobs and PDF invoices | |
| M6 | Google Drive uploads | |
| M7 | Dashboard, low-stock alerts, export, polish | |

## Things to know

- **The repo is public**, because GitHub Pages on a private repo needs a paid plan. The code contains no secrets, and
  the publishable key is meant to be public. Your data lives only in Supabase, protected by Row Level Security.
- **Supabase free plan:** a project pauses after about 7 days without activity. To restore it, click *Restore* in the
  dashboard (possible for 90 days). You can have only 2 active free projects.
- **No password-reset emails.** Supabase's built-in email only reaches your Supabase team, so the admin sets new
  passwords in the app: *More → Users & partners → (user) → Set a new password*.
- **Backups:** the free plan has no downloadable backups, so use the app's Export page regularly (milestone 7).

## Where the settings and secrets live

| Name | Where | Secret? | Used by |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (local) and the GitHub repo **variable** `SUPABASE_URL` | no | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` and the GitHub repo **variable** `SUPABASE_PUBLISHABLE_KEY` | no (it's meant to be public) | the app |
| `SUPABASE_DB_PASSWORD` | `.env.local` only, plus your password manager | **yes** | `npm run db:push` |
| Supabase secret key (`sb_secret_…`) | inside Supabase only; Edge Functions get it automatically | **yes** | Edge Functions |
| `GOOGLE_*`, `FILE_URL_SIGNING_SECRET` | Supabase → Edge Functions → Secrets (milestone 6) | **yes** | the `files` function |

Never commit `.env.local`, and never put a secret key into a `VITE_*` variable: everything in `VITE_*` ends up in
the browser.

## One-time setup

The labels below match the Supabase dashboard as of October 2026. They may move around a little.

### 1. Supabase CLI login (in the VS Code terminal)

```sh
npx supabase login
```

A browser window opens, and you confirm. The CLI then stores a token on your PC. With that I can create the
project, apply the database migrations and deploy the Edge Functions.

### 2. Supabase project

The project `workshop-tracker` is in region Central EU (Frankfurt), on the Free plan. Its database password is in
`.env.local`; copy it into your password manager too.

**Turn off public sign-up:** Supabase dashboard → your project → **Authentication** → **Sign In / Providers** → in
**User Signups**, turn **Allow new users to sign up** off → **Save changes**. (`supabase/config.toml` also has
`enable_signup = false`.) New accounts can then only be created by an admin in the app.

### 3. Your admin account (once)

1. Supabase dashboard → **Authentication** → **Users** → **Add user** → **Create new user**. Enter your email and a
   password, keep **Auto Confirm User** ticked, then click **Create user**.
2. **SQL Editor** → **New query**, paste this (with your email and name), then click **Run**:

   ```sql
   select app.bootstrap_admin('you@example.com', 'David');
   ```

   This works only while no admin exists. It makes you admin with a 100 % profit share.
3. Open the app and sign in. Then go to **More → Users & partners → Add** to create your friend's account, and
   **Edit** the profit shares (e.g. 50 / 50).

### 4. GitHub

The workflow `.github/workflows/ci.yml` does the following on every push:
- typecheck, unit tests and build;
- the RLS and permission tests against a throwaway local Supabase;
- on `main` only, and only if everything passed: deploy to GitHub Pages.

The setup it needs:
- **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- **Settings → Secrets and variables → Actions → Variables** tab: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

## Local development

```sh
npm install
cp .env.example .env.local   # fill in URL and publishable key
npm run dev                  # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm test                     # unit tests for all money and stock math
```

### Database changes

All schema changes are SQL migrations in `supabase/migrations`, never made by clicking in the dashboard.

```sh
# create supabase/migrations/<timestamp>_<name>.sql, then:
npm run db:push              # apply new migrations to the linked project
npm run db:types             # regenerate src/lib/database.types.ts
npm run functions:deploy     # deploy Edge Functions (no Docker needed)
```

CI checks that `src/lib/database.types.ts` matches the migrations.

### Tests

- `npm test` runs the unit tests (Vitest) for everything in `src/domain/`: money parsing and formatting, profit-share
  splits, dates, and later average cost, totals and settlement.
- `npm run test:rls` runs the permission tests in `supabase/tests/` against a **local** Supabase. They refuse to run
  against anything else. They need Docker, so they normally run in GitHub Actions.

## Security model (short)

- RLS is on for every table, and the signed-out role (`anon`) has no privileges at all.
- A signed-in user sees data only with an **active** profile in this app (`app.is_member()`).
- Members can't change roles, shares or settings. Admin actions go through the `admin-users` Edge Function, which
  checks that the caller is an active admin before using the secret key.
- `created_by` and `updated_by` are set by the database from the user's token, so they can't be faked.
