export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="py-10">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-64 animate-pulse rounded bg-line-2" />
      <div className="mt-6 grid gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-line-2" />
        ))}
      </div>
    </div>
  );
}
