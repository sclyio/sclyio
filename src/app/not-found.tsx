import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-ink-3">
        That school, team, or tournament is not in the indexed dataset. Team pages are per season, and some result files are not imported —
        see{" "}
        <Link className="link" href="/data">
          data coverage
        </Link>
        .
      </p>
      <form action="/search" className="mt-5 flex justify-center gap-2" role="search">
        <label htmlFor="nf-q" className="sr-only">
          Search
        </label>
        <input id="nf-q" name="q" required minLength={2} placeholder="Search again" className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm" />
        <button className="rounded bg-cobalt px-3 py-1.5 text-sm font-medium text-white hover:bg-cobalt-2">Search</button>
      </form>
    </div>
  );
}
