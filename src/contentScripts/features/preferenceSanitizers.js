(() => {
  'use strict';
  const CHAT_SOUNDS = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert']);
  const CHAT_FONTS = new Set(['system', 'arial', 'verdana', 'georgia', 'monospace', 'custom']);
  const TOAST_POSITIONS = new Set(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
  const AUDIO_COMPRESSOR_PRESETS = new Set(['soft', 'balanced', 'strong']);

  const boundedInteger = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
  };

  const create = ({ sanitizeColor, appearance }) => Object.freeze({
    boundedInteger,
    recentLiveThreshold: (value) => boundedInteger(value, 1, 120, 10),
    chatPadding: (value) => boundedInteger(value, 0, 20, 0),
    chatMentionColor: (value) => sanitizeColor(value) || '#9147ff',
    chatMentionSound: (value) => CHAT_SOUNDS.has(value) ? value : 'soft',
    liveHoverPreviewMode: (value) => value === 'video' ? 'video' : 'image',
    playerAudioCompressorPreset: (value) => AUDIO_COMPRESSOR_PRESETS.has(value) ? value : 'balanced',
    chatFontFamily: (value) => CHAT_FONTS.has(value) ? value : 'system',
    chatFontDataUrl: (value) => {
      const candidate = typeof value === 'string' ? value.trim() : '';
      return /^data:(font\/|application\/(?:font|octet-stream))/.test(candidate) && candidate.length <= 4_200_000
        ? candidate : '';
    },
    categoryOpacity: (value) => boundedInteger(value, 0, 30, 7),
    categoryGradient: (value) => boundedInteger(value, 0, 100, 62),
    streamerStyle: (value) => appearance.sanitizeStreamerItemStyle(value),
    surfaceStyle: (value) => appearance.sanitizeSidebarSurfaceStyle(value),
    compactGroupStyle: (value) => appearance.sanitizeAutoCompactGroupStyle(value),
    animationStyle: (value) => appearance.sanitizeSidebarAnimationStyle(value),
    toastDuration: (value) => boundedInteger(value, 2, 60, 6),
    toastPosition: (value) => TOAST_POSITIONS.has(value) ? value : 'top-right',
    toastSound: (value) => CHAT_SOUNDS.has(value) || value === 'custom' ? value : 'soft',
    toastVolume: (value) => boundedInteger(value, 0, 100, 35)
  });

  window.TFRPreferenceSanitizers = Object.freeze({ create, boundedInteger });
})();
