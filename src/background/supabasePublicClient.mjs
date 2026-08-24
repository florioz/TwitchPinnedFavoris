export const parseSupabaseResponse = async (response) => {
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || `Supabase ${response.status}`);
  }
  return payload;
};

export const createSupabasePublicClient = ({
  config,
  isConfigured,
  fetchImpl = fetch,
  notConfiguredMessage = 'Supabase is not configured'
}) => {
  const request = async (path, { method = 'GET', body } = {}) => {
    if (!isConfigured(config)) throw new Error(notConfiguredMessage);
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return parseSupabaseResponse(response);
  };

  const rpc = (name, parameters = {}) => request(`rpc/${name}`, {
    method: 'POST',
    body: parameters
  });

  return Object.freeze({ request, rpc });
};
