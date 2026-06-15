/**
 * Decide which props a calendar instance should render with.
 *
 * react-native-big-calendar is React.memo'd, so it only rebuilds when a prop
 * changes by reference. While an instance is hidden we hand back the SAME
 * (frozen) props every render, so the memo holds and the hidden instance never
 * rebuilds. When it becomes visible we switch to the live props (one rebuild)
 * and adopt them as the new frozen baseline.
 */
export function resolveFrozenProps<T>(
  visible: boolean,
  live: T,
  frozen: T,
): { props: T; nextFrozen: T } {
  if (visible) return { props: live, nextFrozen: live };
  return { props: frozen, nextFrozen: frozen };
}
