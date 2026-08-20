import { ImageResponse } from "next/og";
import { brand, palette } from "@/lib/brand";

/**
 * Default social card.
 *
 * Drawn rather than photographed, in the same vocabulary as the plates it
 * sells: near-black ground, copper accent, corner registration marks, a mono
 * spec bar. A shared link should look like the product.
 *
 * Only system-safe layout is used — no external fonts to fetch, which keeps
 * this fast and means it cannot fail at build time on a locked-down network.
 */
export const alt = `${brand.name} — ${brand.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const { copper: COPPER, ink: INK, text: TEXT, muted: MUTED } = palette;

/**
 * The `+` trim marks that appear on every printed plate.
 *
 * The box is sized on purpose. Without a width and height both bars anchored
 * to the container's top-left, so the vertical one hung *below* the horizontal
 * one and every corner rendered as `⊤` rather than `+` — on the image that
 * represents every shared link to the shop.
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

export default function Image() {
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

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 6,
              color: COPPER,
              textTransform: "uppercase",
            }}
          >
            {brand.seriesName}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 40,
              fontSize: 82,
              fontWeight: 700,
              color: TEXT,
              lineHeight: 1.05,
            }}
          >
            <span>Reference plates</span>
            <span style={{ color: COPPER }}>built for the shop.</span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 32,
              fontSize: 28,
              color: MUTED,
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Dimensioned diagrams, spec tables and working notes — print-ready PDFs
            designed to laminate and keep at the bench.
          </div>
        </div>

        {/* The footer bar lifted from the plates themselves. */}
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
          <span>Format {brand.spec.format}</span>
          <span>Scale {brand.spec.scale}</span>
          <span>{brand.spec.print}</span>
          <span style={{ marginLeft: "auto", color: TEXT }}>{brand.domain}</span>
        </div>
      </div>
    ),
    size,
  );
}
