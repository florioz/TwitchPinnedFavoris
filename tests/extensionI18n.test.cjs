const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../src/contentScripts/extensionI18n.js');

test('extension i18n selects a supported locale and interpolates values', () => {
  assert.match(i18n.locale, /^(fr|en)$/);
  assert.equal(
    i18n.t('panel.viewers', { count: '1,234' }),
    i18n.locale === 'fr' ? '1,234 spectateurs' : '1,234 viewers'
  );
  assert.equal(i18n.t('missing.key'), 'missing.key');
});

test('document translations update text, placeholders and labels', () => {
  const textElement = { dataset: { i18n: 'vods.title' }, textContent: '' };
  const inputElement = { dataset: { i18nPlaceholder: 'vods.search' }, placeholder: '' };
  const labelElement = {
    dataset: { i18nAriaLabel: 'vods.filters' },
    setAttribute(name, value) {
      this[name] = value;
    }
  };
  const documentRef = {
    documentElement: { dataset: { i18nTitle: 'vods.pageTitle' }, lang: '' },
    title: '',
    querySelectorAll(selector) {
      return {
        '[data-i18n]': [textElement],
        '[data-i18n-placeholder]': [inputElement],
        '[data-i18n-aria-label]': [labelElement]
      }[selector] || [];
    }
  };

  i18n.applyDocument(documentRef);

  assert.equal(documentRef.documentElement.lang, i18n.locale);
  assert.equal(
    documentRef.title,
    i18n.locale === 'fr'
      ? 'Planning VODs - Twitch Favorites Sidebar'
      : 'VOD Schedule - Twitch Favorites Sidebar'
  );
  assert.equal(textElement.textContent, i18n.locale === 'fr' ? 'Planning VODs' : 'VOD Schedule');
  assert.equal(
    inputElement.placeholder,
    i18n.locale === 'fr' ? 'Streamer ou titre de VOD' : 'Streamer or VOD title'
  );
  assert.equal(labelElement['aria-label'], i18n.locale === 'fr' ? 'Filtres du planning' : 'Schedule filters');
});
