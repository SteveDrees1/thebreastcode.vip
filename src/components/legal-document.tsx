import type { ReactNode } from "react";

export interface LegalSection {
  title: string;
  paragraphs: string[];
  /**
   * Marks a section a reader must not skim past — currently the cancellation
   * waiver, which removes a statutory right. Rendered with a visible callout
   * rather than only bold text, so it is distinguishable without relying on
   * weight alone.
   */
  important?: boolean;
}

/**
 * Shared chrome for the terms and privacy pages.
 *
 * Legal text is long, and long text is where readability decides whether
 * anyone actually reads it. So: a real prose measure, numbered sections that
 * can be linked to and cited, and headings that are anchors — a support reply
 * saying "see clause 5" is useless if clause 5 has no URL.
 */
export function LegalDocument({
  eyebrow,
  title,
  lastUpdated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return (
    <div className="mx-auto max-w-prose">
      <p className="label label-copper">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-faint">
        Last updated{" "}
        <time dateTime={lastUpdated}>
          {new Date(`${lastUpdated}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </p>

      {intro ? <p className="mt-5 leading-relaxed text-muted">{intro}</p> : null}

      {/* A table of contents earns its place once a document runs past a
          screenful — it is how someone finds the one clause they came for. */}
      <nav aria-label="Contents" className="panel mt-8 p-5">
        <p className="label">Contents</p>
        <ol className="mt-3 space-y-1.5 text-sm">
          {sections.map((section, i) => (
            <li key={section.title} className="flex gap-3">
              <span className="label label-copper w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <a
                href={`#${slug(section.title)}`}
                className="text-muted underline-offset-2 transition hover:text-copper hover:underline"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <hr className="rule mt-8 mb-2" />

      {sections.map((section, i) => (
        <section
          key={section.title}
          id={slug(section.title)}
          className="scroll-mt-24 border-b border-line py-7"
        >
          <span className="label label-copper">{String(i + 1).padStart(2, "0")}</span>
          <h2 className="mt-2.5 font-display text-xl font-semibold">{section.title}</h2>

          <div
            className={
              section.important
                ? "mt-3 border-l-2 border-copper pl-4 [&>p]:mt-3 [&>p:first-child]:mt-0"
                : "[&>p]:mt-2.5"
            }
          >
            {section.paragraphs.map((paragraph, p) => (
              <p key={p} className="leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
