(() => {
  const create = ({ client, store, remoteState }) => {
    let publishing = null;

    const findRemote = (spaceId) => remoteState.snapshot().spaces.find((space) => space.id === spaceId);

    const ensurePublished = async (space) => {
      if (!space?.id) return { ok: false, message: 'missing_space' };
      if (findRemote(space.id)) return { ok: true, space, published: false };
      if (publishing) return publishing;
      publishing = (async () => {
        const result = await client.createSpace(space);
        if (!result?.ok) return result || { ok: false, message: 'publish_failed' };
        const remoteSpace = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!remoteSpace?.id) return { ok: false, message: 'invalid_remote_space' };
        await store.replaceSharedSpaceId?.(space.id, remoteSpace);
        await remoteState.refresh({ notify: false });
        return { ok: true, space: remoteSpace, published: true };
      })().finally(() => { publishing = null; });
      return publishing;
    };

    return Object.freeze({ ensurePublished });
  };

  window.TFRSharedSpacePublisher = Object.freeze({ create });
})();
