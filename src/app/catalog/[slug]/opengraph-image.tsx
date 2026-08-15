import { ImageResponse } from "next/og";
import { getProductBySlug } from "@/lib/catalog";

/**
 * Per-set social card.
 *
 * A shared product link should say which set it is, not just which shop. The
 * layout mirrors the plate cover: series line, document number, title, and the
 * spec bar along the bottom.
 */
export const alt = "Reference plate set";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COPPER = "#e0913f";
const INK = "#07080a";
const TEXT = "#e9ecf1";
const MUTED = "#98a1b1";

function RegistrationMark({ style }: { style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", display: "flex", ...style }}>
      <div style={{ position: "absolute", width: 28, height: 2, background: COPPER }} />
      <div
        style={{ position: "absolute", width: 2, height: 28, background: COPPER, left: 13 }}
      />
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // A card is not worth a 500. If the lookup fails, fall back to the shop name.
  const product = await getProductBySlug(slug).catch(() => undefined);

  const title = product?.title ?? "The Breast Code";
  const subtitle = product?.subtitle ?? "Print-ready reference plate sets";
  const docId = product?.sourceDocId;
  const plates = product?.pageCount;

  // Long titles need to step down a size or they overflow the card.
  const titleSize = title.length > 40 ? 62 : title.length > 26 ? 76 : 92;

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

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22 }}>
          <span style={{ letterSpacing: 6, color: MUTED, textTransform: "uppercase" }}>
            Original Reference Series
          </span>
          {docId ? (
            <span style={{ letterSpacing: 4, color: COPPER }}>NO. {docId}</span>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 90, height: 3, background: COPPER }} />
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: titleSize,
              fontWeight: 700,
              color: TEXT,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 28,
              color: MUTED,
              maxWidth: 900,
            }}
          >
            {subtitle}
          </div>
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
          {plates ? <span>{plates} Plates</span> : null}
          <span>PDF · Letter</span>
          <span>Scale N.T.S.</span>
          <span style={{ marginLeft: "auto", color: TEXT }}>thebreastcode.vip</span>
        </div>
      </div>
    ),
    size,
  );
}
