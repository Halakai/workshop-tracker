# Workshop Tracker

Mobile-first web app for our private car workshop: car flips, small jobs for friends, the parts inventory, the
shared workshop wallet and settling up between partners.

- **App:** https://halakai.github.io/workshop-tracker/ (install it with *Add to Home Screen*)
- **Design and decisions:** [docs/PLAN.md](docs/PLAN.md)
- **Stack:** Vite + React + TypeScript, Tailwind + shadcn/ui, TanStack Query, react-hook-form + zod, Supabase
  (Postgres + Auth + Edge Functions), GitHub Pages. Photos and receipts go to Google Drive.

## Status

| Milestone | What | State |
|---|---|---|
| M1 | Scaffold, sign-in, admin user management, CI + Pages deploy | ✅ done |
| M2 | Inventory and stock movements | ✅ done |
| M3 | Cars and their costs | ✅ done |
| M4 | Wallet, ledger and settling up | ✅ done |
| M5 | Customer jobs and PDF invoices | ✅ done |
| M6 | Google Drive uploads | ✅ done |
| M7 | Dashboard, low-stock alerts, export, polish | ✅ done |
| R1 | After testing: dashboard with charts, search, Inventory rename, back button, restoring backups, car catalogue with logos | ✅ done |
| R2 | Tools & equipment we own (Inventory → Tools) | ✅ done |
| R3 | Photo gallery on cars, albums (Before/After), favorite photos for tools and parts, invoice links | ✅ done |

## The app at a glance

- **Home** is a dashboard:
  - a **search** bar for everything (see below);
  - quick actions: *Expense, Use part, Buy part, New car, New job*;
  - the wallet and each partner's balance;
  - tiles: inventory value (and what's running low), money in unsold cars, money still to collect from finished jobs,
    and this year's profit (cars sold and jobs paid this year);
  - **Money in & out**: a bar chart per month (6 or 12 months; tap a month) and what the money went on and came
    from, for a month, the year or the last 12 months. Moves between the wallet and partners aren't counted;
  - **recently opened** cars, jobs, items and tools (remembered on each phone);
  - cars in progress, open and unpaid jobs, low stock, tools lent out or needing repair, and recent activity (who
    did what, when).
- **Search** finds cars (make, model, plate, VIN, car ID), jobs (customer, work, plate, invoice number), inventory
  (name, part number, brand, shelf), tools (name, tool ID, brand, serial number, who has it), contacts (name, phone)
  and money entries (description, who, amount). Case, accents and spaces or dashes in plates and IDs don't matter:
  `zg123ab` finds `ZG 123-AB`.
- **Bottom bar:** Home · Inventory (red badge = items to buy) · Cars · Jobs · More.
- **Back arrows** go back to wherever you came from.
- **More:**
  - Money and Partners;
  - Contacts (sellers, buyers, customers, with tap-to-call);
  - Lists (car makes & models, categories, units, brands, cost types, tool categories);
  - My account;
  - admin only: Users & partners, Workshop settings (invoice header, Google Drive test), Backup & restore.

## How the inventory works (short)

- Every item's quantity changes **only** through movements: **Buy**, **Use**, **Adjust** (and, from M3/M5, use
  on a car or job and return to stock). Each movement records who added it and when.
- **Adjust** has four modes:
  - **Count:** enter what's on the shelf; the difference is booked. On an empty item this is "Opening stock".
  - **Damaged** and **Lost:** enter how much; it's taken out.
  - **Found:** enter how much; it's added.
- Stock is valued at the **moving weighted average** cost. "Used 4.5 L of oil" costs 4.5 × the average price per
  litre, and when an item runs out, its remaining value goes with the last use, so rounding never adds up.
- **Buy** records who paid (the wallet or a partner) as an expense in the ledger.
- **Use in the workshop** (overhead, e.g. brake cleaner or gloves) and **Adjust** corrections are split between
  the partners by their default profit shares.
- **Undo** works on an item's latest movement and restores exactly the previous state, including the payment.
  Correct older mistakes with **Adjust**.
- An item shows up on the **shopping list** and in the red badge when it is at or below its minimum.

### Part numbers, categories, units, brands

- **Part number** = the item's unique ID: category code + brand code + number, e.g. `FLD-CAST-001`. It is
  filled in automatically and can be edited. Uniqueness ignores upper/lower case. The maker's own number goes in
  **Manufacturer ref**.
- **Categories, units and brands** are lists (More → Lists). Everyone can add entries there.
  New categories and units are added only on that page. A new **brand** can also be typed straight into an item.
  Only an admin can rename or delete entries, and an entry that is still used can't be deleted. Brand names are
  case-sensitive.

### Tools & equipment

