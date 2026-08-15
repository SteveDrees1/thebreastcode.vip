/**
 * Navigation feedback.
 *
 * Every page here renders per request (the header depends on the session), so
 * a slow database or a cold lambda would otherwise leave the previous page on
 * screen with no sign anything is happening. A skeleton in the shape of the
 * page is calmer than a spinner and avoids the layout jump when content lands.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="h-3 w-32 rounded bg-surface-2" />
      <div className="mt-5 h-10 w-72 max-w-full rounded bg-surface-2" />
      <div className="mt-4 h-4 w-full max-w-lg rounded bg-surface" />

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel overflow-hidden">
            <div className="aspect-[3/4] bg-surface-2" />
            <div className="border-t border-line p-4">
              <div className="h-4 w-3/4 rounded bg-surface-2" />
              <div className="mt-2.5 h-3 w-1/2 rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
