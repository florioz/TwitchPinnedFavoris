import('./serviceWorker.js').catch((error) => {
  console.error('[TFR] Firefox background failed', error);
});
