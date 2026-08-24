(() => {
  const hexToRgb = (hex) => {
    const normalized = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)
      ? hex.slice(1)
      : '';
    if (!normalized) return null;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  };

  const hsvToHex = (hue, saturation, value) => {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, Number(saturation) || 0));
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let channels;
    if (h < 60) channels = [c, x, 0];
    else if (h < 120) channels = [x, c, 0];
    else if (h < 180) channels = [0, c, x];
    else if (h < 240) channels = [0, x, c];
    else if (h < 300) channels = [x, 0, c];
    else channels = [c, 0, x];
    return `#${channels
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  };

  const hslToHex = (hue, saturation, lightness) => {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, Number(saturation) || 0));
    const l = Math.max(0, Math.min(1, Number(lightness) || 0));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let channels;
    if (h < 60) channels = [c, x, 0];
    else if (h < 120) channels = [x, c, 0];
    else if (h < 180) channels = [0, c, x];
    else if (h < 240) channels = [0, x, c];
    else if (h < 300) channels = [x, 0, c];
    else channels = [c, 0, x];
    return `#${channels
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  };

  const randomHue = (random = Math.random) => {
    const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    return Math.floor(sample * 360);
  };

  const categoryColorFromHue = (hue) => hslToHex(hue, 0.72, 0.58);

  window.TFRColorTools = Object.freeze({
    categoryColorFromHue,
    hexToRgb,
    hslToHex,
    hsvToHex,
    randomHue
  });
})();
