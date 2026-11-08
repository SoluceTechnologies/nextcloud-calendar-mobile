function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function contrastFor(hex: string) {
  try {
    const { r, g, b } = hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62
      ? { text: '#1c1c1e', subtext: 'rgba(0,0,0,0.6)', border: 'rgba(0,0,0,0.14)' }
      : { text: '#ffffff', subtext: 'rgba(255,255,255,0.85)', border: 'rgba(255,255,255,0.35)' };
  } catch {
    return { text: '#ffffff', subtext: 'rgba(255,255,255,0.85)', border: 'rgba(255,255,255,0.35)' };
  }
}
