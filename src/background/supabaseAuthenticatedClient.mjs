import { parseSupabaseResponse } from './supabasePublicClient.mjs';

export const createSupabaseAuthenticatedClient = ({
  config,
  isConfigured,
  getSession,
  refreshSession,
  fetchImpl = fetch,
  notConfiguredMessage = 'Supabase is not configured',
  missingSessionMessage = 'Authentication is required'
}) => {
  const send = (path, { method, body }, accessToken) => fetchImpl(`${config.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const request = async (path, { method = 'GET', body, token } = {}) => {
    if (!isConfigured(config)) throw new Error(notConfiguredMessage);
    const explicitToken = String(token || '').trim();
    const session = explicitToken ? { accessToken: explicitToken } : await getSession();
    if (!session?.accessToken) throw new Error(missingSessionMessage);

    let response = await send(path, { method, body }, session.accessToken);
    if (response.status === 401 && !explicitToken) {
      const refreshed = await refreshSession();
      if (refreshed?.accessToken) {
        response = await send(path, { method, body }, refreshed.accessToken);
      }
    }
    return parseSupabaseResponse(response);
  };

  const rpc = (name, parameters = {}) => request(`rpc/${name}`, {
    method: 'POST',
    body: parameters
  });

  return Object.freeze({ request, rpc });
};
