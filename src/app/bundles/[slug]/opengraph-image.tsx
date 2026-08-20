import { ImageResponse } from "next/og";
import { getBundleBySlug, getBundleContents } from "@/lib/catalog";
import { brand, palette } from "@/lib/brand";

/**
 * Per-bundle social card.
 *
 * Bundles had none. The page sets an `openGraph` block in its metadata, and a
 * segment that declares `openGraph` without `images` does not inherit the
 * root's file-based card — so a shared bundle link rendered with no image at
 * all, not even the site default. Verified in the served HTML: the product
 * page emitted `og:image`, the bundle page emitted nothing.
 *
 * Deliberately not a copy of the product card. A bundle's distinguishing fact
 * is what is in it, so the corner carries the set count and the sets are named
 * down the side — a reader should be able to tell the two card types apart at
 * thumbnail size.
 */
export const alt = "Series bundle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const { copper: COPPER, ink: INK, text: TEXT, muted: MUTED } = palette;

/**
 * A `+` trim mark, the brand's signature corner element.
 *
 * The box is sized on purpose. Without a width and height both bars anchored
 * to the container's top-left, so the vertical one hung *below* the horizontal
 * one and every corner rendered as `⊤` rather than `+` — on the images that
 * represent every shared link. It also made the callers compensate with
 * mismatched insets, which is why the marks sat 28px from the top and left but
 * 14px from the bottom and right.
 */
const MARK = 28;

function RegistrationMark({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        width: MARK,
        height: MARK,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: MARK / 2 - 1,
          left: 0,
          width: MARK,
          height: 2,
          background: COPPER,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: MARK / 2 - 1,
          width: 2,
          height: MARK,
          background: COPPER,
        }}
      />
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // A card is not worth a 500. If the lookup fails, fall back to the shop name.
  const bundle = await getBundleBySlug(slug).catch(() => undefined);
  const contents = bundle ? await getBundleContents(bundle.id).catch(() => []) : [];

  const title = bundle?.title ?? brand.name;
  const subtitle = bundle?.subtitle ?? brand.tagline;

  // Long titles need to step down a size or they overflow the card.
  const titleSize = title.length > 40 ? 58 : title.length > 26 ? 70 : 86;
  // Four is what fits beside the title without crowding it; the rest are
  // counted rather than dropped silently.
  const listed = contents.slice(0, 4);
  const overflow = contents.length - listed.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 64,
          position: "relative",
        }}
      >
        {/* Equal inset on all four sides, now that the mark has a known size. */}
        <RegistrationMark style={{ top: 28, left: 28 }} />
        <RegistrationMark style={{ top: 28, right: 28 }} />
        <RegistrationMark style={{ bottom: 28, left: 28 }} />
        <RegistrationMark style={{ bottom: 28, right: 28 }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22 }}>
          <span style={{ letterSpacing: 6, color: MUTED, textTransform: "uppercase" }}>
            {brand.seriesName}
          </span>
          {contents.length > 0 ? (
            <span style={{ letterSpacing: 4, color: COPPER }}>
              {contents.length} SETS
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 90, height: 3, background: COPPER }} />
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: titleSize,
              fontWeight: 700,
              color: TEXT,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {listed.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 22,
                fontSize: 26,
                color: MUTED,
              }}
            >
              {listed.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}
                >
                  <div style={{ display: "flex", width: 18, height: 2, background: COPPER }} />
                  {item.title}
                </div>
              ))}
              {overflow > 0 ? (
                <div style={{ display: "flex", marginTop: 6, marginLeft: 32 }}>
                  and {overflow} more
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: MUTED }}>
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            borderTop: `2px solid ${COPPER}`,
            paddingTop: 20,
            gap: 48,
            fontSize: 20,
            letterSpacing: 3,
            color: MUTED,
            textTransform: "uppercase",
          }}
        >
          <span>Series Bundle</span>
          <span>PDF · Letter</span>
          <span>Scale N.T.S.</span>
          <span style={{ marginLeft: "auto", color: TEXT }}>{brand.domain}</span>
        </div>
      </div>
    ),
    size,
  );
}
