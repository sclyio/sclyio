-- scly.io accounts database (separate from the published results datasets).
--
-- Result datasets are read-only and replaced on every publish, so rows here
-- reference dataset ids (schools.id, tournaments.id, entries.id,
-- tournament_events.id, event_definitions.id) by value. The application
-- validates those references against the active dataset on every write.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  onboarded_at TEXT
);

-- Stable identity = (provider, subject). provider_email is private and is
-- only ever written from a validated ID token.
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  UNIQUE (provider, subject)
);
CREATE INDEX oauth_accounts_user ON oauth_accounts(user_id);

-- Revocable database sessions. id = SHA-256 of the cookie token (the raw
-- token is never stored). authenticated_at = last completed Google sign-in.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  oauth_account_id TEXT NOT NULL REFERENCES oauth_accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  authenticated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Season- and division-scoped school affiliation. A transfer ends one
-- membership and starts another; past memberships and their claims are kept.
CREATE TABLE school_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  school_id TEXT NOT NULL,
  school_name TEXT NOT NULL,
  division TEXT NOT NULL CHECK (division IN ('B', 'C')),
  season INTEGER NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('SELF_REPORTED', 'PENDING', 'VERIFIED', 'REJECTED', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, school_id, division, season)
);
CREATE INDEX memberships_user ON school_memberships(user_id);
CREATE INDEX memberships_status ON school_memberships(status);

-- A user's request for manual review (one "submission").
CREATE TABLE verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  membership_id TEXT NOT NULL REFERENCES school_memberships(id),
  include_membership INTEGER NOT NULL CHECK (include_membership IN (0, 1)),
  explanation TEXT,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX vreq_open ON verification_requests(closed_at, created_at);

-- One claim per user, tournament, and event. Different users may claim the
-- same team-event result (event partners).
CREATE TABLE participation_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  membership_id TEXT NOT NULL REFERENCES school_memberships(id),
  school_id TEXT NOT NULL,
  division TEXT NOT NULL CHECK (division IN ('B', 'C')),
  season INTEGER NOT NULL,
  tournament_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  tournament_event_id TEXT NOT NULL,
  event_def_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('SELF_REPORTED', 'PENDING', 'VERIFIED', 'REJECTED', 'REVOKED', 'WITHDRAWN')),
  request_id TEXT REFERENCES verification_requests(id),
  -- Fingerprint of the official result when claimed / last reviewed.
  source_hash TEXT NOT NULL,
  source_state TEXT NOT NULL DEFAULT 'current' CHECK (source_state IN ('current', 'changed', 'missing')),
  flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, tournament_id, tournament_event_id)
);
CREATE INDEX claims_user ON participation_claims(user_id, season);
CREATE INDEX claims_result ON participation_claims(entry_id, tournament_event_id);
CREATE INDEX claims_status ON participation_claims(status);
CREATE INDEX claims_request ON participation_claims(request_id);

-- Admin decisions, bound to the exact reviewed revision. Append-only.
CREATE TABLE verification_decisions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('membership', 'claim')),
  subject_id TEXT NOT NULL,
  subject_revision INTEGER NOT NULL,
  request_id TEXT,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  reviewer_oauth_account_id TEXT NOT NULL REFERENCES oauth_accounts(id),
  decision TEXT NOT NULL CHECK (decision IN ('VERIFIED', 'REJECTED', 'REVOKED')),
  public_reason TEXT,
  private_note TEXT,
  source_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX decisions_subject ON verification_decisions(subject_type, subject_id);

-- Every state change (user and admin). Append-only.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_user_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  revision INTEGER,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT
);
CREATE INDEX audit_subject ON audit_log(subject_type, subject_id);

CREATE TRIGGER verification_decisions_no_update BEFORE UPDATE ON verification_decisions
BEGIN SELECT RAISE(ABORT, 'verification_decisions is append-only'); END;
CREATE TRIGGER verification_decisions_no_delete BEFORE DELETE ON verification_decisions
BEGIN SELECT RAISE(ABORT, 'verification_decisions is append-only'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- Unofficial personal USR, one current row per (user, division, season);
-- earlier rows are kept as history. Swapped atomically.
CREATE TABLE personal_rating_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  division TEXT NOT NULL,
  season INTEGER NOT NULL,
  is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  state TEXT,
  model_version TEXT NOT NULL,
  method_version TEXT NOT NULL,
  dataset_build_id INTEGER,
  rating_snapshot_id INTEGER,
  rating_as_of TEXT,
  inputs_hash TEXT NOT NULL,
  inputs TEXT NOT NULL,
  summary_z REAL,
  summary_usr REAL,
  rated_events INTEGER,
  competitions INTEGER,
  contributing_claims INTEGER,
  verified_contributing_claims INTEGER,
  provisional INTEGER,
  detail TEXT,
  error TEXT,
  computed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX prs_current ON personal_rating_snapshots(user_id, division, season) WHERE is_current = 1;
CREATE INDEX prs_user ON personal_rating_snapshots(user_id);
