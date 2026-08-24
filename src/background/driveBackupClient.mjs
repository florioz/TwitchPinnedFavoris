export const DRIVE_BACKUP_FILE_NAME = 'twitch-favorites-sidebar-profiles.json';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILE_SPACE = 'drive';
const DRIVE_LEGACY_APPDATA_SPACE = 'appDataFolder';

const createMultipartBody = (metadata, jsonPayload, boundary) => [
  `--${boundary}`,
  'Content-Type: application/json; charset=UTF-8',
  '',
  JSON.stringify(metadata),
  `--${boundary}`,
  'Content-Type: application/json; charset=UTF-8',
  '',
  JSON.stringify(jsonPayload),
  `--${boundary}--`
].join('\r\n');

export const createDriveBackupClient = ({
  fetchImpl = globalThis.fetch,
  logger = console,
  now = Date.now,
  random = Math.random
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required.');
  }

  const driveFetch = async (token, url, options = {}) => {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`Google Drive ${response.status}${message ? `: ${message.slice(0, 180)}` : ''}`);
    }
    return response;
  };

  const findFileInSpace = async (token, space) => {
    const query = encodeURIComponent(`name='${DRIVE_BACKUP_FILE_NAME}' and trashed=false`);
    const url = `${DRIVE_API_URL}?spaces=${space}&q=${query}&fields=files(id,name,modifiedTime,size)`;
    const response = await driveFetch(token, url);
    const payload = await response.json();
    return Array.isArray(payload.files) && payload.files.length ? payload.files[0] : null;
  };

  const findCurrentFile = (token) => findFileInSpace(token, DRIVE_FILE_SPACE);

  const findLegacyFile = async (token) => {
    try {
      return await findFileInSpace(token, DRIVE_LEGACY_APPDATA_SPACE);
    } catch (error) {
      logger.warn?.('[TFR] legacy Drive appData lookup skipped', error);
      return null;
    }
  };

  const push = async (token, backupPayload) => {
    const existing = await findCurrentFile(token);
    const timestamp = now();
    const payload = {
      ...backupPayload,
      driveSyncedAt: new Date(timestamp).toISOString()
    };
    const boundary = `tfr_drive_${timestamp}_${random().toString(16).slice(2)}`;
    const body = createMultipartBody({ name: DRIVE_BACKUP_FILE_NAME }, payload, boundary);
    const url = existing
      ? `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=multipart`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
    const response = await driveFetch(token, url, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    return { existing, file: await response.json() };
  };

  const pull = async (token) => {
    const file = await findCurrentFile(token) || await findLegacyFile(token);
    if (!file?.id) {
      throw new Error('No Drive backup found yet.');
    }
    const response = await driveFetch(token, `${DRIVE_API_URL}/${file.id}?alt=media`);
    return { file, payload: await response.json() };
  };

  return Object.freeze({ findCurrentFile, findLegacyFile, pull, push });
};
