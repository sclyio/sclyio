import { afterEach, describe, expect, it } from "vitest";
import { AccountsConfigError, accountsDbUrl, cleanEnv } from "../src/lib/accounts/db";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["ACCOUNTS_DATABASE_URL", "ACCOUNTS_DATABASE_AUTH_TOKEN", "VERCEL"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const code = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    return e instanceof AccountsConfigError ? e.code : "other";
  }
};

describe("accounts database configuration", () => {
  it("cleans pasted env values", () => {
    expect(cleanEnv('  "libsql://x.turso.io"\n')).toBe("libsql://x.turso.io");
    expect(cleanEnv("'tok'")).toBe("tok");
    expect(cleanEnv("   ")).toBeUndefined();
  });

  it("requires a URL and token on Vercel and rejects malformed URLs", () => {
    process.env.VERCEL = "1";
    delete process.env.ACCOUNTS_DATABASE_URL;
    expect(code(accountsDbUrl)).toBe("missing_url");
    process.env.ACCOUNTS_DATABASE_URL = "sclyio-accounts-org.turso.io";
    expect(code(accountsDbUrl)).toBe("invalid_url");
    process.env.ACCOUNTS_DATABASE_URL = "libsql://sclyio-accounts-org.turso.io";
    delete process.env.ACCOUNTS_DATABASE_AUTH_TOKEN;
    expect(code(accountsDbUrl)).toBe("missing_token");
    process.env.ACCOUNTS_DATABASE_AUTH_TOKEN = " token\n";
    expect(accountsDbUrl()).toEqual({ url: "libsql://sclyio-accounts-org.turso.io", authToken: "token" });
  });

  it("falls back to a local file only outside Vercel", () => {
    delete process.env.VERCEL;
    delete process.env.ACCOUNTS_DATABASE_URL;
    expect(accountsDbUrl().url.startsWith("file:")).toBe(true);
  });
});
