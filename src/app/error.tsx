"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const unavailable = error.message.includes("npm run setup") || error.name === "DataUnavailableError";
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-xl font-semibold">{unavailable ? "Data not available yet" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-ink-3">
        {unavailable
          ? "The ratings database has not been built on this server. An operator needs to run the import and rating rebuild (npm run setup)."
          : "This page could not be loaded. The error has been logged on the server."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className="rounded bg-cobalt px-3 py-1.5 text-sm font-medium text-white hover:bg-cobalt-2">
          Try again
        </button>
        <Link href="/" className="rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-cobalt">
          Home
        </Link>
      </div>
    </div>
  );
}
