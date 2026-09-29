import type { InArgs, InValue } from "@libsql/client";

/**
 * Remote libSQL rejects named arguments the statement does not reference
 * ("Number of arguments mismatch"), while local SQLite ignores them. Pass only
 * the names that appear in the SQL so both behave the same.
 */
export function usedArgs(sqlText: string, args?: InArgs): InArgs {
  if (!args) return [];
  if (Array.isArray(args)) return args;
  const out: Record<string, InValue> = {};
  for (const [k, v] of Object.entries(args)) {
    if (new RegExp(`[:@$]${k}(?![A-Za-z0-9_])`).test(sqlText)) out[k] = v;
  }
  return out;
}