Inventory has two tabs: **Parts & supplies** (the stock above) and **Tools**, for the things we own and don't use
up: hand and power tools, the compressor, lifts, the scanner…

- Each tool gets a **tool ID** (`T-001`, filled in automatically, editable, unique), a **category** (a list under
  More → Lists, added only there), brand (the same brands list as parts) and model, serial number, how many, and
  where it's kept (type-ahead from the places already used).
- **Belongs to:** the workshop, or a partner (their own tool kept in the workshop stays theirs).
- **Lend** records who has it and since when; **Back** when it returns. **Condition:** works, needs repair or broken.
  **Gone** (sold, lost, stolen, thrown away, given away) takes it off the list but keeps it on record, with
  "We have it again" to undo. All of this shows in the tool's history and in recent activity.
- **Purchase:** date, price, shop and warranty end. For a workshop tool, "Bought with workshop money" puts the price
  into **Money** as a workshop expense (cost type *Tools*, split by default profit shares, paid by the wallet or a
  partner). Changing the price, date or shop later updates that entry. "Take out of Money" on the tool's page
  deletes it again, and so does deleting the entry in Money. Older tools can be added without touching Money.
- Photos and receipts, warranty cards or manuals (PDF too) go into Google Drive: `Workshop Tracker/Tools/T-001 …`.
- The list filters by lent out, needing repair, owner, category and "no longer have", and shows what the tools on
  screen cost together.

## How cars work (short)

- **New car:** make, model, generation and engine (suggested from the car catalogue, see below), year, plate, VIN,
  fuel, mileage, colour, and a car ID that's filled in automatically (`CAR-001`) and can be changed. With it go the
  **purchase price, who paid and the seller**. Sellers and buyers are saved as **contacts** (name and phone) and
  suggested next time.
- **Costs on a car:**
  - **From stock:** parts and consumables at the average cost, also possible from an item's **Use** button.
  - **Part bought:** for this car only; it never enters stock.
  - **Other cost:** registration, inspection, towing, ads, insurance… The cost types are a list (More → Lists).
  - Every entry records who paid and who added it.
- **Return:** a part taken off a car unused goes back to stock at exactly what the car was charged.
- **Status:** Bought → In repair → Ready for sale → Listed (asking price and ad link) → Sold (or Scrapped).
  **Sell** records the price, who got the money, the buyer and the mileage.
- The car page shows **total invested** live. Once the car is sold it also shows **profit, margin and ROI**. The car
  list filters by status and sorts by newest, invested or profit.
- Each car has its own **profit shares**, copied from the defaults. Change them per car, e.g. "All to Ivan".

## Money (short)

- **Wallet** (More → Money): the balance is always calculated from the entries. The buttons:
  - **Put in:** a partner puts money into the wallet.
  - **Take out:** a partner takes money out.
  - **Transfer:** e.g. the wallet pays a partner back.
  - **Expense:** a workshop cost not tied to a car, e.g. tools or electricity.
  - **Income:** e.g. scrap metal sold.
- **Expense** and **Income** are split between partners by their default profit shares.
- **Partners** (More → Partners): for each partner, **put in** (deposits, things they paid), **taken out**
  (withdrawals, money they received), **profit share**, and the **balance** = what the workshop owes them. Their
  page lists every entry and every profit share, with where it came from.
- **Settle up** a sold or scrapped car (button on the car):
  1. The app shows who paid what (parts from stock count as the wallet) and who holds the sale money.
  2. It splits the profit or loss by the car's shares and adds it to each partner's balance.
  3. Choose **Keep profit in wallet** (default) or **Pay out profit**, and whether to pay back out-of-pocket costs.
  4. It suggests the fewest transfers ("Ivan → Wallet 1 800.00€"); untick any you'll handle differently.
  5. **Record settlement** writes it all and locks the car's money. **Undo settlement** unlocks it again.

## Jobs for friends (short)

- **New job:** the customer comes from contacts (type-ahead; a new name is added), with their car (make, model,
  generation, year, engine, plate, VIN; suggested like on a new car). When a customer is picked, their earlier cars
  are offered as one-tap chips. The work description, a fixed **labor price**, and an automatic job ID (`JOB-001`).
- **Lines the customer pays for:**
  - **From stock:** at the average cost.
  - **Part bought:** for this job, with who paid.
  - **Other:** e.g. diagnostics or a disposal fee.
  - Each line has its own **price for the customer**. Leave it empty to charge cost, or tap *+10 %*, *+20 %*…
  - A stock line can be taken off the job, and the parts go back to stock.
- **Status:** Open → Done → Paid. **Customer paid** records the amount and who got the money. When the total is
  covered, the job becomes Paid automatically.
