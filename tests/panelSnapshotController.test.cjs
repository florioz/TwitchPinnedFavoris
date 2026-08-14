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
  const refreshStates = [];
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
    hasLiveData: () => liveDataPresent,
    feedbackMinDurationMs: 0,
    setRefreshState: (state) => refreshStates.push(state)
  });
  return { controller, classes, rendered, requests, subtitle, refreshStates };
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
  const { controller, classes, subtitle, refreshStates } = createHarness({
    requestError: new Error('offline')
  });

  assert.equal(await controller.refresh(true), false);
  assert.equal(classes.at(-1), 'remove:tfr-panel--loading');
  assert.deepEqual(refreshStates, []);
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

test('successful refresh exposes feedback and shares concurrent requests', async () => {
  let resolveRequest;
  let requestCount = 0;
  const states = [];
  const controller = createPanelSnapshotController({
    requestSnapshot: () => {
      requestCount += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
    renderSnapshot() {},
    getPanelRoot: () => ({ classList: { add() {}, remove() {} } }),
    getSubtitle: () => null,
    hasLiveData: () => true,
    feedbackMinDurationMs: 0,
    setRefreshState: (state) => states.push(state)
  });

  const first = controller.refresh(true, { showFeedback: true });
  const second = controller.refresh(true, { showFeedback: true });
  assert.equal(requestCount, 1);
  resolveRequest({ liveData: { one: {} } });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(states, ['loading', 'success']);
});

test('manual refresh exposes feedback while a silent refresh is already running', async () => {
  let resolveRequest;
  let requestCount = 0;
  const states = [];
  const controller = createPanelSnapshotController({
    requestSnapshot: () => {
      requestCount += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
    renderSnapshot() {},
    getPanelRoot: () => ({ classList: { add() {}, remove() {} } }),
    getSubtitle: () => null,
    hasLiveData: () => true,
    feedbackMinDurationMs: 0,
    setRefreshState: (state) => states.push(state)
  });

  const automaticRefresh = controller.refresh(true, { showLoading: false });
  const manualRefresh = controller.refresh(true, { showFeedback: true });
  assert.equal(requestCount, 1);
  assert.deepEqual(states, ['loading']);
  resolveRequest({ liveData: { one: {} } });
  assert.deepEqual(await Promise.all([automaticRefresh, manualRefresh]), [true, true]);
  assert.deepEqual(states, ['loading', 'success']);
});
