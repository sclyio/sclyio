"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <h1>Error</h1>
      <p>This page could not be loaded.</p>
      <button onClick={reset}>Try again</button>
    </>
  );
}
