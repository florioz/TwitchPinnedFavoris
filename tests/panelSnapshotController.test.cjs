const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPanelSnapshotController
} = require('../src/contentScripts/panelSnapshotController.js');

const createHarness = ({
  response = { liveData: { one: {} } },
  requestError = null,
  liveDataPresent = false
} = {}) => {
  const classes = [];
  const rendered = [];
  const requests = [];
  const subtitle = { textContent: '' };
  const controller = createPanelSnapshotController({
    requestSnapshot: async (force) => {
      requests.push(force);
      if (requestError) throw requestError;
      return response;
    },
    renderSnapshot: (snapshot) => rendered.push(snapshot),
    getPanelRoot: () => ({
      classList: {
        add(value) {
          classes.push(`add:${value}`);
        },
        remove(value) {
          classes.push(`remove:${value}`);
        }
      }
    }),
    getSubtitle: () => subtitle,
    hasLiveData: () => liveDataPresent
  });
  return { controller, classes, rendered, requests, subtitle };
};

test('empty cache shows loading and renders the received snapshot', async () => {
  const { controller, classes, rendered, requests } = createHarness();

  assert.equal(await controller.refresh(false), true);
  assert.deepEqual(requests, [false]);
  assert.deepEqual(classes, [
    'add:tfr-panel--loading',
    'remove:tfr-panel--loading'
  ]);
  assert.equal(rendered.length, 1);
});

test('silent refresh avoids the loading class', async () => {
  const { controller, classes } = createHarness({ liveDataPresent: true });
  await controller.refresh(true, { showLoading: false });
  assert.deepEqual(classes, []);
});

test('request failure removes loading and displays an error', async () => {
  const { controller, classes, subtitle } = createHarness({
    requestError: new Error('offline')
  });

  assert.equal(await controller.refresh(true), false);
  assert.equal(classes.at(-1), 'remove:tfr-panel--loading');
  assert.equal(subtitle.textContent, 'Impossible de récupérer les favoris.');
});

test('preload ignores invalid snapshots without showing an error', async () => {
  const { controller, rendered, subtitle } = createHarness({
    response: { error: true }
  });

  assert.equal(await controller.preload(), false);
  assert.equal(rendered.length, 0);
  assert.equal(subtitle.textContent, '');
});
