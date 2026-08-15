import Link from "next/link";

/**
 * Branded 404.
 *
 * Also what an unauthorised visitor sees at /admin — `requireConsole` calls
 * `notFound()` rather than returning 403 so the console is indistinguishable
 * from a URL that does not exist. That is why nothing here hints that anything
 * is hidden, and why the copy is about a missing page rather than permission.
 *
 * The joke is deliberately mild: the profanity is masked the way a shop poster
 * would mask it, so the page is safe on a work screen and does not read as
 * hostile to someone who simply mistyped a URL.
 */
export const metadata = { title: "Not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <p className="label label-copper">Error 404 · Rev A</p>

      <div className="mt-8 flex justify-center">
        <HammerAndThumb />
      </div>

      <h1 className="mt-8 font-display text-4xl font-bold tracking-tight">
        Well. <span className="text-copper">$#@!%.</span>
      </h1>

      <p className="mt-4 text-lg text-muted">
        Measured twice. Swung once. Missed entirely.
      </p>
      <p className="mt-2 text-muted">
        This page isn&rsquo;t where it should be — a bit like your thumb just
        then. Let&rsquo;s get you back to something square.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/catalog" className="btn btn-primary">
          Browse the catalog
        </Link>
        <Link href="/" className="btn btn-ghost">
          Back to the bench
        </Link>
      </div>

      <p className="label mt-10">
        If you followed a link here, it was our layout error, not yours.
      </p>
    </div>
  );
}

/**
 * Inline SVG so there is no image request and it inherits the theme.
 *
 * The swing is a CSS animation defined in globals.css, disabled under
 * `prefers-reduced-motion` — a hammer swinging on loop is exactly the kind of
 * thing that makes a page unusable for someone sensitive to motion.
 */
function HammerAndThumb() {
  return (
    <svg
      viewBox="0 0 220 150"
      className="h-40 w-auto"
      role="img"
      aria-label="A hammer coming down on a thumb, missing the nail entirely"
    >
      {/* Bench */}
      <rect x="18" y="112" width="184" height="9" rx="2" fill="var(--color-surface-2)" />
      <rect x="18" y="121" width="184" height="4" rx="1" fill="var(--color-line)" />

      {/* The nail, standing proud and untouched */}
      <g stroke="var(--color-faint)" strokeWidth="3" strokeLinecap="round">
        <line x1="150" y1="112" x2="150" y2="96" />
      </g>
      <ellipse cx="150" cy="95" rx="6" ry="2.5" fill="var(--color-faint)" />

      {/* Hand: a curled fist with the thumb laid out along the bench, which is
          exactly where a thumb should never be. */}
      <g fill="var(--color-muted)">
        <rect x="50" y="88" width="46" height="26" rx="11" />
        <rect x="86" y="102" width="26" height="12" rx="6" />
      </g>
      {/* Curled fingers, so the fist reads as a hand rather than a bar. */}
      <g stroke="var(--color-surface-2)" strokeWidth="1.6" strokeLinecap="round">
        <line x1="62" y1="90" x2="62" y2="112" />
        <line x1="72" y1="89" x2="72" y2="113" />
        <line x1="82" y1="90" x2="82" y2="112" />
      </g>
      {/* The thumb itself, already going copper */}
      <rect x="106" y="102" width="20" height="12" rx="6" fill="var(--color-copper)" />
      <ellipse cx="122" cy="108" rx="3.5" ry="4" fill="var(--color-copper-bright)" />

      {/* Impact burst over the thumb */}
      <g
        stroke="var(--color-copper-bright)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="impact"
      >
        <line x1="116" y1="94" x2="116" y2="84" />
        <line x1="104" y1="97" x2="96" y2="90" />
        <line x1="128" y1="97" x2="136" y2="90" />
      </g>

      {/* Hammer, mid-swing */}
      <g className="hammer">
        <rect
          x="112"
          y="18"
          width="9"
          height="62"
          rx="3"
          fill="var(--color-surface-2)"
          stroke="var(--color-line)"
          strokeWidth="1.5"
        />
        <rect x="92" y="14" width="49" height="20" rx="4" fill="var(--color-text)" />
        <path d="M92 14 L80 20 L80 28 L92 34 Z" fill="var(--color-text)" />
      </g>

      {/* Registration marks, as on every plate */}
      <g stroke="var(--color-line)" strokeWidth="1.5" strokeLinecap="square">
        <path d="M8 8 h10 M8 8 v10" fill="none" />
        <path d="M212 142 h-10 M212 142 v-10" fill="none" />
      </g>
    </svg>
  );
}
