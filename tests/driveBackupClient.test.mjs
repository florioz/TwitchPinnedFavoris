import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveBackupClient, DRIVE_BACKUP_FILE_NAME } from '../src/background/driveBackupClient.mjs';

const jsonResponse = (payload, { ok = true, status = 200, text = '' } = {}) => ({
  ok,
  status,
  json: async () => payload,
  text: async () => text
});

test('Drive lookup uses the file space, expected filename and bearer token', async () => {
  const calls = [];
  const client = createDriveBackupClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ files: [{ id: 'file-1' }] });
    }
  });

  assert.deepEqual(await client.findCurrentFile('token-1'), { id: 'file-1' });
  assert.match(calls[0].url, /spaces=drive/);
  assert.match(decodeURIComponent(calls[0].url), new RegExp(DRIVE_BACKUP_FILE_NAME));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
});

test('Drive push creates a multipart file when no backup exists', async () => {
  const calls = [];
  const client = createDriveBackupClient({
    now: () => Date.UTC(2026, 7, 25, 12, 0, 0),
    random: () => 0.5,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? jsonResponse({ files: [] })
        : jsonResponse({ id: 'created-file' });
    }
  });

  const result = await client.push('token-2', { revision: 4 });
  assert.equal(result.file.id, 'created-file');
  assert.equal(calls[1].options.method, 'POST');
  assert.match(calls[1].url, /uploadType=multipart$/);
  assert.match(calls[1].options.body, /"revision":4/);
  assert.match(calls[1].options.body, /"driveSyncedAt":"2026-08-25T12:00:00.000Z"/);
  assert.match(calls[1].options.headers['Content-Type'], /^multipart\/related; boundary=tfr_drive_/);
});

test('Drive push patches the existing backup file', async () => {
  const calls = [];
  const client = createDriveBackupClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? jsonResponse({ files: [{ id: 'existing-file' }] })
        : jsonResponse({ id: 'existing-file' });
    }
  });

  await client.push('token-3', { revision: 5 });
  assert.equal(calls[1].options.method, 'PATCH');
  assert.match(calls[1].url, /\/existing-file\?uploadType=multipart$/);
});

test('Drive pull falls back to the legacy appData space', async () => {
  const calls = [];
  const client = createDriveBackupClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('spaces=drive')) return jsonResponse({ files: [] });
      if (url.includes('spaces=appDataFolder')) {
        return jsonResponse({ files: [{ id: 'legacy-file', modifiedTime: 'yesterday' }] });
      }
      return jsonResponse({ revision: 2 });
    }
  });

  const result = await client.pull('token-4');
  assert.equal(result.file.id, 'legacy-file');
  assert.deepEqual(result.payload, { revision: 2 });
  assert.match(calls[2].url, /legacy-file\?alt=media$/);
});

test('Drive errors expose the status and a bounded response excerpt', async () => {
  const client = createDriveBackupClient({
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 403, text: 'x'.repeat(250) })
  });
  await assert.rejects(
    () => client.findCurrentFile('token-5'),
    (error) => error.message.startsWith('Google Drive 403: ') && error.message.length < 210
  );
});
