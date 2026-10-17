export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!path) return '/';

  if (path.startsWith('content://') || (path.startsWith('file://') && /\.ics$/i.test(path))) {
    return `/event/import?uri=${encodeURIComponent(path)}`;
  }

  // A file:// URI is not a valid in-app route — never hand it to the router.
  if (path.startsWith('file://')) return '/';

  return path;
}
