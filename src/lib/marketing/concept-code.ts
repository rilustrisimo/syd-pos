/**
 * A short, URL-safe concept code ("ctr-delivery-reel") used as the Meta ad
 * name and the link's utm_content. Dependency-free so server routes can
 * import it (formats.ts re-exports it for the client).
 */
export function toConceptCode(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}
