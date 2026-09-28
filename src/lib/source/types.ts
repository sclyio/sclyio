/**
 * Source-adapter boundary. Everything Duosmium-specific about *locating and
 * fetching* files lives behind this interface; parsing lives in
 * ./duosmium-parse.ts. No other module talks to the network.
 */
export interface SourceFileRef {
  /** Stable file id: file stem, e.g. 2026-01-10_hudson_invitational_c */
  id: string;
  /** Path within the source repository, e.g. data/results/<id>.yaml */
  path: string;
  /** Git blob SHA when known (lets incremental sync skip unchanged files). */
  blobSha?: string;
}

export interface SourceAdapter {
  readonly name: string;
  /** Source revision identifier (commit SHA) or null if unknown. */
  revision(): Promise<string | null>;
  listResultFiles(): Promise<SourceFileRef[]>;
  readResultFile(ref: SourceFileRef): Promise<Buffer>;
  /** Read a metadata file relative to the data directory (e.g. events-c.csv). */
  readDataFile(name: string): Promise<string | null>;
  /** Public page for a result file. */
  resultUrl(id: string): string;
}

export const DUOSMIUM_RESULTS_BASE = "https://www.duosmium.org/results/";
export const DUOSMIUM_REPO = "https://github.com/Duosmium/duosmium";
