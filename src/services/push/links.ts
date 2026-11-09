/**
 * Normalizes a notification `link` to an absolute URL.
 *
 * NC35 emits absolute links (server#59608) but earlier versions still send
 * relative forms, so every shape is normalized at the parse boundary and the
 * store only ever holds absolute URLs.
 */
export function resolveNotificationLink(link: string, baseUrl: string): string {
  if (!link) return '';
  if (/^https?:\/\//i.test(link)) return link;
  if (link.startsWith('//')) return `https:${link}`;
  const base = baseUrl.replace(/\/+$/, '');
  if (link.startsWith('/')) return base + link;
  return `${base}/${link}`;
}