- **Invoice (PDF):**
  - The first time, it gets the next number (`2026-001`, gapless per year).
  - It is made on the phone and saved in Google Drive. Then: **Send link** / **Copy link** gives the customer a link
    that opens the PDF without an account (valid for a year; making the invoice again keeps the link and shows the
    new version), or **Send PDF file** / **Download** for the file itself. **Link for the customer** on the job
    gets the link again later.
  - It uses the workshop name, logo, contact, IBAN and footer from **More → Workshop settings** (admin).
  - No VAT.
- **Settle up** a paid job like a car: profit = payments − parts. A job can belong to one person: set the shares to
  "All to Ivan".
- **Photos and receipts:**
  - **Take photo** opens the camera; **Choose photos** / **Choose file** picks photos (several at once) or a PDF.
  - They can be added to cars (photos, papers and receipts), jobs (photos), tools and parts (photos), stock
    purchases (📎 on the purchase), and car costs, job parts and workshop expenses (open the entry).
  - A car's page starts with its photos, like a marketplace ad: swipe through them, tap one for full screen (swipe
    there too). Tools and parts with photos start the same way.
  - **Albums** (cars and jobs): pick *Before*, *After* or another album above the photos to see only those; new
    photos go into the album picked. **+ Album** adds one (a shared list; admins rename or delete under More →
    Lists). In full screen, a photo can be moved to another album.
  - **Favorite photo:** in full screen, *Make favorite* (★). It is shown first, and as the picture in the tools and
    parts lists. Without one, the first photo is used.
  - Every invoice PDF is also copied to Drive.

## Car makes and models (catalogue)

- The car and job forms suggest **makes** (with their logo), **models**, **generations** (e.g. Golf *IV (1J)*,
  1997–2003; the ones made in the year you typed come first) and **engines** (e.g. *1.9 TDI 77 kW (105 HP)*, with
  fuel; picking one fills in the fuel).
- It starts with 62 makes, 583 models, about 1 000 generations and 6 700 engines, focused on cars sold in Europe since
  about 1990. Anything new you type on a form is added when you save, so the list grows with your cars. A typed name
  that matches an entry is saved in the catalogue's spelling (`skoda` → `Škoda`).
