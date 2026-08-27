export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!path) return '/';

  try {
    if (path.startsWith('content://') || (path.startsWith('file://') && /\.ics$/i.test(path))) {
      return `/event/import?uri=${encodeURIComponent(path)}`;
    }
  } catch {
    return '/';
  }

  return path;
}
