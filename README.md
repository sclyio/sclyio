# scly.io — Universal SciOly Rating

Ratings for Science Olympiad **Division B and C** teams, built from public tournament results in the [Duosmium](https://www.duosmium.org/results/) archive.

- **Teams**: a school's Team 1, Team 2, … in a division, across all seasons (Team 1 = the school's best finisher at each tournament). Default leaderboard.
- **Schools**: event-by-event school superscores within each tournament, re-ranked among unique schools. Fitted separately from teams. School pages show USR and Season Trend, rating history, and a Members tab.
- Every rating is event-first (placement logits, field-strength adjustment, regularized fit), then averaged over the season's official events and shown on a 1–16.5 scale (USR). **Season Trend** is the same rating using only the current season.

Browsing needs no account. Students can sign in with Google, record which competitions and events they took part in, and see an **Unofficial USR** estimated from those claimed team-event results (see [Accounts](#accounts-and-the-unofficial-usr)). There are no public rosters or individual leaderboards: public results record team-event performance, not individual contributions.

## Quick start

Requirements: Node.js 22+, network access to GitHub (or a local copy of Duosmium's `data` directory).

```bash
npm install
npm run setup                     # migrate + import + rating rebuild
npm run dev                       # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run db:migrate` | Create/upgrade the SQLite schema (`drizzle/`). |
| `npm run import` | Full import from Duosmium (GitHub git-data API + raw files, cached by blob SHA). All Division B/C seasons by default; `--seasons 2025,2026` or `--local ../duosmium/data` (also `DUOSMIUM_LOCAL_PATH`). |
| `npm run sync` | Incremental import: unchanged git blobs are skipped; changed files are re-validated and replaced transactionally. |
| `npm run ratings:rebuild` | Recompute snapshots from the earliest affected date recorded by imports. `--full` or `--from YYYY-MM-DD` to force. |
| `npm run backtest` | Chronological backtest (v2 vs v1 Elo vs placement-logit baseline) → `backtest_results` table + `docs/backtest.md`. Optional `--sentienttree-dir <dir>` comparison with SentientTree's rankings exported to `divb.csv`/`divc.csv`. |
| `npm run accounts:migrate` | Create/upgrade the accounts database (`accounts/migrations/`; local default `data/accounts.db`). Additive only. |
| `npm run personal:recompute` | Optional: recompute every stored Unofficial USR against a dataset (`--data <libsql url>`). Pages also recompute lazily when a stored score is out of date. |
| `npm run db:export` | Compact read-only copy of the published build → `dist-data/sclyio.db`. |
| `npm run publish:turso` | Upload the export to Turso as a new dataset, verify it, and switch the site to it (skips if unchanged; `--force` to re-upload). |
| `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` | Vitest suite, `tsc`, ESLint, production build. |

## Architecture

```
source adapter  →  parse (sciolyff)  →  identity  →  persistence  →  rating engine  →  queries  →  pages
src/lib/source     duosmium-parse.ts    src/lib/identity  src/lib/db  src/lib/rating  src/lib/queries  src/app
```

- **Stack**: Next.js 16 (App Router, server components), TypeScript, plain CSS, server-rendered SVG charts. SQLite via better-sqlite3 + Drizzle for the data jobs; the site reads through `@libsql/client` (Turso in production, a local file in development).
- **Source**: the Duosmium adapter lists `data/results` through the GitHub git-data API and downloads raw files with timeouts, retries, and bounded concurrency. Bytes are verified against the git blob SHA and cached in `.cache/duosmium/blobs`.
- **Scoring**: official ranks, totals, drops, ties, exhibition handling, penalties, and statuses come from the official `sciolyff` interpreter. Official standings are stored as published; the model uses a separate eligible-participant ranking.
- **Validation**: every file is checked with `sciolyff`'s validator; invalid files are quarantined with a reason. Files whose only failures are award metadata (trophy/medal/bid counts, short name) are imported and flagged, since those fields cannot change placings.
- **Provenance and corrections**: each file records path, blob SHA, revision, SHA-256, parser version, and result URL. Each tournament's derived observations are hashed; a change records the earliest affected date, the rebuild recomputes from there, and the published build pointer flips in one transaction.
- **Results are read-only on the web**: sync, rebuild, and publish are CLI jobs. The only web mutations are account actions (server actions and the Google OAuth routes), which write to a separate accounts database and never touch results or ratings.

## Identity rules

- School = normalized name + city + state; same-named schools elsewhere are never auto-merged. Reviewed aliases: `data/mappings/school-aliases.yaml`.
- Teams are numbered by finish: at each tournament a school's entries are ordered by official rank; the best finisher is **Team 1**, the next **Team 2**, and so on (exhibition entries last). A team spans seasons, so Team 1 in 2000 and Team 1 in 2025 share one results page. Source labels ("Gold", "A") are not used. `data/mappings/team-identity.yaml` can exclude a specific entry.
- `data/mappings/source-overrides.yaml`: supersede/exclude files, formats, canceled events, withdrawn entries. `data/mappings/event-equivalence.yaml`: which earlier-season events count toward this season's events (consecutive same-named events, chained across seasons).

## Rating model (v2-exp.8)

Parameters live in `src/lib/rating/config.ts`.

- **Observation**: each eligible event placement becomes x = ln((n + 1 − r) / r) among the n eligible participants.
- **Weights** (multiplied together):
  - Season: last 4 seasons at 1, 1/2, 1/4, 1/8.
  - Recency within a season: exp(−days/200), counted back from the as-of date or, for earlier seasons, from that season's last tournament.
  - Level: Invitational 1, Regionals 1.2, States 1.4, Nationals 1.6.
  - Early-season invitationals: × 0.5 in September–October, 0.7 in November, 0.85 in December.
  - Format: satellite/online × 0.6 (detected from the tournament name or a field of more than 150 teams; overrides in `source-overrides.yaml`).
  - Competitiveness: (1 + C)^0.5, where C sums each participant's margin above z = 1.5 (a smooth max(0, z − 1.5)), with participants rated by a first fit. More strong teams raise it; a huge field of average teams does not. MIT is about as competitive as Nationals.
  - The tournaments page ranks tournaments by level × format × early-season × competitiveness (recency and field size are left out there, since they depend on the date and the event).
  - Field size: N^0.25 unique schools in the event.
- **Fit**: per event, entity skills s and field offsets k minimize the weighted squared error of x + k − s with ridge penalties λs = 1, λk = 1, solved by preconditioned conjugate gradient. Only the largest connected component of each event graph is nationally comparable.
- **Overall**: mean over the season's M official events (missing events count as 0); schools use a softplus mean so strong results count more. Established = all M events comparable and ≥ 3 tournaments.
- **Display**: USR = 1 + 15.5 / (1 + e^(−(z − 0.85) / 0.6)).
- **Non-participation**: in rated events, participation-only, no-show, and disqualified results rank below every placed team. Trial events (held as trial or trialed) are not rated at all.
- **Refits**: weekly (Sundays) for the two most recent seasons, every 4 weeks plus the season-final refit for older ones. Event-level detail is stored for January and March month-ends plus each season's final refit.
- **Change attribution**: an exact decomposition of each refit's change into window, field recalibration, recency, and new results.
- v1 Elo (`src/lib/rating/elo-v1.ts`) exists only as a backtest baseline. Run `npm run backtest` for current accuracy numbers.

## Deployment: Vercel + Turso

```
GitHub Actions (weekly)                      Turso                         Vercel
sync → ratings:rebuild → test → db:export → new DB "sclyio-data-<time>-b<build>"
                               → publish:turso: upload → verify → flip pointer in "sclyio-meta"  ← app reads pointer (60 s cache)
```

Each publish creates a new dataset database, uploads and verifies it, and only then updates the one-row pointer in the meta database, so visitors never see a partial dataset. The newest two datasets are kept. No Vercel redeploy is needed when data changes, except when a code change also changes the database schema: then deploy the code and publish the dataset together.

### One-time setup

1. Install the Turso CLI and log in: `turso auth login`. Use your `default` group, located near Vercel's function region (e.g. `aws-us-east-1`).
2. Create a Platform API token for CI (`turso auth api-tokens mint sclyio-ci`) and note your org slug (`turso org list`).
3. Create a read-only group token for the site: `turso group tokens create <group> --read-only`.
4. Publish the first dataset: `npm run db:export`, then `TURSO_API_TOKEN=… TURSO_ORG=… npm run publish:turso`. This creates `sclyio-meta`; get its URL with `turso db show sclyio-meta --url`.
5. Vercel environment variables: `TURSO_META_URL`, `TURSO_READ_TOKEN`.
6. GitHub Actions secrets `TURSO_API_TOKEN`, `TURSO_ORG` (variable `TURSO_GROUP` if not `default`). The `sync-and-rebuild` workflow then runs weekly (Mondays).

Storage: two ~1.4 GB datasets plus the meta database.

## Accounts and the Unofficial USR

### What users can do

1. **Sign in with Google** (`/login`) and choose a display name (`/onboarding`).
2. **Affiliate with imported schools**, one whole division and season at a time (no partial seasons). Members can add any number of seasons and different schools in different seasons, but only one school per season (both divisions at that one school are allowed). Affiliations start self-reported, and choosing a school grants no access to anything.
3. **Add competition** (`/dashboard/claims/new`): pick an imported tournament, the school's actual entry (suffix and team number exactly as imported), then the events they competed in, with each official result shown. Each event is its own claim (one per user, tournament, and event). Event partners can claim the same team-event result; one user cannot claim an event on two teams at one tournament.
4. **Unofficial USR and Season Trend** on `/dashboard` and the member's profile (`/members/<id>`), available immediately from self-reported and pending claims.
5. **Request verification** (`/dashboard/verify`) with an optional private note, and follow each item's status.

Admin portal (`/admin`, separate from the member area, 404 for everyone else): an overview of verification progress per division and season; a **request queue** (`/admin/verifications`) of submissions with the user, school, division/season, tournament, actual team entry, claimed events, official results, Duosmium links, revisions, review flags, and history; and **All seasons** (`/admin/records`), which lists every affiliation and its claims for any season, whether or not the member requested review, so past seasons' results can be verified directly. The admin records a decision per item (verify / reject / revoke, or reverse an earlier rejection or revocation) with a reason the user sees and a separate private note, or verifies all of a card's unreviewed items at once.

### Security model

- **Authentication**: server-side OAuth 2.0 authorization-code flow with [openid-client](https://github.com/panva/openid-client) (state, nonce, PKCE S256). The library validates the ID token's signature (Google JWKS), issuer, audience, expiry, and nonce; `email_verified` must be true. Scopes are `openid email profile` only; access and refresh tokens are discarded.
- **Identity**: accounts are keyed by `(provider, subject)`. Email is never an account key and never links accounts. The provider email is private.
- **Sessions**: a random 256-bit token in an HttpOnly, SameSite=Lax cookie (`__Host-` prefixed and Secure in production). Only its SHA-256 is stored, so sessions are revocable (log out, log out everywhere); they expire after 14 days. Every state change also needs a per-session CSRF token (Next.js additionally rejects cross-origin action POSTs). Post-login redirects accept only same-origin allowlisted paths.
- **Administrator**: one policy, `requireAdmin()` in `src/lib/accounts/actor.ts`, evaluated from the database on every admin page load and action: an active session for a Google account whose Google-reported email is verified and, lowercased and trimmed, exactly `universal.scioly.rating@gmail.com` (no dot stripping, no `+` removal). There is no stored role, no promotion path, and no first-user admin. Review decisions also require a Google sign-in completed within the last **30 minutes**. Google has no `max_age` or `prompt=login`, so "Sign in again" runs the flow with `prompt=select_account` and the new session records the time. The admin cannot review their own affiliation or claims.
- **Integrity**: every submitted id is re-validated on the server against the active dataset (membership, school, entry, tournament, division/season, event). Status transitions are enforced on the server. Decisions bind to the reviewed revision with optimistic checks, so approving a claim that was edited during review fails safely. `verification_decisions` and `audit_log` are append-only (database triggers reject UPDATE and DELETE).
- **Privacy**: member profiles (`/members/<id>`) are public by default and listed on each school's **Members** tab with a verified / self-reported mark; a member can make their profile private in Settings, which removes it from every public page (a private profile returns 404 to everyone but its owner). Public pages show only display name, affiliations, counted claims (marked verified or self-reported), and the Unofficial USR; they never show provider email, subject, sessions, admin notes, or rejected/revoked items. Signed-in and member routes send `Cache-Control: private, no-store`, and member profiles are marked noindex.

### Accounts database

Result datasets are replaced on every publish, so accounts live in their own writable database (`accounts/migrations/0001_accounts.sql`): `users`, `oauth_accounts`, `sessions`, `school_memberships`, `verification_requests`, `participation_claims`, `verification_decisions`, `audit_log`, `personal_rating_snapshots`. Rows reference dataset ids (school, tournament, entry, tournament event, event definition) by value. Locally it is `data/accounts.db`; in production it is a dedicated Turso database (`ACCOUNTS_DATABASE_URL` plus a read-write token). It is never part of `db:export` or `publish:turso`.

After a publish, each claim's official result is fingerprinted again. Unreviewed claims follow the correction. A verified claim whose result changed is flagged "changed" for re-review and stops counting as admin-verified evidence. A result that disappeared is marked missing and stops counting.

### Unofficial USR (method `personal-v2`)

`src/lib/personal/` is an experimental proxy, not a validated model of individual ability. It only reads the published build and never feeds back into team, school, or field-strength fits.

Like team ratings, the Unofficial USR for season S counts claims from S and the three seasons before it (events carried across seasons through the reviewed equivalence mappings, season weights 1, 1/2, 1/4, 1/8 inside w), and the **Season Trend** repeats the calculation with season S claims only. For each counted claim (self-reported, pending, or verified):

- x = the engine's own placement logit for that team entry, recomputed with `deriveObservations()` (same eligible participants, ties, and non-participation handling);
- k = the published field offset of that tournament event, and w = its normalized observation weight (`field_fits.weight / n`), both from season S's latest event-detail team refit;
- a = x + k. Per event: **s = Σ w·a / (Σ w + 2)**. Summary: the mean over nationally comparable rated events. Display: the site's mapping **USR = 1 + 15.5 / (1 + e^(−(z − 0.85)/0.6))**.

Only claimed events count. There is no default score for missing events, and neither the school's rating nor its superscored School Potential is used. Claims without a rated result are stored and labelled ("no eligible result", "no comparable model estimate", or "rating calculation pending"). Estimates for teams outside the event's connected reference component are shown as local-only and left out of the summary. A rating is provisional with fewer than 3 comparable contributing claims or fewer than 2 competitions. Each stored snapshot records the model and method versions, dataset build, rating snapshot, computation time, and the input claims' revisions, statuses, and source fingerprints. If those no longer match, the page recomputes before showing a score, or shows "calculation pending".

### Setup: Google sign-in

1. Google Cloud Console, **APIs & Services → OAuth consent screen**: user type External; app name "scly.io"; support and developer contact email; authorized domain `scly.io`; scopes `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile` only. Publish the app (these basic scopes do not need Google verification), or add test users while it is in Testing.
2. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URIs, exactly:
   - `http://localhost:3000/auth/google/callback`
   - `https://scly.io/auth/google/callback`

   Add `https://www.scly.io/auth/google/callback` only if the site is served from `www`; `APP_ORIGIN` must match the origin actually used. No JavaScript origins are needed.
3. Environment (see `.env.example`): `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (at least 32 random characters), and in production `ACCOUNTS_DATABASE_URL` and `ACCOUNTS_DATABASE_AUTH_TOKEN` (for example `turso db create sclyio-accounts`, then `turso db tokens create sclyio-accounts`). Set them in Vercel for Production and keep secrets out of the repository.
4. Run `npm run accounts:migrate` against each accounts database (locally, and once with the production environment for Turso).

## Known limitations

- Coverage is limited to files published to Duosmium; 442 files are quarantined by SciolyFF validation, including some state tournaments.
- A team is "the school's N-th best entry at each tournament", not a fixed roster: when a school splits its roster, Team 1 can be a weaker squad.
- Tournament format is unknown for all tournaments, so the online discount is inactive.
- Cross-season equivalence assumes same-named official events are equivalent; rule changes were not reviewed.
- Rating history is a reconstruction from today's archive. Division A is not imported.
- The Unofficial USR is an experimental proxy built from team-event results; it cannot isolate an individual's contribution, and verification is a manual judgment, not proof from public results.

## Attribution and licensing

Results: Duosmium Results (<https://www.duosmium.org/results/>, repository MIT License, © Duosmium contributors); scored with `sciolyff` (MIT). Tournament results remain attributed to Duosmium and the original tournaments; every tournament link goes to its Duosmium results page. The methodology is informed by SentientTree's SO Rankings. The concept draws on UTR Sports, but scly.io uses none of its branding, text, or algorithm.
