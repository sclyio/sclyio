import { ELO_V1 } from "./config";

/**
 * Original overall-placement Elo (v1). Retained ONLY as a backtesting
 * baseline; never displayed as a rating.
 *
 *  - Each entity starts at 1500.
 *  - E_ij = 1 / (1 + 10^((R_j − R_i) / 400)).
 *  - Δ_i = 48 × mean_j (S_ij − E_ij), S = 1 / 0.5 / 0 for win / tie / loss
 *    in the official overall standings.
 *  - Pre-tournament ratings are frozen; updates are simultaneous; a team's
 *    updates from overlapping same-day tournaments are averaged.
 */

export interface EloTournament {
  id: string;
  date: string; // end date
  standings: { entityId: string; rank: number }[];
}

export class EloV1 {
  ratings = new Map<string, number>();

  get(id: string): number {
    return this.ratings.get(id) ?? ELO_V1.initial;
  }

  has(id: string): boolean {
    return this.ratings.has(id);
  }

  /** Apply all tournaments ending on one date simultaneously. */
  applyDate(tournaments: EloTournament[]) {
    const deltas = new Map<string, number[]>();
    for (const t of tournaments) {
      const s = t.standings;
      if (s.length < 2) continue;
      for (const a of s) {
        const ra = this.get(a.entityId);
        let sum = 0;
        for (const b of s) {
          if (b === a) continue;
          const e = 1 / (1 + Math.pow(10, (this.get(b.entityId) - ra) / ELO_V1.scale));
          const score = a.rank < b.rank ? 1 : a.rank === b.rank ? 0.5 : 0;
          sum += score - e;
        }
        const d = ELO_V1.k * (sum / (s.length - 1));
        let arr = deltas.get(a.entityId);
        if (!arr) deltas.set(a.entityId, (arr = []));
        arr.push(d);
      }
    }
    for (const [id, ds] of deltas) {
      this.ratings.set(id, this.get(id) + ds.reduce((x, y) => x + y, 0) / ds.length);
    }
  }

  /** Run chronologically over tournaments, grouped by date. */
  static run(tournaments: EloTournament[], until?: string): EloV1 {
    const elo = new EloV1();
    const byDate = new Map<string, EloTournament[]>();
    for (const t of tournaments) {
      if (until && t.date >= until) continue;
      let arr = byDate.get(t.date);
      if (!arr) byDate.set(t.date, (arr = []));
      arr.push(t);
    }
    for (const d of [...byDate.keys()].sort()) elo.applyDate(byDate.get(d)!);
    return elo;
  }
}
