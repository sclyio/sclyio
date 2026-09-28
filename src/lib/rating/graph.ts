/**
 * Entity–tournament-event bipartite graph for one event pool. Ridge
 * penalties anchor disconnected regions numerically, but provide no
 * evidence connecting them; components expose that explicitly.
 */

export interface ComponentInfo {
  /** Component id per entity (0 = reference component, i.e. the largest). */
  entityComponent: Int32Array;
  fieldComponent: Int32Array;
  /** Entity counts per component id (sorted: 0 is largest). */
  sizes: number[];
  /** Entities whose only link to the reference component is a single field. */
  weaklyConnected: Set<number>;
}

class DSU {
  parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(a: number): number {
    while (this.parent[a] !== a) {
      this.parent[a] = this.parent[this.parent[a]];
      a = this.parent[a];
    }
    return a;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

export function components(
  nEntities: number,
  nFields: number,
  edges: { entity: number; field: number }[],
): ComponentInfo {
  const dsu = new DSU(nEntities + nFields);
  for (const e of edges) dsu.union(e.entity, nEntities + e.field);

  // Count entities per root; fields with no entities never occur.
  const counts = new Map<number, number>();
  const hasEdge = new Uint8Array(nEntities);
  for (const e of edges) hasEdge[e.entity] = 1;
  for (let i = 0; i < nEntities; i++) {
    if (!hasEdge[i]) continue;
    const r = dsu.find(i);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  // Deterministic ordering: size desc, then root index asc.
  const roots = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const id = new Map<number, number>();
  roots.forEach(([r], i) => id.set(r, i));
  const entityComponent = new Int32Array(nEntities).fill(-1);
  const fieldComponent = new Int32Array(nFields).fill(-1);
  for (let i = 0; i < nEntities; i++) {
    if (hasEdge[i]) entityComponent[i] = id.get(dsu.find(i)) ?? -1;
  }
  for (let t = 0; t < nFields; t++) fieldComponent[t] = id.get(dsu.find(nEntities + t)) ?? -1;

  // Weak connection heuristic: an entity in the reference component whose
  // observations all come from a single field that contains no other
  // multi-field entity. Such an entity is connected by one tournament only.
  const fieldsPerEntity = new Map<number, Set<number>>();
  for (const e of edges) {
    let set = fieldsPerEntity.get(e.entity);
    if (!set) fieldsPerEntity.set(e.entity, (set = new Set()));
    set.add(e.field);
  }
  const bridgeCountPerField = new Int32Array(nFields);
  for (const [, fs] of fieldsPerEntity) {
    if (fs.size > 1) for (const f of fs) bridgeCountPerField[f]++;
  }
  const weaklyConnected = new Set<number>();
  for (const [ent, fs] of fieldsPerEntity) {
    if (entityComponent[ent] !== 0) continue;
    let bridges = 0;
    for (const f of fs) bridges += bridgeCountPerField[f] - (fs.size > 1 ? 1 : 0);
    if (bridges <= 1) weaklyConnected.add(ent);
  }
  return {
    entityComponent,
    fieldComponent,
    sizes: roots.map(([, c]) => c),
    weaklyConnected,
  };
}
