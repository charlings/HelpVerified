function normalise(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/**
 * True when `href` should be marked as the current page for `pathname`.
 * Prefix matches respect segment boundaries, so `/agency` never matches `/agency-x`.
 */
export function isActive(pathname: string, href: string, options: { exact?: boolean } = {}): boolean {
  const path = normalise(pathname);
  const target = normalise(href);
  if (options.exact || target === "/") return path === target;
  return path === target || path.startsWith(`${target}/`);
}
