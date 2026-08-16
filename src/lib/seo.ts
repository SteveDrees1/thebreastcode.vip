import { brand } from "./brand";
import { env } from "./env";

/**
 * Structured data helpers.
 *
 * `safeJsonLd` is the important one. `JSON.stringify` escapes quotes but leaves
 * `<` alone, so a title containing `</script>` would close the JSON-LD element
 * early and everything after it would parse as HTML — script execution from a
 * field an admin or the importer can set. Escaping `<`, `>` and `&` keeps the
 * JSON semantically identical while making the element impossible to terminate.
 * The U+2028/U+2029 separators are escaped for the same class of reason.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Publisher identity — feeds knowledge panels and "site name" in results. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${env.siteUrl}/#organization`,
    name: brand.name,
    url: env.siteUrl,
    logo: `${env.siteUrl}/icon.svg`,
    description: brand.description,
  };
}

/** Site identity, which is what search engines use for the site-name line. */
export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${env.siteUrl}/#website`,
    name: brand.name,
    url: env.siteUrl,
    publisher: { "@id": `${env.siteUrl}/#organization` },
    inLanguage: "en-US",
  };
}

/**
 * Breadcrumbs. Search results show these instead of a bare URL, which is worth
 * more on a deep product page than almost any other markup.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${env.siteUrl}${crumb.path}`,
    })),
  };
}

/** Google truncates around 155–160 characters; this is the practical ceiling. */
const DESCRIPTION_LIMIT = 155;

/**
 * First usable description from a list of candidates, never blank.
 *
 * The old expression was `product.subtitle ?? product.description.slice(0, 155)`,
 * which has two holes. `??` only falls through on null/undefined, so a subtitle
 * stored as "" passes straight through as the description — the admin form
 * normalises empty to null, but `import:product` does not. And when every
 * candidate is blank the result is "", which makes Next omit the meta tag
 * entirely: `joinery-reference` shipped with no description at all, and its
 * Product JSON-LD carried `description: ""`.
 *
 * Blank-after-trim counts as absent here, whichever way it was stored, and the
 * caller supplies a final fallback so the return value is always non-empty.
 * Truncation lands on a word boundary with an ellipsis rather than mid-word.
 */
export function metaDescription(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const text = candidate?.trim().replace(/\s+/g, " ");
    if (!text) continue;
    if (text.length <= DESCRIPTION_LIMIT) return text;

    const cut = text.slice(0, DESCRIPTION_LIMIT);
    const lastSpace = cut.lastIndexOf(" ");
    // Only break at a space if one falls reasonably late; a very long first
    // word would otherwise leave a stub.
    return `${(lastSpace > DESCRIPTION_LIMIT * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
  }
  return brand.description;
}

/**
 * Product structured data for anything sellable — single guides and bundles
 * alike. Bundles previously emitted no JSON-LD at all despite having a title,
 * a price and an availability, so they were ineligible for the price and
 * availability treatment their component products already got.
 *
 * `description` is always present because it comes from `metaDescription`,
 * which cannot return empty. `image` is omitted rather than sent empty, since
 * an empty string is worse than an absent optional property.
 */
export function productJsonLd(item: {
  name: string;
  description: string;
  sku: string;
  path: string;
  priceCents: number;
  currency: string;
  image?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.description,
    sku: item.sku,
    brand: { "@type": "Brand", name: brand.name },
    ...(item.image ? { image: [item.image] } : {}),
    offers: {
      "@type": "Offer",
      price: (item.priceCents / 100).toFixed(2),
      priceCurrency: item.currency.toUpperCase(),
      availability: "https://schema.org/InStock",
      url: `${env.siteUrl}${item.path}`,
      seller: { "@id": `${env.siteUrl}/#organization` },
    },
  };
}

/** Catalog listing, so the index page can rank as a collection. */
export function itemListJsonLd(items: Array<{ title: string; slug: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: `${env.siteUrl}/catalog/${item.slug}`,
    })),
  };
}
