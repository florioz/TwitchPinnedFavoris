(() => {
  const create = ({
    store,
    client,
    remoteState,
    onMessage = () => {},
    onSynced = () => {},
    visibleInterval = 60_000,
    hiddenInterval = 300_000,
    pushDelay = 2_000
  }) => {
    let timer = null;
    let pushTimer = null;
    let running = null;
    let disposed = false;

    const activeRemoteSpace = () => {
      const space = store.getActiveSharedSpace?.();
      const remote = remoteState.snapshot().spaces.find((item) => item.id === space?.id);
      return { space, remote };
    };

    const schedule = () => {
      if (disposed) return;
      clearTimeout(timer);
      timer = setTimeout(run, document.hidden ? hiddenInterval : visibleInterval);
    };

    const run = async () => {
      if (disposed || running) return running;
      running = (async () => {
        const snapshot = await remoteState.refresh({ notify: false });
        if (!snapshot.status?.connected) return;
        await store.reconcileRemoteSharedSpaces?.(snapshot.spaces.map((space) => space.id));
        const { space, remote } = activeRemoteSpace();
        if (!space?.id || !remote) return;
        const localRemoteRevision = Math.max(0, Number(space.remoteRevision ?? space.revision) || 0);
        const remoteRevision = Math.max(0, Number(remote.revision) || 0);
        if (space.syncState === 'local') {
          if (remoteRevision > localRemoteRevision) {
            onMessage('conflict');
            return;
          }
          const pushed = await client.pushSpace(space);
          if (!pushed.ok) { onMessage(pushed.message || 'sync_failed'); return; }
          await store.importRemoteSharedSpace?.(pushed.data, { activate: true });
          onSynced('push');
          return;
        }
        if (remoteRevision > localRemoteRevision) {
          const pulled = await client.pullSpace(space.id);
          if (!pulled.ok) { onMessage(pulled.message || 'sync_failed'); return; }
          await store.importRemoteSharedSpace?.(pulled.data, { activate: true });
          onSynced('pull');
        }
      })().finally(() => { running = null; schedule(); });
      return running;
    };

    const handleStoreChange = (event) => {
      if (disposed || event?.kind !== 'state') return;
      const space = store.getActiveSharedSpace?.();
      if (!space || space.syncState !== 'local') return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(run, pushDelay);
    };

    const handleVisibility = () => {
      schedule();
      if (!document.hidden) run();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    schedule();
    queueMicrotask(run);
    return Object.freeze({
      run,
      handleStoreChange,
      dispose() {
        disposed = true;
        clearTimeout(timer);
        clearTimeout(pushTimer);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    });
  };

  window.TFRSharedSpacesAutoSync = Object.freeze({ create });
})();
