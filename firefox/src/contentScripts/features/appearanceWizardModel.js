(() => {
  const STYLE_VALUES = Object.freeze({
    category: Object.freeze([
      'gradient', 'solid', 'stripe', 'glow', 'glass', 'outline', 'minimal', 'dot',
      'rail', 'double', 'soft-card', 'soft-neon', 'ribbon', 'count-badge', 'ink',
      'compact', 'parent-accent'
    ]),
    streamer: Object.freeze([
      'default', 'compact', 'card', 'soft-card', 'outline', 'left-line',
      'avatar-ring', 'avatar-square', 'neon', 'viewer-badge', 'game-focus',
      'title-focus', 'glass', 'minimal', 'avatar-grid'
    ]),
    surface: Object.freeze([
      'default', 'full', 'panel', 'glow', 'rail', 'connected', 'layers', 'canvas',
      'edge', 'spectrum', 'pulse', 'poster', 'arcade'
    ])
  });

  const FAMILY_DEFINITIONS = Object.freeze({
    category: Object.freeze([
      ['classic', ['gradient', 'solid', 'soft-card', 'glass']],
      ['lines', ['stripe', 'outline', 'rail', 'double']],
      ['light', ['minimal', 'dot', 'compact', 'count-badge']],
      ['effects', ['glow', 'soft-neon', 'ribbon', 'ink', 'parent-accent']]
    ]),
    streamer: Object.freeze([
      ['classic', ['default', 'card', 'soft-card', 'glass']],
      ['compact', ['compact', 'minimal', 'viewer-badge']],
      ['avatar', ['avatar-ring', 'avatar-square', 'avatar-grid']],
      ['focus', ['game-focus', 'title-focus', 'left-line', 'outline']],
      ['effects', ['neon']]
    ]),
    surface: Object.freeze([
      ['classic', ['default', 'full', 'panel', 'connected']],
      ['lines', ['rail', 'edge']],
      ['depth', ['layers', 'canvas', 'poster']],
      ['effects', ['glow', 'spectrum', 'pulse', 'arcade']]
    ])
  });

  const SPECIFIC_DESCRIPTIONS = Object.freeze({
    category: new Set(['gradient', 'rail', 'soft-card', 'outline', 'minimal', 'parent-accent']),
    streamer: new Set(['default', 'soft-card', 'compact', 'minimal', 'avatar-ring', 'avatar-grid']),
    surface: new Set(['default', 'panel', 'rail', 'full', 'glow', 'canvas'])
  });

  const createAppearanceWizardModel = ({ t, store }) => {
    const getValues = (kind) => [...(STYLE_VALUES[kind] || [])];

    const labelFor = (kind, style) => t({
      category: `categoryAppearance.style.${style}`,
      streamer: `streamerAppearance.style.${style}`,
      surface: `sidebarSurface.style.${style}`
    }[kind]);

    const descriptionFor = (kind, style) => t(
      SPECIFIC_DESCRIPTIONS[kind]?.has(style)
        ? `appearance.description.${kind}.${style}`
        : `appearance.description.${kind}.other`
    );

    const createFamilies = (kind, values = getValues(kind)) => (
      (FAMILY_DEFINITIONS[kind] || []).map(([id, familyValues]) => ({
        id,
        label: t(`appearance.family.${id}`),
        description: t(`appearance.family.${id}.description`),
        values: familyValues.filter((style) => values.includes(style))
      })).filter((family) => family.values.length)
    );

    const createSteps = (preferences = {}) => ([
      {
        kind: 'category',
        label: t('appearance.wizard.groups'),
        value: store.sanitizeCategoryColorStyle?.(preferences.categoryColorStyle) || 'gradient',
        apply: (style) => store.setCategoryColorStyle(style)
      },
      {
        kind: 'streamer',
        label: t('appearance.wizard.streamers'),
        value: store.sanitizeStreamerItemStyle?.(preferences.streamerItemStyle) || 'default',
        apply: (style) => store.setStreamerItemStyle(style)
      },
      {
        kind: 'surface',
        label: t('appearance.wizard.surface'),
        value: store.sanitizeSidebarSurfaceStyle?.(preferences.sidebarSurfaceStyle) || 'default',
        apply: (style) => store.setSidebarSurfaceStyle(style)
      }
    ].map((step) => ({
      ...step,
      values: getValues(step.kind),
      labelFor: (style) => labelFor(step.kind, style),
      descriptionFor: (style) => descriptionFor(step.kind, style)
    })));

    const clampStep = (step, count = 3) => Math.max(0, Math.min(count - 1, Number(step) || 0));
    const nextStep = (step, count = 3) => clampStep(step, count) === count - 1
      ? 0
      : clampStep(step, count) + 1;

    return { getValues, labelFor, descriptionFor, createFamilies, createSteps, clampStep, nextStep };
  };

  window.TFRAppearanceWizardModel = { create: createAppearanceWizardModel };
})();
