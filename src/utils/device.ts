export interface WindowDims {
  width: number;
  height: number;
}

export function isTablet(width: number, height: number): boolean {
  return Math.min(width, height) >= 600;
}

// Freeform/multi-window environments (Samsung DeX, split-screen, Stage
// Manager) give the app a window strictly smaller than the display on both
// axes. A small tolerance avoids false positives from insets/rounding.
const MULTIWINDOW_MARGIN = 8;

export function isMultiWindow(win: WindowDims, screen: WindowDims): boolean {
  return (
    win.width < screen.width - MULTIWINDOW_MARGIN &&
    win.height < screen.height - MULTIWINDOW_MARGIN
  );
}

// An orientation lock inside a freeform window pins it to a phone aspect
// ratio and breaks resizing/maximize (DeX), so no lock is requested there.
export function shouldLockPortrait(win: WindowDims, screen: WindowDims): boolean {
  return !isMultiWindow(win, screen) && !isTablet(win.width, win.height);
}
