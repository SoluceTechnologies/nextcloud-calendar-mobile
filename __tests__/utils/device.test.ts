import { isMultiWindow, isTablet, shouldLockPortrait } from '@/utils/device';

describe('isTablet', () => {
  it('is true when the smaller side is at least 600dp', () => {
    expect(isTablet(1280, 800)).toBe(true);
    expect(isTablet(600, 600)).toBe(true);
  });

  it('is false on phone-sized windows', () => {
    expect(isTablet(390, 844)).toBe(false);
    expect(isTablet(844, 390)).toBe(false);
  });
});

describe('isMultiWindow', () => {
  const screen = { width: 1920, height: 1080 };

  it('is true when the window is smaller than the display on both axes', () => {
    expect(isMultiWindow({ width: 1280, height: 720 }, screen)).toBe(true);
  });

  it('is false for a maximized/fullscreen window', () => {
    expect(isMultiWindow(screen, screen)).toBe(false);
  });

  it('is false when only one axis shrinks (split-screen, nav bar inset)', () => {
    expect(isMultiWindow({ width: 1920, height: 540 }, screen)).toBe(false);
    expect(isMultiWindow({ width: 390, height: 760 }, { width: 390, height: 844 })).toBe(false);
  });

  it('applies an 8px tolerance before counting as multi-window', () => {
    // Up to 8px of shrinkage per axis is treated as insets/rounding.
    expect(isMultiWindow({ width: 1912, height: 1072 }, screen)).toBe(false);
    expect(isMultiWindow({ width: 1911, height: 1071 }, screen)).toBe(true);
  });
});

describe('shouldLockPortrait', () => {
  const phoneScreen = { width: 390, height: 844 };

  it('locks portrait on a phone in fullscreen', () => {
    expect(shouldLockPortrait(phoneScreen, phoneScreen)).toBe(true);
  });

  it('does not lock on tablets', () => {
    const tablet = { width: 1280, height: 800 };
    expect(shouldLockPortrait(tablet, tablet)).toBe(false);
  });

  it('does not lock inside a freeform window (DeX)', () => {
    // A small freeform window is phone-sized but must stay resizable.
    const freeform = { width: 480, height: 320 };
    const display = { width: 1920, height: 1080 };
    expect(shouldLockPortrait(freeform, display)).toBe(false);
  });
});
