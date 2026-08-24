const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getLiveDataEntry,
  normalizeCategoryName,
  sanitizeCategoryList,
  shouldDisplayFavorite
} = require('../src/contentScripts/features/favoriteVisibilityTools.js');

test('category names are normalized without accents or surrounding whitespace', () => {
  assert.equal(normalizeCategoryName('  Pokémon Écarlate  '), 'pokemon ecarlate');
});

test('category lists keep their original labels while removing normalized duplicates', () => {
  assert.deepEqual(
    sanitizeCategoryList([' Pokémon ', 'pokemon', '', null, 'Just Chatting']),
    ['Pokémon', 'Just Chatting']
  );
});

test('favorite visibility applies category filters consistently', () => {
  const favorite = { categoryFilter: { enabled: true, categories: ['Pokémon'] } };
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: 'Pokemon' }), true);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: 'Minecraft' }), false);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: false, game: 'Pokemon' }), false);
});

test('temporarily unknown Twitch categories keep detected live favorites visible', () => {
  const favorite = { categoryFilter: { enabled: true, categories: ['Pokémon'] } };
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: '', fetchFailed: true }), true);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: '', inferredFromPage: true }), true);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: '' }), false);
});

test('live data lookup accepts normalized and original login keys', () => {
  const normalized = { alpha: { isLive: true } };
  const original = { Alpha: { isLive: true } };
  assert.equal(getLiveDataEntry(normalized, { login: 'Alpha' }), normalized.alpha);
  assert.equal(getLiveDataEntry(original, 'Alpha'), original.Alpha);
  assert.equal(getLiveDataEntry(normalized, ''), null);
});
