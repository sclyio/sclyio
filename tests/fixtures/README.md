# Test fixtures

- `2026-01-10_hudson_invitational_c.yaml` — a real SciolyFF results file copied
  unmodified from the Duosmium archive (https://github.com/Duosmium/duosmium,
  `data/results/`, MIT License, © Duosmium contributors). Used to verify that
  imported official standings match the source's official ordering.
- `sentienttree-divb-aggregate-sample.json` — five rows from SentientTree's
  2026 SO Rankings spreadsheet, used only as an aggregation regression check.
- Everything built in `tests/helpers.ts` is **synthetic**: fictional schools
  ("Alder Ridge", "Birch Hollow", ...) with invented placements, used only by
  automated tests. Synthetic data is never imported into the site database.
