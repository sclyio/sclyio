# scly.io — Universal SciOly Rating

An experimental, transparent rating site for Science Olympiad **Division B and C** teams, built from public tournament results in the [Duosmium](https://www.duosmium.org/results/) archive.

Journey: find your school → choose your team → understand its rating → inspect the results behind it → compare with other teams.

- **Team Performance**: actual team entries (school + division + season + label such as "Gold"). Default leaderboard.
- **School Potential**: event-by-event school superscores within each tournament, re-ranked among unique schools. Fitted separately; never mixed with Team Performance.
- Ratings are event-first (placement logits, field-strength adjustment, regularized fit), then aggregated. The method is described in this README (the site itself is deliberately plain: tables and links only).

There are no accounts, rosters, student profiles, or individual ratings: public results do not establish individual contributions.

## Quick start

Requirements: Node.js 22+, network access to GitHub (or a local copy of Duosmium's `data` directory).

```bash
npm install
cp .env.example .env.local        # optional; defaults work locally
npm run setup                     # migrate + import (≈1 min) + rating rebuild (≈2 min)
npm run dev                       # http://localhost:3000
```

`npm run setup` = `db:migrate` → `import` → `ratings:rebuild`.

## Scripts

| Command | What it does |
|---|---|
| `npm run db:migrate` | Create/upgrade the SQLite schema (`drizzle/`). |
| `npm run import` | Full import from Duosmium (GitHub git-data API + raw files, cached by blob SHA). Imports every Division B/C season in the archive by default (`--seasons auto` = two most recent completed seasons + current; or an explicit list). |
| `npm run import -- --seasons 2025,2026` | Import only specific seasons. |
| `npm run import -- --local ../duosmium/data` | Offline import from a local checkout (also `DUOSMIUM_LOCAL_PATH`). |
| `npm run sync` | Incremental import: unchanged git blobs are skipped; changed files are re-validated and replaced transactionally. |
| `npm run ratings:rebuild` | Recompute snapshots from the earliest affected date recorded by imports (no-op when nothing changed). `--full` or `--from YYYY-MM-DD` to force. |
| `npm run sync:all` | `sync` then `ratings:rebuild`. |
| `npm run backtest` | Chronological backtest (v2 vs v1 Elo vs placement-logit baseline) → `backtest_results` table + `docs/backtest.md`. Optional `--sentienttree-dir <dir>` external comparison (see below). |
| `npm run db:export -- --out dist-data/sclyio.db` | Compact, read-only deployment copy containing only the published build. |
| `npm run publish:turso` | Upload the export to Turso as a new dataset, verify it, and atomically switch the site to it (skips if unchanged; `--force` to re-upload). |
| `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` | Vitest suite, `tsc`, ESLint, production build. |
| `npm run dev` / `npm start` | Next.js dev / production server. |

## Architecture

```
source adapter  →  parse (sciolyff)  →  normalize/identity  →  persistence  →  rating engine  →  query layer  →  UI
src/lib/source     duosmium-parse.ts    src/lib/identity        src/lib/db       src/lib/rating    src/lib/queries  src/app
```

- **Stack**: Next.js 16 (App Router, server components), TypeScript, Tailwind CSS v4, Recharts, lucide-react, SQLite via better-sqlite3 + Drizzle (schema/migrations). Hand-written accessible components in the shadcn style (no generated component library).
- **Source**: `DuosmiumGitHubAdapter` lists `data/results` through the GitHub git-data API (3 calls per sync) and downloads raw files from `raw.githubusercontent.com` with timeouts, retries with exponential backoff, and bounded concurrency. Bytes are verified against the git blob SHA and cached in `.cache/duosmium/blobs`. `LocalDirectoryAdapter` is the offline path. No results HTML is scraped; no API endpoint was invented.
- **Scoring**: official ranks, totals, drops, ties, exhibition handling, penalties, and statuses come from the official `sciolyff` interpreter (v0.20.1, MIT). Official standings are stored as published; the model uses a separate eligible-participant ranking.
- **Validation**: every file is checked with `sciolyff`'s validator (`canonical: false`, because canonical checks make network calls per file). Invalid files are quarantined with a reason without blocking other files. **Policy:** a file whose only failing checks are award metadata (tournament/track trophy, medal, bid counts, or the short-name rule) is imported and flagged, because those fields cannot change placings or points. With the 2026-09-25 source revision (all seasons): 4,234 of 4,676 Division B/C files imported, 442 quarantined (mostly older files).
- **Provenance**: each file records repository path, blob SHA, commit revision, fetched-at, SHA-256, parser version, and Duosmium result URL. Content-hash changes are logged as corrections; a parser-version bump re-parses unchanged files.
- **Idempotence**: stable ids (file stem, `tournament#teamNumber`, event slug) and per-tournament transactional replacement. Re-imports never duplicate records (tested).
- **Recalculation**: each tournament's derived observations are hashed; any change (correction, identity mapping, override) records the earliest affected date. The rebuild recomputes only snapshots on/after it, copies earlier ones from the published build, and flips the published build pointer in one transaction. Visitors never see partial rankings. Fits that fail to converge block publication.
- **Web requests are read-only**: the app reads through `@libsql/client` (Turso in production, a local file in development). There are no mutation endpoints. Sync, rebuild, and publish are CLI jobs only.

## Identity rules (summary)

- School = normalized name + city + state; same-named schools elsewhere are never auto-merged. Reviewed aliases: `data/mappings/school-aliases.yaml`.
- Teams are numbered by finish: at each tournament, a school's entries are ordered by official overall rank; the best finisher is that school's **Team 1** for the season, the next **Team 2**, and so on. Source labels ("Gold", "A") and tournament team numbers are not used, so a school's results are not scattered across many one-off labels. Exhibition entries are ordered after competitive ones. A team therefore means "the school's N-th best entry at each tournament", not a fixed roster. Reviewed entries in `data/mappings/team-identity.yaml` can exclude a specific entry.
- Supersede/exclude files, record formats, canceled events, and withdrawn entries in `data/mappings/source-overrides.yaml`. Cross-season event equivalence for School Potential: `data/mappings/event-equivalence.yaml`.

## Rating model (v2-exp.5)

Implements the SentientTree-informed experimental v2 exactly as specified. Parameters live in `src/lib/rating/config.ts`: 400-day window, 200-day decay, N^0.25, online weight 0.5, λk = 1, λs = **1**, M from the season's official event list, established = all M events comparable plus 3 or more tournaments. Also:

- Preconditioned conjugate gradient solves the strictly convex fit. A solution is accepted only if one alternating update moves no parameter by ≥ 1e-7. The alternating method and a dense solver exist for verification (tests).
- Graph components per event pool; only the largest component is nationally comparable.
- Display scale (v2-exp.3): USR = 1 + 15.5 / (1 + e^(-(z - 0.85) / 0.6)), fixed per model version; 2025-26 overall ratings span about 1.3 to 16.2.
- Non-participation penalty (v2-exp.4): in non-trial events, participation-only, no-show, and disqualified results rank below every placed team, in that official order (ties share a midrank). Trial events do not penalize non-participants.
- Refits: weekly (Sundays) for the two most recent seasons, every 4 weeks plus the season-final refit for older seasons.
- Weekly Sunday snapshots per (division, view, season). Overall ratings are stored for every snapshot. Event-level detail is stored for January and March month-ends plus each season's final refit, to bound database size.
- "Why did this change?" is an exact telescoping decomposition: window/coverage → field recalibration → recency → new results.
- v1 Elo is implemented (`src/lib/rating/elo-v1.ts`) only as a backtest baseline.

### Backtest (chronological by tournament; pairwise ordering accuracy)

The table below was measured with v2-exp.2 on the 2024–25 and 2025–26 seasons, before the identity, penalty, and full-history changes; rerun `npm run backtest` to refresh it.

Validation = targets starting 2024-12-01 → 2026-01-31; test = 2026-02-01 onward (held out). Full tables including sensitivity variants: `docs/backtest.md`.

| Pool | Split | Event: v2 | logit | Elo v1 | Overall: v2 | logit | Elo v1 |
|---|---|---|---|---|---|---|---|
| B Team Perf. | validation | 0.735 | 0.728 | 0.681 | 0.755 | 0.748 | **0.781** |
| B Team Perf. | test | 0.727 | 0.716 | 0.655 | 0.770 | 0.753 | 0.761 |
| B School Pot. | validation | 0.750 | 0.719 | 0.708 | 0.831 | 0.783 | 0.799 |
| B School Pot. | test | 0.746 | 0.711 | 0.703 | 0.818 | 0.755 | 0.798 |
| C Team Perf. | validation | 0.713 | 0.708 | 0.675 | 0.752 | 0.749 | **0.774** |
| C Team Perf. | test | 0.728 | 0.716 | 0.677 | 0.774 | 0.758 | 0.772 |
| C School Pot. | validation | 0.746 | 0.724 | 0.708 | 0.836 | 0.798 | 0.812 |
| C School Pot. | test | 0.757 | 0.729 | 0.717 | 0.822 | 0.767 | 0.817 |

- v2 is best at held-out **event** ordering in every pool and split.
- **Team Performance overall standings:** v1 Elo was better on validation in both divisions. On the test split v2 is marginally better (B 0.770 vs 0.761, C 0.774 vs 0.772). Treat the overall USR as a summary of event skills, not an optimized finish predictor.
- λs = 1 was selected on validation only (λs = 2 was the starting value). Other parameters are unchanged hypotheses. The online discount is untested: no tournament has an explicitly recorded format.
- External comparison (not ground truth, not used for tuning): scly.io School Potential ranks vs SentientTree's FINAL tabs. Spearman is 0.926 over 353 matched Div B schools and 0.966 over 539 Div C schools. Top-25 overlap is 20 (B) and 22 (C). To reproduce, export the two FINAL tabs to `divb.csv`/`divc.csv` (school, state, overall rank, score) in a local directory and pass `--sentienttree-dir`. The export is not committed.

## Verification performed

- `npm test`: 42 tests. They cover duplicate imports, corrections and earliest affected date, quarantine, school-name collisions, multiple teams per school, unresolved identities, official ties and midranks, missing results and typed statuses, division separation, graph components, event-specific field counts, superscore re-ranking and provenance, and trial-event eligibility. Also covered: recency direction, positive weights, stable softplus/inverse-softplus, and CG = alternating = dense solutions. Further tests check determinism, non-convergence reporting, sparse shrinkage, missing-event priors, season transitions (team vs school), future-data leakage, exact change attribution, atomic rebuild and recompute-from-date, and pre-tournament field strength. Finally, a regression check reproduces SentientTree's displayed aggregate from an attributed 5-row fixture (aggregation only).
- A real Duosmium file (`tests/fixtures/…hudson_invitational_c.yaml`) is checked against the interpreter's official ordering. Separately, all 59 teams of 2026 Nationals C match the live duosmium.org page in order and total points.
- `npm run typecheck`, `npm run lint`, `npm run build`: clean.
- Browser flow (headless Edge): search → school → team → tournament → Duosmium source link (HTTP 200) → compare (2 series, head-to-head). Also checked: follow toggle persisted in localStorage, shared rankings URL restores all filters, filter changes update the URL, visible focus ring, no page errors. At 375 px no page scrolls horizontally; only the detailed tables scroll.

## Deployment: Vercel + Turso

The web app only reads. Data jobs run in GitHub Actions (or any trusted machine) and publish finished datasets to [Turso](https://turso.tech) (hosted libSQL/SQLite):

```
GitHub Actions (weekly)                      Turso                         Vercel
sync → ratings:rebuild → test → db:export → new DB "sclyio-data-<time>-b<build>"
                               → publish:turso: upload → verify → flip pointer in "sclyio-meta"  ← app reads pointer (60 s cache)
```

- Each publish creates a new dataset database, uploads the exported file, verifies it, and only then updates the one-row pointer (`active_dataset`) in the meta database. Visitors never see a partial dataset, and a failed upload is deleted without touching the live site. The newest two datasets are kept; older ones are deleted. No Vercel redeploy is needed when data changes.
- If the exported dataset matches the active one (same build id and build time), publishing is skipped, so quiet days don't re-upload ~665 MB.
- Web reads use `@libsql/client` (`src/lib/db/read.ts`). The same code reads a local `file:` database in development. CLI jobs keep using better-sqlite3.

### One-time setup

1. Install the Turso CLI (macOS/Linux/WSL) and log in: `turso auth login`.
2. Use your `default` group (plans below Scaler allow only one group). Its primary location should be near Vercel's default function region (iad1, Washington D.C.), e.g. `aws-us-east-1`; `turso group show default` shows it. On a plan with multiple groups: `turso group create sclyio --location aws-us-east-1`.
3. Create a Platform API token for CI: `turso auth api-tokens mint sclyio-ci`, and note your org slug: `turso org list`.
4. Create a read-only group token for the site: `turso group tokens create <group> --read-only`.
5. Publish the first dataset from a machine that has run `npm run setup` (or run the workflow manually; the first CI run does a full import, ~10 min):
   ```bash
   npm run db:export
   TURSO_API_TOKEN=… TURSO_ORG=… TURSO_GROUP=<group> npm run publish:turso
   ```
   This creates `sclyio-meta` on first run. Get its URL with `turso db show sclyio-meta --url`.
6. Vercel → Project → Settings → Environment Variables (Production and Preview):
   `TURSO_META_URL` = the meta URL, `TURSO_READ_TOKEN` = the read-only group token, optionally `CORRECTIONS_URL`. Redeploy once.
7. GitHub → repository Settings → Secrets and variables → Actions: secrets `TURSO_API_TOKEN`, `TURSO_ORG`; variable `TURSO_GROUP` if not `default`. The scheduled workflow `sync-and-rebuild` then keeps the site current weekly (Mondays, after the weekend's tournaments). Run it manually once to confirm.

Storage: two ~1.4 GB datasets plus the meta database; check that your Turso plan's storage allowance covers ~3 GB.

Alternative without Turso: a single VM/container with a persistent disk running `npm start` plus `ops/sync.cron.example`.

## Known limitations

- Coverage is limited to files published to Duosmium; 442 files are quarantined by SciolyFF validation, including some state tournaments (e.g. 2026 TX and WI states). Many real results never reach the archive.
- 904 unresolved entries; possible label splits (e.g. a school's "unlabeled" vs "A" teams) are listed for review but not merged.
- Tournament format is unknown for all tournaments, so the online discount is inactive.
- Cross-season event equivalence assumes same-named official events are equivalent; rule changes were not reviewed.
- Rating history is a reconstruction from today's archive; a publish log exists but past displayed values are not archived.
- Division A is not imported. The earliest seasons have very few tournaments, so their ratings rest on thin evidence.
- The 2026–27 season has no published results yet (as of 2026-09-27), so rankings default to 2025–26.
- The database is large (≈3.5 GB live with two builds retained; ≈1.4 GB exported, model observations excluded). Each publish uploads the full export.

## Attribution and licensing

Results: Duosmium Results (<https://www.duosmium.org/results/>, repository MIT License, © Duosmium contributors); scored with `sciolyff` (MIT). The MIT license covers the repository's code and files. Tournament results remain attributed to Duosmium and the original tournaments, and every result page links its source. The methodology is informed by SentientTree's 2026 SO Rankings; adaptations are documented in this README. The concept draws on UTR Sports, but scly.io uses none of its branding, text, or algorithm.
