// Private invalidations only: message bodies always use the authenticated RPCs.
export const createSharedChatRealtime = ({ config, getSession, Socket = WebSocket, timers = globalThis }) => {
  const subscribe = (spaceId, notify) => {
    let stopped = false, socket = null, retry = null, heartbeat = null, joinTimer = null;
    let failures = 0, sequence = 0, awaitingHeartbeat = false, token = '';
    const topic = `realtime:tfr-chat:${spaceId}`;
    const send = (event, payload, target = topic) => {
      socket?.send(JSON.stringify({ topic: target, event, payload, ref: String(++sequence), join_ref: '1' }));
    };
    const cleanup = () => {
      timers.clearInterval(heartbeat); timers.clearTimeout(joinTimer);
      heartbeat = null; joinTimer = null;
      const old = socket; socket = null;
      if (old) { old.onclose = null; old.onerror = null; old.onmessage = null; old.onopen = null; old.close(); }
    };
    const failed = () => {
      cleanup();
      if (stopped) return;
      notify({ type: 'status', ready: false });
      timers.clearTimeout(retry);
      retry = timers.setTimeout(connect, Math.min(60000, 1000 * 2 ** Math.min(++failures, 6)));
    };
    const connect = async () => {
      try {
        const session = await getSession();
        if (stopped) return;
        if (!session?.accessToken) { failed(); return; }
        token = session.accessToken; sequence = 0; awaitingHeartbeat = false;
        const url = new URL('/realtime/v1/websocket', config.supabaseUrl);
        url.protocol = 'wss:'; url.searchParams.set('apikey', config.publishableKey); url.searchParams.set('vsn', '1.0.0');
        const current = new Socket(url.href); socket = current;
        joinTimer = timers.setTimeout(failed, 15000);
        current.onopen = () => {
          if (socket !== current || stopped) return;
          send('phx_join', { config: { private: true, broadcast: { ack: false, self: false }, presence: { enabled: false } }, access_token: token });
        };
        current.onmessage = ({ data }) => {
          if (socket !== current || stopped) return;
          let message; try { message = JSON.parse(data); } catch { return; }
          if (message.topic === 'phoenix' && message.event === 'phx_reply') { awaitingHeartbeat = false; return; }
          if (message.topic !== topic) return;
          if (message.event === 'phx_reply' && message.ref === '1') {
            if (message.payload?.status !== 'ok') { failed(); return; }
            timers.clearTimeout(joinTimer); failures = 0;
            notify({ type: 'status', ready: true });
            timers.clearInterval(heartbeat);
            heartbeat = timers.setInterval(async () => {
              if (socket !== current || stopped) return;
              if (awaitingHeartbeat) { failed(); return; }
              awaitingHeartbeat = true;
              try {
                send('heartbeat', {}, 'phoenix');
                const next = await getSession();
                if (socket !== current || stopped) return;
                if (!next?.accessToken) { failed(); return; }
                if (next.accessToken !== token) { token = next.accessToken; send('access_token', { access_token: token }); }
              } catch { if (socket === current) failed(); }
            }, 25000);
          } else if (message.event === 'broadcast' && message.payload?.event === 'changed') {
            notify({ type: 'changed' });
          } else if (message.event === 'phx_error' || message.event === 'phx_close') failed();
        };
        current.onerror = current.onclose = () => { if (socket === current) failed(); };
      } catch { if (!stopped) failed(); }
    };
    void connect();
    return () => { stopped = true; timers.clearTimeout(retry); cleanup(); };
  };
  return { subscribe };
};
