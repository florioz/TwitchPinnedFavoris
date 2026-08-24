import { createSupabasePublicClient } from './supabasePublicClient.mjs';

const INSTALLATION_ID_KEY = 'tfr_usage_presence_installation_id';
const PRESENCE_ENABLED_KEY = 'tfr_usage_presence_enabled';
const REFRESH_CACHE_MS = 45_000;

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const createUsagePresenceRemote = ({
  extensionApi,
  config,
  isConfigured,
  fetchImpl = fetch,
  cryptoImpl = crypto,
  environment = 'development',
  now = Date.now
}) => {
  const storage = extensionApi.storage.local;
  let lastResult = null;
  let refreshPromise = null;
  const publicClient = createSupabasePublicClient({
    config,
    isConfigured,
    fetchImpl,
    notConfiguredMessage: 'Le compteur communautaire n’est pas configuré'
  });

  const createInstallationId = () => {
    if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const readInstallationId = async () => (
    (await storage.get(INSTALLATION_ID_KEY))?.[INSTALLATION_ID_KEY] || ''
  );

  const getInstallationId = async () => {
    const existing = await readInstallationId();
    if (existing) return existing;
    const created = createInstallationId();
    await storage.set({ [INSTALLATION_ID_KEY]: created });
    return created;
  };

  const hashInstallationId = async (installationId) => {
    const bytes = new TextEncoder().encode(installationId);
    return toHex(await cryptoImpl.subtle.digest('SHA-256', bytes));
  };

  const isEnabled = async () => (await storage.get(PRESENCE_ENABLED_KEY))?.[PRESENCE_ENABLED_KEY] !== false;

  const getCount = async () => {
    const value = await publicClient.rpc('tfr_get_extension_presence_count');
    return Math.max(0, Number(value) || 0);
  };

  const touch = async () => {
    const installationHash = await hashInstallationId(await getInstallationId());
    const manifest = extensionApi.runtime?.getManifest?.() || {};
    const value = await publicClient.rpc('tfr_touch_extension_presence', {
      target_installation_hash: installationHash,
      target_extension_version: String(manifest.version || '').slice(0, 32),
      target_extension_environment: String(environment || 'development').slice(0, 64)
    });
    return Math.max(0, Number(value) || 0);
  };

  const refresh = async ({ force = false } = {}) => {
    const currentTime = now();
    if (!force && lastResult && currentTime - lastResult.updatedAt < REFRESH_CACHE_MS) {
      return { ...lastResult };
    }
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const enabled = await isEnabled();
      const count = enabled ? await touch() : await getCount();
      lastResult = { enabled, count, updatedAt: now() };
      return { ...lastResult };
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  };

  const setEnabled = async (enabled) => {
    if (refreshPromise) await refreshPromise.catch(() => null);
    const nextEnabled = enabled === true;
    await storage.set({ [PRESENCE_ENABLED_KEY]: nextEnabled });
    lastResult = null;
    if (nextEnabled) return refresh({ force: true });

    const installationId = await readInstallationId();
    if (installationId) {
      const installationHash = await hashInstallationId(installationId);
      await publicClient.rpc('tfr_remove_extension_presence', { target_installation_hash: installationHash });
    }
    lastResult = { enabled: false, count: await getCount(), updatedAt: now() };
    return { ...lastResult };
  };

  return Object.freeze({ getCount, isEnabled, refresh, setEnabled, touch });
};
