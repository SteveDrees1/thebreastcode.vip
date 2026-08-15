import { ImageResponse } from "next/og";

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
export const alt = "The Breast Code — print-ready reference plate sets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COPPER = "#e0913f";
const INK = "#07080a";
const TEXT = "#e9ecf1";
const MUTED = "#98a1b1";

/** The trim marks that appear on every printed plate. */
function RegistrationMark({
  style,
}: {
  style: React.CSSProperties;
}) {
  return (
    <div style={{ position: "absolute", display: "flex", ...style }}>
      <div style={{ position: "absolute", width: 28, height: 2, background: COPPER }} />
      <div style={{ position: "absolute", width: 2, height: 28, background: COPPER, left: 13 }} />
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
        <RegistrationMark style={{ top: 28, left: 28 }} />
        <RegistrationMark style={{ top: 28, right: 42 }} />
        <RegistrationMark style={{ bottom: 42, left: 28 }} />
        <RegistrationMark style={{ bottom: 42, right: 42 }} />

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
            Original Reference Series
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
          <span>Format Letter</span>
          <span>Scale N.T.S.</span>
          <span>Full bleed</span>
          <span style={{ marginLeft: "auto", color: TEXT }}>thebreastcode.vip</span>
        </div>
      </div>
    ),
    size,
  );
}
