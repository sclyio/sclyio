"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Star } from "lucide-react";

/* ---------------------------------------------------------------- */
/* Filter form: works as a plain GET form; with JS it also submits  */
/* on change so the URL (and thus the shareable state) updates.     */
/* ---------------------------------------------------------------- */
export function AutoSubmitForm({ children, className, action }: { children: ReactNode; className?: string; action: string }) {
  const router = useRouter();
  return (
    <form
      action={action}
      method="get"
      className={className}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "search") return;
        const form = e.currentTarget;
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v !== "") params.set(k, v);
        params.delete("page");
        router.push(`${action}?${params.toString()}`);
      }}
    >
      {children}
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Local-device follows                                             */
/* ---------------------------------------------------------------- */
export interface FollowItem {
  id: string;
  href: string;
  label: string;
  kind: "team" | "school";
}

const KEY = "sclyio.follows.v1";
const listeners = new Set<() => void>();

function readFollows(): FollowItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FollowItem[]) : [];
  } catch {
    return [];
  }
}
let cache: FollowItem[] | null = null;
function snapshot(): FollowItem[] {
  if (cache === null) cache = readFollows();
  return cache;
}
function writeFollows(items: FollowItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: follow is not persisted */
  }
  cache = items;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}
const EMPTY: FollowItem[] = [];
const noopSubscribe = () => () => {};
function useFollows() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function FollowButton({ item }: { item: FollowItem }) {
  const follows = useFollows();
  // true only after hydration, so the server render never shows a stale state
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const on = follows.some((f) => f.id === item.id);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        aria-pressed={on}
        disabled={!mounted}
        onClick={() => writeFollows(on ? follows.filter((f) => f.id !== item.id) : [...follows, item])}
        className={
          "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium " +
          (on ? "border-cobalt bg-cobalt-soft text-cobalt-2" : "border-line bg-surface text-ink hover:border-cobalt")
        }
      >
        <Star aria-hidden className="h-4 w-4" fill={on ? "currentColor" : "none"} />
        {on ? "Following" : "Follow"}
      </button>
      <span className="text-xs text-ink-3">Saved on this device only.</span>
    </div>
  );
}

export function FollowingList() {
  const follows = useFollows();
  if (!follows.length) {
    return (
      <p className="text-sm text-ink-3">
        You are not following any teams yet. Use <span className="font-medium">Follow</span> on a team or school page; follows stay in this
        browser only.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {follows.map((f) => (
        <li key={f.id} className="flex items-center gap-1 rounded border border-line bg-surface pl-2.5 text-sm">
          <Link href={f.href} className="link py-1">
            {f.label}
          </Link>
          <button
            type="button"
            onClick={() => writeFollows(follows.filter((x) => x.id !== f.id))}
            className="px-2 py-1 text-ink-3 hover:text-red-ink"
            aria-label={`Unfollow ${f.label}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Correction details download (used when no destination configured) */
/* ---------------------------------------------------------------- */
export function CorrectionDownload({ context }: { context: Record<string, string> }) {
  const [what, setWhat] = useState("");
  const [evidence, setEvidence] = useState("");
  const download = () => {
    const body = [
      "scly.io correction details",
      `Generated: ${new Date().toISOString()}`,
      ...Object.entries(context).map(([k, v]) => `${k}: ${v}`),
      "",
      "What is wrong:",
      what || "(not provided)",
      "",
      "Evidence / official source:",
      evidence || "(not provided)",
      "",
      "Result data errors belong to the source archive: https://github.com/Duosmium/duosmium/issues",
      "Identity mappings (school aliases, team labels) are fixed in data/mappings/ of the scly.io repository.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sclyio-correction.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor="corr-what">
        What is wrong?
      </label>
      <textarea id="corr-what" value={what} onChange={(e) => setWhat(e.target.value)} rows={3} className="rounded border border-line bg-surface p-2 text-sm" />
      <label className="text-sm font-medium" htmlFor="corr-ev">
        Evidence or official source link
      </label>
      <textarea id="corr-ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={2} className="rounded border border-line bg-surface p-2 text-sm" />
      <div>
        <button type="button" onClick={download} className="rounded bg-cobalt px-3 py-1.5 text-sm font-medium text-white hover:bg-cobalt-2">
          Download correction details
        </button>
        <p className="mt-1 text-xs text-ink-3">
          Nothing is submitted from this page. The file is created in your browser for you to send to the maintainers.
        </p>
      </div>
    </div>
  );
}
