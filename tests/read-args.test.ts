import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("named argument filtering (remote libSQL is strict)", () => {
  it("passes only the named args the statement references", async () => {
    const { usedArgs } = await import("../src/lib/db/read");
    expect(usedArgs("SELECT * FROM t WHERE a = @id", { id: 1, div: "C", season: 2026 })).toEqual({ id: 1 });
    expect(usedArgs("SELECT @season, @season - 1, :div", { id: 1, div: "C", season: 2026 })).toEqual({ div: "C", season: 2026 });
    // A name that is a prefix of another name is not matched by accident.
    expect(usedArgs("SELECT @snapshot", { snap: 1, snapshot: 2 })).toEqual({ snapshot: 2 });
    expect(usedArgs("SELECT ?", [5])).toEqual([5]);
  });
});
