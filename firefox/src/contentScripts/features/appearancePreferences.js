(() => {
  const createSanitizer = (values, fallback) => {
    const allowed = new Set(values);
    return (value) => (allowed.has(value) ? value : fallback);
  };

  const sanitizeStreamerItemStyle = createSanitizer([
    'default', 'compact', 'card', 'soft-card', 'outline', 'left-line',
    'avatar-ring', 'avatar-square', 'neon', 'viewer-badge', 'game-focus',
    'title-focus', 'glass', 'minimal', 'avatar-grid'
  ], 'default');

  const sanitizeSidebarSurfaceStyle = createSanitizer([
    'default', 'full', 'panel', 'glow', 'rail', 'connected', 'layers',
    'canvas', 'edge', 'spectrum', 'pulse', 'poster', 'arcade'
  ], 'default');

  const sanitizeSidebarAnimationStyle = createSanitizer([
    'none', 'soft', 'slide', 'pop', 'glow', 'fly', 'bounce', 'spin', 'glitch'
  ], 'soft');

  const sanitizeAutoCompactGroupStyle = createSanitizer([
    'default', 'dense', 'vertical'
  ], 'default');

  window.TFRAppearancePreferences = Object.freeze({
    sanitizeStreamerItemStyle,
    sanitizeSidebarSurfaceStyle,
    sanitizeSidebarAnimationStyle,
    sanitizeAutoCompactGroupStyle
  });
})();
