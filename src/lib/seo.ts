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
