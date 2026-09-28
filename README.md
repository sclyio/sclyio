# scly.io — Universal SciOly Rating

Ratings for Science Olympiad **Division B and C** teams, built from public tournament results in the [Duosmium](https://www.duosmium.org/results/) archive.

- **Teams**: a school's Team 1, Team 2, … in a division, across all seasons (Team 1 = the school's best finisher at each tournament). Default leaderboard.
- **Schools**: event-by-event school superscores within each tournament, re-ranked among unique schools. Fitted separately from teams.
- Every rating is event-first (placement logits, field-strength adjustment, regularized fit), then averaged over the season's official events and shown on a 1–16.5 scale (USR). **Season Trend** is the same rating using only the current season.

There are no accounts, rosters, or individual student ratings: public results do not establish individual contributions.

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
- **Read-only web**: no mutation endpoints. Sync, rebuild, and publish are CLI jobs.

## Identity rules

- School = normalized name + city + state; same-named schools elsewhere are never auto-merged. Reviewed aliases: `data/mappings/school-aliases.yaml`.
- Teams are numbered by finish: at each tournament a school's entries are ordered by official rank; the best finisher is **Team 1**, the next **Team 2**, and so on (exhibition entries last). A team spans seasons, so Team 1 in 2000 and Team 1 in 2025 share one results page. Source labels ("Gold", "A") are not used. `data/mappings/team-identity.yaml` can exclude a specific entry.
- `data/mappings/source-overrides.yaml`: supersede/exclude files, formats, canceled events, withdrawn entries. `data/mappings/event-equivalence.yaml`: which earlier-season events count toward this season's events (consecutive same-named events, chained across seasons).

## Rating model (v2-exp.7)

Parameters live in `src/lib/rating/config.ts`.

- **Observation**: each eligible event placement becomes x = ln((n + 1 − r) / r) among the n eligible participants.
- **Weights**: season weight (last 4 seasons: 1, 1/2, 1/4, 1/8) × within-season recency exp(−days/200), counted back from the as-of date or, for earlier seasons, from that season's last tournament × tournament strength exp(k̄), where k̄ is the tournament's mean fitted field offset (Nationals and MIT weigh about 4.5× a typical invitational; the fit runs twice, first to measure k̄) × field size N^0.25 × format (online 0.5).
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

## Known limitations

- Coverage is limited to files published to Duosmium; 442 files are quarantined by SciolyFF validation, including some state tournaments.
- A team is "the school's N-th best entry at each tournament", not a fixed roster: when a school splits its roster, Team 1 can be a weaker squad.
- Tournament format is unknown for all tournaments, so the online discount is inactive.
- Cross-season equivalence assumes same-named official events are equivalent; rule changes were not reviewed.
- Rating history is a reconstruction from today's archive. Division A is not imported.

## Attribution and licensing

Results: Duosmium Results (<https://www.duosmium.org/results/>, repository MIT License, © Duosmium contributors); scored with `sciolyff` (MIT). Tournament results remain attributed to Duosmium and the original tournaments, and every result page links its source. The methodology is informed by SentientTree's SO Rankings. The concept draws on UTR Sports, but scly.io uses none of its branding, text, or algorithm.