- **More → Lists → Car makes & models** shows it all. Everyone can add; only an admin can rename or delete.
- **Where the data comes from:** the starting list was written for this app from general knowledge of the
  European market (power in kW and HP as the makers quote it). It was not copied from a specifications website (sites
  like ultimatespecs.com don't allow that). It can have gaps or mistakes: the car's registration papers (field P.2,
  kW) are the reference, and an admin can correct any entry in the app. The source is `data/car-catalog/*.txt`; to
  add a lot at once, edit those files and run `npm run catalog -- supabase/migrations/<timestamp>_car_catalog_more.sql`
  (entries that already exist are skipped).
- **Logos** are public-domain or CC0 files from Wikimedia Commons and Simple Icons, listed with their sources in
  [data/car-catalog/LOGOS.md](data/car-catalog/LOGOS.md). Makes without a free logo (and makes you add) show their
  initials.

## Things to know

- **The repo is public**, because GitHub Pages on a private repo needs a paid plan. The code contains no secrets, and
  the publishable key is meant to be public. Your data lives only in Supabase, protected by Row Level Security.
- **Supabase free plan:** a project pauses after about 7 days without activity. To restore it, click *Restore* in the
  dashboard (possible for 90 days). You can have only 2 active free projects.
- **No password-reset emails.** Supabase's built-in email only reaches your Supabase team, so the admin sets new
  passwords in the app: *More → Users & partners → (user) → Set a new password*.
- **Backups:** the free plan has no downloadable backups. Use **More → Backup & restore** (admin) now and then:
  - **Backup file (JSON)** is everything in one file. Keep it somewhere safe, e.g. in Google Drive.
  - **CSV ZIP** is one file per table, for Excel. It can't be restored.
  - Home reminds the admin when the last backup is more than 30 days old.
  - Photos and receipts are already safe in Google Drive.
- **Restoring a backup** (More → Backup & restore → *Choose backup file*) replaces everything in the app with the
  file's contents: inventory, cars, jobs, money, contacts, lists, settings and history. Users, passwords and profit
  shares are not touched.
  - Before it starts, the app downloads a copy of the current data, so a wrong file can be undone by restoring that.
  - People in the backup are matched to today's users by account, email or name; check the matches before you
    confirm. This also works in a brand-new Supabase project: create the users first (step 3 below), then restore.
  - It's all or nothing: if anything fails, nothing changes.
- **Keep-alive:** `.github/workflows/keepalive.yml` pings the database every 3 days, so the free project doesn't pause
  while you're on holiday. If GitHub switches it off after 60 days without commits, re-enable it under
  **Actions → Keep Supabase awake → Enable workflow**.

## Where the settings and secrets live

| Name | Where | Secret? | Used by |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (local) and the GitHub repo **variable** `SUPABASE_URL` | no | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` and the GitHub repo **variable** `SUPABASE_PUBLISHABLE_KEY` | no (it's meant to be public) | the app |
| `SUPABASE_DB_PASSWORD` | `.env.local` only, plus your password manager | **yes** | `npm run db:push` |
| Supabase secret key (`sb_secret_…`) | inside Supabase only; Edge Functions get it automatically | **yes** | Edge Functions |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Supabase → Edge Functions → Secrets (see *Google Drive*) | **yes** | the `files` function |
| `FILE_URL_SIGNING_SECRET` | Supabase → Edge Functions → Secrets (already set, random) | **yes** | signs the view links |

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

### 5. Google Drive (photos, receipts, invoice copies)

**How it works:**
- Files go to **your** Google Drive, into a folder **Workshop Tracker** that the app creates. That includes files your
  partner uploads.
  - Cars: `Cars/<year make model plate (CAR-001)>/Photos` and `/Receipts`
  - Jobs: `Jobs/<year>/<JOB-001 customer plate>`
  - Invoices: `Invoices/<year>`
  - Tools: `Tools/<T-001 name>`; parts and supplies: `Inventory/<part number name>`
  - Other receipts: `Receipts/<year>`
  - Small previews of every photo (so photo grids and lists load fast): `.thumbs`
- The database stores only which file belongs to which record. The Supabase Edge Function `files` talks to Google
  using a refresh token for your account.

**Gotchas, and how the app handles them:**
- **Service accounts can't be used.** They have no storage quota in a personal Drive, so the app acts as you
  (OAuth).
- **"Testing" apps lose their token after 7 days.** The steps below publish the OAuth app to "In production". The
  scope `drive.file` is *non-sensitive*, so no Google review is needed.
- **`drive.file`** lets the app see only the files it created. Don't make the "Workshop Tracker" folder yourself.
  Moving or renaming files in Drive is fine, because the app keeps file IDs.
- **Edge Functions have request limits.** Photos are shrunk on the phone (max 2000 px, JPEG ~80 %) and get a 320 px
  preview. PDFs can be up to 9 MB.
- **The files are private.** The app shows them through signed links from the function, valid until the end of
  tomorrow. Viewing counts towards Supabase's free 5 GB/month egress, which is why the previews are small.
- **The token can stop working:** if it goes unused for 6 months, if you revoke the app in your Google account, or
  if more than 100 tokens are made for one client. Uploads then show *"Google Drive is disconnected"*, and
  everything else keeps working. Make a new token with step 6 and replace `GOOGLE_REFRESH_TOKEN`.

**One-time setup (about 10 minutes):**

1. Open https://console.cloud.google.com.
   1. Project picker (top left) → **New project** → name it `workshop-tracker` → **Create**, then select it.
   2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
2. Set up the consent screen: **APIs & Services → OAuth consent screen** (it opens **Google Auth Platform**)
   → **Get started**.
   1. App name `Workshop Tracker`, and your Gmail as the support email.
   2. Audience **External**.
   3. Your email as the contact → agree → **Create**.
3. **Data access** → **Add or remove scopes** → filter `drive.file` → tick
   `https://www.googleapis.com/auth/drive.file` → **Update** → **Save**.
4. **Audience** → **Publish app** → confirm. The status becomes **In production**.
5. Create the client:
   1. **Clients** → **Create client** → type **Web application**, name `Workshop Tracker Drive`.
   2. Under **Authorized redirect URIs** → **Add URI** → `https://developers.google.com/oauthplayground` → **Create**.
   3. Copy the **Client ID** and **Client secret** into your password manager.
6. Get the refresh token from the playground:
   1. Open https://developers.google.com/oauthplayground.
   2. ⚙ (top right) → tick **Use your own OAuth credentials** → paste the client ID and secret → close the panel.
   3. In **Input your own scopes**, type `https://www.googleapis.com/auth/drive.file` → **Authorize APIs**.
   4. Pick your Google account. If Google says the app isn't verified: **Advanced → Go to Workshop Tracker** →
      **Continue / Allow**.
   5. **Exchange authorization code for tokens** → copy the **Refresh token**.
7. Supabase dashboard → project `workshop-tracker` → **Edge Functions** → **Secrets** → add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`

   (`FILE_URL_SIGNING_SECRET` is already set.)
8. In the app: **More → Workshop settings → Test Drive connection** should say *Connected*.

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
- Stock and money rows can only be written through a few database functions (`post_stock_movement`,
  `undo_stock_movement`, …). They run with elevated rights on purpose, check membership first and validate every
  number. Supabase's advisor lists them as a warning; that is expected.
