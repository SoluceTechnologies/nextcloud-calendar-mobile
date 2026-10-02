export interface WindowDims {
  width: number;
  height: number;
}

export function isTablet(width: number, height: number): boolean {
  return Math.min(width, height) >= 600;
}

const MULTIWINDOW_MARGIN = 8;

export function isMultiWindow(win: WindowDims, screen: WindowDims): boolean {
  return (
    win.width < screen.width - MULTIWINDOW_MARGIN &&
    win.height < screen.height - MULTIWINDOW_MARGIN
  );
}

export function shouldLockPortrait(win: WindowDims, screen: WindowDims): boolean {
  return !isMultiWindow(win, screen) && !isTablet(win.width, win.height);
}
