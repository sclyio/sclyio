import Link from "next/link";
import { Menu, Search } from "lucide-react";

export function Wordmark() {
  return (
    <span className="inline-flex items-baseline gap-0.5 font-semibold tracking-tight" aria-label="scly.io">
      <span className="text-[1.15rem] text-ink">scly</span>
      <span className="relative text-[1.15rem] text-cobalt">
        .io
        <span aria-hidden className="absolute -bottom-0.5 left-0 h-[3px] w-full rounded-sm bg-lime" />
      </span>
    </span>
  );
}

const NAV = [
  { href: "/rankings", label: "Rankings" },
  { href: "/teams", label: "Teams" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "How It Works" },
];

function SearchForm({ id }: { id: string }) {
  return (
    <form action="/search" method="get" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search schools, teams, and tournaments
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        id={id}
        name="q"
        type="search"
        required
        minLength={2}
        placeholder="Search schools, teams, tournaments"
        className="w-full rounded-md border border-line bg-bg py-1.5 pr-3 pl-8 text-sm placeholder:text-ink-3 hover:border-ink-3"
      />
    </form>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0" aria-label="scly.io home">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm font-medium">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded px-2.5 py-1.5 text-ink-2 hover:bg-line-2 hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden w-full max-w-sm md:block">
          <SearchForm id="global-search" />
        </div>
        <details className="relative ml-auto md:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded border border-line px-2 py-1.5 text-sm">
            <Menu aria-hidden className="h-4 w-4" /> Menu
          </summary>
          <div className="absolute right-0 mt-2 w-[min(90vw,22rem)] rounded-md border border-line bg-surface p-3 shadow-lg">
            <SearchForm id="global-search-mobile" />
            <ul className="mt-2 grid gap-1 text-sm font-medium">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="block rounded px-2 py-2 hover:bg-line-2">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/data" className="block rounded px-2 py-2 hover:bg-line-2">
                  Data coverage
                </Link>
              </li>
            </ul>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-6 px-4 py-8 text-sm text-ink-3 md:grid-cols-3">
        <div>
          <Wordmark />
          <p className="mt-2">
            Universal SciOly Rating — an independent, experimental rating of Science Olympiad teams among indexed tournaments. Not affiliated
            with Science Olympiad, Inc.
          </p>
        </div>
        <div>
          <p className="font-medium text-ink">Attribution</p>
          <p className="mt-1">
            Results sourced from{" "}
            <a className="link" href="https://www.duosmium.org/results/">
              Duosmium
            </a>{" "}
            (
            <a className="link" href="https://github.com/Duosmium/duosmium">
              repository
            </a>
            , MIT License), interpreted with{" "}
            <a className="link" href="https://github.com/Duosmium/sciolyff-js">
              sciolyff
            </a>
            . Rating methodology informed by SentientTree&apos;s 2026 SO Rankings; scly.io adaptations are documented on the{" "}
            <Link className="link" href="/methodology">
              methodology page
            </Link>
            .
          </p>
        </div>
        <div>
          <p className="font-medium text-ink">Site</p>
          <ul className="mt-1 grid gap-1">
            <li>
              <Link className="link" href="/data">
                Data coverage &amp; corrections
              </Link>
            </li>
            <li>
              <Link className="link" href="/methodology">
                How ratings work
              </Link>
            </li>
            <li>No accounts. Follows are stored only on your device.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
