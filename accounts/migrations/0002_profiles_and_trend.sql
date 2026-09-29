-- Public member profiles with an opt-out, and Season Trend for the Unofficial USR.
ALTER TABLE users ADD profile_private INTEGER NOT NULL DEFAULT 0 CHECK (profile_private IN (0, 1));
ALTER TABLE personal_rating_snapshots ADD trend_z REAL;
ALTER TABLE personal_rating_snapshots ADD trend_usr REAL;
ALTER TABLE personal_rating_snapshots ADD trend_state TEXT;
CREATE INDEX memberships_school ON school_memberships(school_id, season);
