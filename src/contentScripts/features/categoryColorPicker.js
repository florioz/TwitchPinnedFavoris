(() => {
  const create = ({ t, sanitizeColor, applyColor, colorFromEvent, onChange }) => {
  function createAction({ className = '', labelKey, titleKey = '', onActivate }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['tfr-chip-action', className].filter(Boolean).join(' ');
    button.textContent = t(labelKey);
    if (titleKey) button.title = t(titleKey);
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await onActivate();
      onChange();
    });
    return button;
  }

  function render({
    label: labelText,
    currentColor: rawColor,
    onApply,
    onClear,
    onRandomize = null
  }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-category-color-picker';

    const label = document.createElement('span');
    label.className = 'tfr-category-color-picker__label';
    label.textContent = labelText;
    wrapper.appendChild(label);

    const options = document.createElement('div');
    options.className = 'tfr-category-color-picker__options';
    const currentColor = sanitizeColor?.(rawColor) || '';
    let pendingColor = currentColor;

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'tfr-category-color-swatch tfr-category-color-swatch--picker';
    previewButton.title = t('categories.color.openPalette');
    previewButton.setAttribute('aria-label', t('categories.color.openPalette'));
    if (currentColor) {
      applyColor(previewButton, currentColor);
    } else {
      previewButton.classList.add('tfr-category-color-swatch--none');
    }
    previewButton.addEventListener('click', (event) => {
      event.stopPropagation();
      wrapper.classList.toggle('is-open');
    });
    options.appendChild(previewButton);

    const value = document.createElement('code');
    value.className = 'tfr-category-color-picker__value';
    value.textContent = currentColor || t('categories.color.none');
    options.appendChild(value);

    if (onRandomize) {
      options.appendChild(createAction({
        className: 'tfr-category-color-randomize',
        labelKey: 'categories.color.randomizeOne',
        titleKey: 'categories.color.randomizeOneDescription',
        onActivate: onRandomize
      }));
    }

    const palette = document.createElement('div');
    palette.className = 'tfr-category-color-popover';

    const updatePreview = (color) => {
      pendingColor = sanitizeColor?.(color) || '';
      value.textContent = pendingColor || t('categories.color.none');
      previewButton.classList.toggle('tfr-category-color-swatch--none', !pendingColor);
      if (pendingColor) {
        applyColor(previewButton, pendingColor);
      } else {
        previewButton.removeAttribute('data-color');
        previewButton.style.removeProperty('--tfr-category-card-tint');
        previewButton.style.removeProperty('--tfr-category-card-border');
        previewButton.style.removeProperty('--tfr-swatch-color');
      }
    };

    const wheel = document.createElement('button');
    wheel.type = 'button';
    wheel.className = 'tfr-category-color-wheel';
    wheel.setAttribute('aria-label', t('categories.color.pickFromWheel'));
    let isPicking = false;
    const pickFromWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      updatePreview(colorFromEvent(event, wheel));
    };
    wheel.addEventListener('pointerdown', (event) => {
      isPicking = true;
      wheel.setPointerCapture?.(event.pointerId);
      pickFromWheel(event);
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!isPicking) return;
      pickFromWheel(event);
    });
    wheel.addEventListener('pointerup', (event) => {
      isPicking = false;
      wheel.releasePointerCapture?.(event.pointerId);
    });
    wheel.addEventListener('pointercancel', (event) => {
      isPicking = false;
      wheel.releasePointerCapture?.(event.pointerId);
    });
    palette.appendChild(wheel);

    palette.appendChild(createAction({
      className: 'tfr-chip-action--primary',
      labelKey: 'categories.color.apply',
      onActivate: () => onApply(pendingColor)
    }));
    palette.appendChild(createAction({
      labelKey: 'categories.color.clear',
      onActivate: onClear
    }));
    options.appendChild(palette);

    wrapper.appendChild(options);
    return wrapper;
  }

    return Object.freeze({ render });
  };
  window.TFRCategoryColorPicker = Object.freeze({ create });
})();
