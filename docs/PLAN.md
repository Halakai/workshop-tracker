# Workshop Tracker: plan

Status: **approved 10.10.2026, M1–M7 built and deployed; changes after testing done (R1–R3)**.
Your answers are recorded in §9 and worked into the sections below. Changes made along the way:
- categories, units and brands became editable lists;
- part numbers became unique auto-generated IDs;
- Adjust replaced Count, with Damaged, Lost and Found;
- contacts are shared by sellers, buyers and customers;
- cost types became a list.

R1 (after the first test round, 10.10.2026):
- Home became a dashboard (figures, money in/out chart, recently opened) with one search for everything;
- Stock was renamed Inventory; back arrows return to the previous page;
- backups can be restored (`admin_restore()`, all or nothing; people are matched to today's users);
- a car catalogue (makes with logos, models, generations, engines) feeds type-ahead on the car and job forms and
  grows with what is typed; customers' cars gained generation, year and engine.

R2 (10.10.2026):
- tools & equipment (Inventory → Tools): tool IDs `T-001`, categories list, owner (workshop or a partner), place,
  condition, lending, "gone" (kept on record), purchase and warranty, photos and receipts in Drive; a workshop
  tool's purchase can go into Money as a workshop expense (`save_tool_payment()`, cost type Tools).

R3 (10.10.2026):
- car pages start with a swipeable photo gallery and a full-screen viewer; photo albums (a shared list, Before and
  After to start) on cars and jobs; a cover photo per record (`set_cover_photo()`), shown in the tools and parts
  lists; parts and supplies can have photos;
- invoices get a link for the customer: the `files` function signs `/files/invoice/<job>` for a year and always
  serves the job's latest invoice copy from Drive.

---

## 0. Things that could cause trouble (read first)

| # | Issue | What I'll do about it |
|---|-------|------------------------|
| 1 | **GitHub Pages on a private repo needs a paid plan** (GitHub Pro or higher). | I recommend a **public** repo, the same as `troskovi`. The code holds no secrets, the publishable key is meant to be public, and your data lives only in Supabase behind RLS. |
| 2 | **Supabase free plan pauses a project after about 7 days of low activity.** You can restore it from the dashboard within 90 days. You also get only **2 active free projects**, and `troskovi` plus this app would use both. | Optional GitHub Actions "keep-alive" job that runs a tiny query every 3 days. Caveat: GitHub disables scheduled workflows in a repo with no commits for 60 days. The app will remind you. |
| 3 | **No downloadable backups on the free plan.** | An admin **Export** page that downloads all tables as JSON plus a ZIP of CSVs, and a dashboard reminder if the last export is older than 30 days. |
| 4 | **Supabase is retiring the legacy `anon` / `service_role` keys by the end of 2026.** | We use the new **publishable** (`sb_publishable_…`) and **secret** (`sb_secret_…`) keys from day one. |
| 5 | **Supabase's built-in email only delivers to your Supabase team members**, so "forgot password" emails won't reach your friend. | The admin sets a temporary password in the app, and every user can change their own password on the Account page. Custom SMTP can be added later. |
| 6 | **Sharing a Supabase project with `troskovi`:** auth users and the "allow sign-ups" switch are project-wide. Turning sign-ups off here would turn them off for `troskovi` too, and `troskovi` users could sign in to this app (RLS would show them nothing). | I recommend a **new project**. If you prefer the existing one, everything goes into a separate `workshop` schema and access is granted only through this app's `profiles` table. |
| 7 | **The Google refresh token can stop working**: if the OAuth app stays in "Testing" (7-day expiry), if it goes unused for 6 months, if you revoke access in your Google account, or if more than 100 tokens are issued for the same client. | We publish the OAuth app to "In production" (see §6). The app shows a clear "Google Drive disconnected" message, and the README has the 5-minute re-connect steps. Everything except uploads keeps working while Drive is disconnected. |
| 8 | **Photos are private, so they are served through the Edge Function.** That counts toward Supabase egress (5 GB/month free) and function calls (500k/month free). | Small thumbnails are generated in the browser. The full-size image is only loaded when you open it, and the browser caches it. |
| 9 | **The app only works online in v1.** | Confirmed OK: the workshop has good internet. IDs are still generated on the client, so retries are safe and an offline queue stays possible later. |

Sources: Google OAuth refresh-token rules (developers.google.com/identity/protocols/oauth2), Drive scope classification, where `drive.file` is **non-sensitive** (developers.google.com/workspace/drive/api/guides/api-specific-auth), Supabase API keys and Edge Function limits (supabase.com/docs).

---

## 1. Stack

The stack you suggested, with a few additions (reasons given):

- **Vite + React 19 + TypeScript**, **Tailwind v4 + shadcn/ui**, **TanStack Query v5**, **react-hook-form + zod**, **supabase-js v2**: as you suggested.
- **React Router with `HashRouter`**: URLs look like `…github.io/workshop-tracker/#/cars/…`. Deep links and refreshes always work on Pages, with none of the quirks of the 404.html trick. We only use password login, so Supabase's own `#access_token` redirects never collide with the routes.
- **vite-plugin-pwa**: "Add to Home Screen" so the app opens full-screen like a native app, the same as `troskovi`.
- **@react-pdf/renderer** (only loaded on the invoice screen) for PDF invoices.
- **JSZip** for the CSV backup export.
- **Supabase CLI** as an npm dev dependency, so nothing needs a global install. Edge Functions deploy with `--use-api`, so **you don't need Docker locally**.
- **Vitest** for unit tests. The **RLS integration tests run in GitHub Actions** against a throwaway local Supabase stack (CI runners have Docker).

---

## 2. Number and money rules

- **Money:** `bigint` **cents** in the database and integer cents in TypeScript (`type Cents = number`). Never floats.
- **Quantities:** `numeric(12,3)` in the database (4.5 L, 0.25 kg). In code they are converted to integer **thousandths** before any math.
- **Shares:** integer **basis points** (5000 = 50.00 %). Splits use the largest-remainder method, so the cents always add up exactly.
- **Display:** money as `1 234.56€` (non-breaking space between thousands, dot for decimals), dates as `DD.MM.YYYY`, distances in km, volumes in L.
- **Input:** number fields accept both `12,50` and `12.50` and open the decimal keypad on phones.

### Stock valuation: moving weighted average *(recommended)*
Each item keeps two cached numbers that only the database function may change: **qty on hand** and **stock value (cents)**. They always equal the sums of the item's movements.

| Movement | qty | value |
|---|---|---|
| Purchase | `+q` | `+total cost` |
| Use (car / job / workshop overhead) | `−q` | `−round(value × q / qty)`. If you use up the whole stock, it takes exactly the remaining value, so no rounding crumbs are left behind |
| Adjustment down | `−q` | same as use (the value lost is booked as overhead) |
| Adjustment up | `+q` | at the current average cost, or at a unit cost you enter if stock was 0 |
| Return to stock | `+q` | at the average cost **that car or job was actually charged** for the item, so returning reverses the car's cost exactly. You can't return more than was used there |

Rules: stock can't go negative ("only 2 in stock: record a purchase or count adjustment first"). Movements are **immutable**: you can **undo the latest movement** of an item (which restores the exact previous state), and older mistakes are fixed with an adjustment. Descriptive fields (note, supplier, date) stay editable.

I chose this over FIFO because FIFO needs lot tracking, and for a hobby workshop the difference in cost is cents.

**Where the math lives:** pure TypeScript functions in `src/domain/` cover all money and stock math, with Vitest tests. The browser computes the movement and sends it to a database function `post_stock_movement(…, expected_version)`. That function locks the item row, checks nobody changed it in the meantime (optimistic concurrency, with an automatic retry if they did), and enforces the invariants (`qty ≥ 0`, `value ≥ 0`, `value = 0 when qty = 0`).

---

## 3. Database schema

Every table has `created_by`, `created_at`, `updated_by` and `updated_at`. A trigger fills them from `auth.uid()` / `now()`, so they can't be faked. The UI shows "added by David, 12.03.2026".

### Users, partners, settings
| Table | Key columns |
|---|---|
| `profiles` | `id` (= `auth.users.id`), `display_name`, `email`, `role` (admin / member), `is_active`, `default_share_bp`. **Every user is a partner.** Supports any number of partners. |
| `accounts` | `id`, `kind` (wallet / partner / external), `partner_id` (unique, null for wallet and external). One **Wallet** row, one **External** row, and one row per partner (created automatically). |
| `settings` | Single row: workshop name, address, phone, email, IBAN (optional), logo (stored as a small, resized data URL so the PDF can always load it), invoice title (default "Invoice"), footer note (e.g. "Not subject to VAT"), invoice number format. |
| `counters` | `name` (e.g. `invoice-2026`), `value`. Used to give invoices gapless sequential numbers. |
| `activity_log` | `at`, `actor_id`, `entity_type`, `entity_id`, `action`, `summary`. Written by triggers and drives "Recent activity". |

### Inventory
| Table | Key columns |
|---|---|
| `items` | `name`, `category` (part / consumable / fluid / other), `brand`, `part_number`, `unit` (pcs / L / ml / kg / m), `min_qty`, `location`, `notes`, `archived_at`, cached `qty_on_hand` and `stock_value_cents` (members can't update these columns directly; only the movement function can), `version` |
| `stock_movements` | `item_id`, `type` (purchase / use_car / use_job / overhead / adjustment / return), `occurred_on`, `qty_delta`, `value_delta_cents`, `car_id?`, `job_id?`, `supplier?`, `reason?` (**required for adjustments**), `note`, `transaction_id?` (the payment for a purchase), `reverses_id?`. Insert only, through the function. |

### Cars
| Table | Key columns |
|---|---|
| `cars` | `make`, `model`, `year`, `vin`, `plate`, `engine`, `fuel`, `mileage_km`, `colour`, `notes`, `status` (bought / in_repair / ready / listed / sold / scrapped), `purchase_date`, `purchased_from`, `asking_price_cents?`, `listing_url?`, `sale_date?`, `buyer?`, `sale_mileage_km?`, `settled_at?` |
| `car_shares` | `car_id`, `partner_id`, `share_bp`. Copied from the partners' default shares when the car is created and editable per car. Must add up to 100 %. |

Money on a car is never stored on the car itself. It comes from:
- the **purchase**: an expense transaction with `category = car_purchase` (it records who paid);
- **parts and consumables from stock**: `stock_movements` of type `use_car` / `return`;
- **car-specific parts**: expense transactions with `category = car_part` plus name and supplier (these never touch inventory);
- **other costs**: expense transactions with `category` set to registration / inspection / transport / ads / insurance / other, plus a free-text label;
- the **sale**: an income transaction with `category = car_sale` (it records where the money went).

### Customer jobs
| Table | Key columns |
|---|---|
| `customers` | `name`, `phone`, `notes`. Reused for repeat customers. |
| `jobs` | `customer_id`, `car_make`, `car_model`, `car_plate`, `car_vin?`, `description`, `status` (open / done / paid), `labor_price_cents`, `invoice_number?`, `invoice_date?`, `settled_at?` |
| `job_lines` | `job_id`, `kind` (stock / bought / other), `description`, `qty`, `sale_price_cents` (defaults to cost, can be overridden), `stock_movement_id?` or `transaction_id?`. The cost comes from the linked movement or transaction. |
| `job_shares` | Same as `car_shares`. |

### Money ledger
| Table | Key columns |
|---|---|
| `transactions` | `occurred_on`, `amount_cents > 0`, `kind`, `category`, `from_account_id`, `to_account_id`, `description`, `counterparty` (supplier / buyer / customer), `car_id?`, `job_id?`, `settlement_id?`, `currency` (always `EUR` for now, so multi-currency stays possible later) |
| `settlements` | `car_id?` or `job_id?`, `settled_on`, `payout_mode` (retain / payout), `breakdown` (a JSON snapshot of the calculation, kept for the record) |
| `allocations` | `partner_id`, `amount_cents` (signed), `occurred_on`, and the source: `settlement_id?`, `transaction_id?` or `stock_movement_id?`. These are **non-cash** entries that give each partner their share of a profit or loss. |

Allowed kinds, enforced by a check constraint:
- **deposit**: partner → wallet
- **withdrawal**: wallet → partner
- **expense**: wallet or partner → external
- **income**: external → wallet or partner
- **transfer**: partner → partner, or wallet ↔ partner (settlements and reimbursements)

**The wallet balance is always computed** (money in minus money out). **A partner's balance** (their capital: what the workshop owes them) is computed as
*put in* (deposits, personal expenses for the workshop, transfers they paid)
− *taken out* (withdrawals, workshop income they received personally, transfers they received)
\+ *profit share* (the sum of their `allocations`).

Allocations are created:
- **when a car or job is settled**: the profit or loss, split by that car's or job's shares;
- **when general overhead is recorded**: an expense or income not tied to a car or job, consumables used as workshop overhead, or a stock count correction. These are split by the **default shares at that moment**. Every overhead cost is therefore shared fairly, and later changes to the default shares don't rewrite history.

The result is that the partners' balances always add up to what the workshop is worth: wallet + stock value + money invested in cars and jobs that aren't settled yet. A unit test checks this invariant.

**Compound writes** (a purchase plus its payment, an expense plus its allocations, a settlement) go through database functions. The pure TypeScript functions calculate the rows, and the database function checks the invariants (for example, that allocations add up to the amount) and writes everything in one transaction.

### Files
| Table | Key columns |
|---|---|
| `attachments` | `entity_type` (car / job / stock_movement / transaction), `entity_id`, `kind` (photo / receipt / invoice / document), `drive_file_id`, `drive_thumb_id?`, `file_name`, `mime_type`, `size_bytes` |
| `drive_folders` | `path` → `drive_folder_id` cache. Only the Edge Function can read or write it. |

### Views (all `security_invoker`, so RLS still applies)
`account_balances`, `car_cost_summary` (sums per car by bucket), `job_summary`, `low_stock_items`.

### Database functions
`post_stock_movement`, `undo_stock_movement`, `issue_invoice_number`, `record_settlement`, `undo_settlement`, and `bootstrap_admin`, which runs only from the SQL editor and only works while no admin exists.

### Row Level Security
- RLS is **on for every table**. The `anon` role gets **no grants at all**, so a signed-out user can't read or write anything.
- Helper functions `app.is_member()` and `app.is_admin()` live in a private schema and check for an **active row in `profiles`**. Being signed in alone is not enough, which also covers the "shared project" case.
- Members can read everything and insert or update business records. Deletes are limited, e.g. a transaction that belongs to a settlement can't be deleted until the settlement is undone.
- `stock_movements` and `settlements` have **no direct write policies**. They change only through the database functions above.
- `profiles`: a member can change only their own `display_name`. Role, active flag and default share change **only through the admin Edge Function**.
- `settings` and the Export page are admin only.
- The **secret key is used only inside Edge Functions** (Supabase injects it there). It is never in the frontend, the repo or GitHub.

### Kept open for later (out of scope for v1 but not blocked)
- **Time tracking**: a new `job_lines.kind = labor_time`.
- **VAT**: add a `vat_rate` column to `job_lines` and a VAT block on the invoice. The numbering stays the same.
- **Multiple currencies**: the `currency` column already exists.
- **Customer portal**: `customers` is its own table, and the role model can gain a `customer` role later.

---

## 4. Money math, settling up

All of this lives in pure, tested functions in `src/domain/`.

- **Car totals:** invested = purchase + stock parts (net of returns) + car-specific parts + other costs. After the sale: **profit** = sale − invested, **margin** = profit ÷ sale, and I also show **ROI** = profit ÷ invested.
- **Settling up a sold car (or a paid job)** has two parts:
  1. **Profit or loss → allocations.** The profit (or loss) is split by the car's shares and added to each partner's balance. This is the same in every mode.
  2. **Cash → suggested transfers.** These decide where the actual money ends up:
     - each partner's **out-of-pocket costs are paid back** from the sale money first (on by default, can be unticked);
     - **payout mode**:
       - **Keep profit in wallet** *(default)*: everything else goes to the wallet.
       - **Pay out profit**: each partner also receives their profit share in cash.
     - The app compares where the money should end up with who actually holds it (who received the sale money), works out the **fewest transfers** needed, and shows them as "who owes whom". Each transfer can be unticked. **Record settlement** writes the allocations and the ticked transfers in one go and marks the car as settled. **Undo settlement** removes them again.

  A cash transfer between a partner and the wallet never changes anyone's balance; it only changes *where* the money sits. That's why unticking a transfer is always safe.

  **Worked example: profit, keep in wallet (default).** The wallet bought the car for 1 000.00€. You paid 200.00€ for parts. 50.00€ of stock was used. The buyer paid **you** 2 000.00€ in cash. The shares are 50/50.
  - Invested 1 250.00€, profit 750.00€, so **+375.00€ is added to each partner's balance**.
  - Cash: you keep 200.00€ (your parts paid back), and the rest goes to the wallet, so **You → Wallet 1 800.00€**.

  **The same car in "Pay out profit" mode:** **You → Wallet 1 050.00€**, **You → Friend 375.00€**, and you keep 575.00€.

  **Worked example: loss, keep in wallet.** The wallet bought the car for 1 000.00€. You paid 200.00€ for parts. The sale brought 900.00€ into the wallet.
  - Invested 1 200.00€, loss 300.00€, so **−150.00€ for each partner**.
  - Cash: **Wallet → You 200.00€** (your parts paid back).

- **Jobs** have the same shares as cars, with two one-tap presets: **"Split by default shares"** or **"All to <name>"**. For a job that's all yours where you took the cash, the settlement just asks you to pay back the wallet for any stock you used. You keep the rest as your profit.
- **Personal purchases not tied to a car** (stock, tools) count toward that partner's "put in". The Partners page has a "Pay back from wallet" shortcut.
- **Partners page:** for each partner it shows Put in · Taken out · Profit share · **Balance**, plus each partner's percentage of the total capital.

---

## 5. App structure and pages

The app is mobile-first. Touch targets are at least 48 px, forms open as bottom sheets, and the decimal keypad opens for numbers. Pickers show your **recent** items and cars first. "Who paid" remembers your last choice, and the date defaults to today.

**Bottom navigation:** Home · Stock (with a red badge showing the low-stock count) · Cars · Jobs · More.
A floating **+** button opens the quick actions: *Add expense, Use from stock, Buy stock, New car, New job*.

| Route | Page |
|---|---|
| `/login` | Email and password |
| `/` | **Dashboard**: wallet balance, each partner's position, cars in progress with the amount invested, open jobs, low stock, recent activity, quick actions |
| `/stock` | Items with search, category chips and a "low only" filter |
| `/stock/:id` | Item: qty, average cost, value, movement history. Buttons: **Buy · Use · Adjust · Return**, plus Undo on the last movement |
| `/stock/shopping-list` | All items at or below minimum, with the last supplier and last price |
| `/cars`, `/cars/:id` | Car cards with status, invested and profit; filter by status; sort. The car page has Details · Costs (grouped) · Photos · Sale · Settle up |
| `/jobs`, `/jobs/:id` | Jobs (Open / Done / Paid). The job page has lines (from stock / bought / other), labor, totals, payment, **PDF invoice**, photos |
| `/money` | Wallet balance and full history, filterable by kind, partner, car or job |
| `/money/new` | Deposit / withdrawal / expense / transfer |
| `/partners`, `/partners/:id` | Positions and history for each partner |
| `/customers` | Customer list with their past jobs |
| `/settings` | Workshop details, logo, invoice settings, default shares *(admin)* |
| `/users` | Create a user, reset a password, disable, set role *(admin)* |
| `/export` | JSON and CSV backup *(admin)* |
| `/account` | Display name, change password, sign out |

**Code layout:**
```
src/
  app/          router, providers, layout, bottom nav
  domain/       PURE + TESTED: money, quantity, stock, carTotals, jobTotals, shares, settlement, ledger, format
  features/     auth, users, inventory, cars, jobs, money, partners, files, dashboard, settings, export
                (each: api.ts with queries and mutations, schemas.ts with zod, components/, pages/)
  lib/          supabase client, generated database.types.ts, query client, image resize
  components/ui shadcn
supabase/
  config.toml, migrations/, functions/{admin-users,files,_shared}/, tests/ (RLS integration tests)
.github/workflows/  ci-deploy.yml (tests, build, Pages), keepalive.yml (optional)
```

**Edge Function `admin-users`:** it checks the caller's token, then requires an **active admin** profile. Actions: list, create (email, display name, temporary password, role, default share; the email is auto-confirmed), set password, disable / enable (Supabase ban plus `is_active = false`), and set role. It refuses to disable or demote the last admin.

**Bootstrap (one-time):** you create your own user in the Supabase dashboard, then run one SQL line: `select app.bootstrap_admin('you@email');`.

---

## 6. Google Drive design

**Why OAuth and not a service account:** a service account has **no storage quota** and can't own files in a personal "My Drive". It only works with Shared Drives, which need Google Workspace. So the Edge Function acts as **you**, using a refresh token for your Google account.

**Scope `drive.file`:** this is a **non-sensitive** scope, so you can publish the OAuth app to **"In production"** without a Google review. That is what stops the 7-day refresh-token expiry you'd get in "Testing". With `drive.file` the app can see only the files it created itself. So:
- don't create the `Workshop` folder by hand; the function creates it;
- you *can* move or rename things in Drive freely, because we store file IDs, not paths.

**Secrets (Supabase → Edge Functions → Secrets):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `FILE_URL_SIGNING_SECRET`.

**Edge Function `files`:**
- `POST /upload` (signed-in member): accepts the file, a browser-made thumbnail, the record it belongs to and the kind of file. It gets an access token (cached while it's valid), finds or creates the folder path (cached in `drive_folders`), uploads the file, and inserts the `attachments` row.
- `POST /sign`: returns **signed URLs** that expire, so a plain `<img src>` works and the browser can cache images. The URLs stay stable for a day, which means repeat views cost nothing.
- `GET /file/:id?v=thumb|full&exp&sig`: checks the signature and streams the file from Drive.
- `DELETE /:id`: moves the file to **Drive trash** (recoverable for 30 days) and removes the row.

**In the browser:** images are resized to at most 2000 px on the longest side, as JPEG at about 80 % quality (roughly 300–700 KB), plus a 320 px thumbnail. PDFs are passed through, up to 8 MB. Supabase doesn't clearly document a request-size limit for Edge Functions (third-party sources say about 10 MB), and functions get only 2 s of CPU time. That's why all image work happens on the phone and the function only moves bytes.

**Camera:** every upload spot has two buttons, **Take photo**, which opens the rear camera, and **Choose file**.

**Folders:** the app creates **one new folder, `Workshop Tracker`, in your My Drive** and keeps everything inside it:
```
Workshop Tracker/
  Cars/<year> <make> <model> <plate>/Photos
  Cars/<year> <make> <model> <plate>/Receipts      receipts for that car
  Jobs/<year>/<job no> <customer> <plate>/
  Receipts/<year>/                                 stock purchases and general expenses
  Invoices/<year>/<invoice no> <customer>.pdf
  .thumbs/                                         small previews (safe to ignore)
```
File names start with the date: `2026-03-12 brake pads.jpg`.

**Your one-time Google setup** (the full click-by-click guide comes in M6):
1. Google Cloud Console: create the project `workshop-tracker` and enable the **Google Drive API**.
2. Google Auth Platform: set up Branding (app name, your email), set Audience to **External**, and add yourself as a test user.
3. Data access: add the scope `…/auth/drive.file`.
4. Clients: create an OAuth client of type **Web application** with the redirect URI `https://developers.google.com/oauthplayground`.
5. Audience: click **Publish app** to move it to "In production".
6. OAuth 2.0 Playground: under ⚙ check "Use your own OAuth credentials" and enter the client ID and secret. Authorize the scope `https://www.googleapis.com/auth/drive.file`, then click **Exchange authorization code for tokens** and copy the **refresh token**.
7. Paste the four secrets into Supabase. I deploy the function, and the Settings page gets a **"Test Drive connection"** button.

---

## 7. Testing and deployment

- **Unit tests (Vitest):** everything in `src/domain/`, including parsing and formatting, average cost, use, return and undo, car and job totals, share splitting with rounding, settlement (profit, loss, 3 partners, wallet-held and partner-held proceeds), and invoice numbering.
- **RLS integration tests**, run in CI against a local Supabase started in GitHub Actions:
  - a signed-out user can't read or write any table;
  - a signed-in user with no profile sees nothing;
  - a member gets 403 from `admin-users`, can't change roles or settings, can't write `stock_movements` or `items.qty_on_hand` directly, and can't delete a settled transaction;
  - an admin can do all of these.
- **CI/CD (`.github/workflows/ci-deploy.yml`):** on every push: typecheck, unit tests, RLS tests, build. On `main` it also deploys to GitHub Pages, but only if everything passed. The Supabase URL and publishable key are GitHub **repository variables**, as in `troskovi`.
- **Database and functions:** migrations live in `supabase/migrations`. I apply them with `supabase db push` and deploy functions with `supabase functions deploy --use-api` from this machine, after you run `npx supabase login` once. Types come from `supabase gen types`. This keeps a powerful Supabase access token out of GitHub. I can move it into CI later if you want.
- `.env.example` is committed and `.env.local` is git-ignored. No secrets are ever committed.

---

## 8. Milestones

Each milestone ends **deployed and working**, with a commit and a short "test this on your phone" list. When you need to click something in a dashboard, I'll stop and tell you exactly what to click.

| | Scope | What you'll need to do |
|---|---|---|
| **M1** | Repo, scaffold, PWA shell and navigation, CI and Pages deploy; base migration (profiles, accounts, settings, activity log, RLS helpers); login; `admin-users` function plus the Users page; Account page; RLS test harness | Create the Supabase project, turn off sign-ups, create your user, run the bootstrap SQL, `npx supabase login`, set 2 GitHub variables, enable Pages |
| **M2** | Inventory: items, movements function, average-cost math and tests, Buy (with who paid, which also creates the expense; the `transactions` table arrives here), workshop-overhead use, adjustment, undo, shopping list, low-stock badge | Try it on the phone |
| **M3** | Cars: details, status, purchase (who paid), use from stock and return, car-specific parts, other costs, sale, live totals, list with sort and filter | Try it |
| **M4** | Wallet and ledger screens, deposit / withdraw / expense / transfer, partners and positions, car shares, **settle up** plus tests | Check the settlement math against a real car |
| **M5** | Customers, jobs, lines with sale prices, labor, payment, invoice numbering, **PDF** (download), job settlement | Fill in Settings (name, logo, contact) |
| **M6** | Google Drive: `files` function, uploads on cars, jobs, purchases and expenses, thumbnails, viewer, invoice copy to Drive | The Google Cloud setup (§6) and pasting the secrets |
| **M7** | Dashboard, activity feed, quick-actions polish, Export (JSON/CSV), keep-alive, final README | Make your first export |

---

## 9. Decisions (answered 10.10.2026)

1. **Supabase:** a **new, dedicated project**.
2. **GitHub:** public repo `Halakai/workshop-tracker`. The app lives at `https://halakai.github.io/workshop-tracker/`.
3. **Profit after a sale:** it **stays in the wallet**, and partner balances track each partner's share (§4). "Pay out profit" is still available per settlement.
4. **Internet in the workshop:** reliable, so the app is online-only.
5. **Jobs:** the profit can be shared, or belong to just one person (the share presets in §4).
6. **Formats and permissions:**
   - money is shown as `1 234.56€`;
   - invoice numbers look like `2026-001`;
   - the app creates and manages its own `Workshop Tracker` folder in your Drive;
   - permissions as I proposed: members can do everything except manage users, change settings and export data.
