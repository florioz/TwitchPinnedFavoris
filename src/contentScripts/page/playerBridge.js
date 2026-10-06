(() => {
  // Capability checks are intentionally local to the current player, never a global React scan.
  const playerSelector = '[data-a-target="video-player"], .video-player, .video-player__container';
  const ancestors = (element) => {
    const key = Object.keys(element || {}).find((name) => /^__react(?:Fiber|InternalInstance)\$/.test(name));
    const result = [];
    let fiber = element?.[key];
    for (let depth = 0; fiber && depth < 60; depth++, fiber = fiber.return) result.push(fiber);
    return result;
  };
  const mediaPlayer = (props) => props?.mediaPlayerInstance?.playerInstance || props?.mediaPlayerInstance;
  const findSource = (root) => {
    const fibers = [...ancestors(root.querySelector('video')), ...ancestors(root)];
    const player = fibers.map(fiber => mediaPlayer(fiber.memoizedProps) || mediaPlayer(fiber.stateNode?.props)).find(Boolean);
    const matches = node => typeof node?.setSrc === 'function'
      && mediaPlayer(node.props) && (!player || mediaPlayer(node.props) === player);
    const direct = fibers.map(fiber => fiber.stateNode).find(matches);
    if (direct) return direct;
    // Source and player controls may be siblings. Search only branches owned by this player.
    const branches = fibers.filter(fiber => player && (mediaPlayer(fiber.memoizedProps) === player || mediaPlayer(fiber.stateNode?.props) === player));
    const seen = new Set();
    const stack = branches.map(fiber => fiber.child).filter(Boolean);
    while (stack.length && seen.size < 1500) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      if (matches(fiber.stateNode)) return fiber.stateNode;
      if (fiber.sibling) stack.push(fiber.sibling);
      const candidatePlayer = mediaPlayer(fiber.memoizedProps) || mediaPlayer(fiber.stateNode?.props);
      if (fiber.child && (!candidatePlayer || candidatePlayer === player)) stack.push(fiber.child);
    }
    return null;
  };
  let pending = null;
  document.addEventListener('tfr:player:restart', async (event) => {
    const root = event.target;
    if (!(root instanceof Element) || !root.matches(playerSelector) || !root.isConnected) return;
    if (pending?.valid()) return;
    const request = root.getAttribute('data-tfr-recovery-request');
    if (!request) return;
    const path = location.pathname;
    const owner = findSource(root);
    if (!owner) return;
    const player = mediaPlayer(owner.props);
    const video = root.querySelector('video');
    let expectedVideo = video;
    const valid = () => root.isConnected && location.pathname === path
      && root.querySelector('video') === expectedVideo
      && root.getAttribute('data-tfr-recovery-request') === request;
    const duration = player.getDuration?.() ?? video?.duration;
    const position = Number.isFinite(duration) && duration > 0 ? (player.getPosition?.() ?? video?.currentTime) : null;
    const paused = video?.paused;
    const operation = { valid };
    pending = operation;
    let timeout;
    try {
      // A captured media element cannot be detached from Web Audio. Ask Twitch to own a fresh one.
      if (video?.dataset.tfrAudioCaptured === 'true') {
        if (typeof player.attachHTMLVideoElement !== 'function') return;
        const replacement = document.createElement('video');
        replacement.className = video.className;
        replacement.volume = video.volume;
        replacement.muted = video.muted;
        replacement.playsInline = true;
        video.replaceWith(replacement);
        expectedVideo = replacement;
        player.attachHTMLVideoElement(replacement);
      }
      await Promise.race([
        Promise.resolve(owner.setSrc({ isNewMediaPlayerInstance: false })),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Player restart timeout')), 3500); })
      ]);
      if (!valid()) return;
      // Twitch applies initial playback settings after setSrc resolves (as in FFZ's reset flow).
      if (position > 0 || paused) await new Promise(resolve => setTimeout(resolve, 250));
      if (!valid()) return;
      if (position > 0) player.seekTo?.(position);
      if (paused) player.pause?.();
      root.setAttribute('data-tfr-recovery-result', request);
    } catch { /* The caller verifies progress and reports failure. */ }
    finally {
      clearTimeout(timeout);
      if (pending === operation) pending = null;
    }
  }, true);

  // Only public message metadata is exposed. No session tokens cross this bridge.
  document.addEventListener('tfr:chat:inspect-reply', (event) => {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const props = ancestors(element).map((fiber) => fiber.memoizedProps || fiber.stateNode?.props);
    const user = props.find((value) => value?.currentUser?.login)?.currentUser;
    const message = props.find((value) => value?.message?.reply || value?.message?.replyParentUserLogin || value?.message?.id)?.message;
    const reply = message?.reply;
    const parent = reply?.parentUserLogin || reply?.parentDisplayName || message?.replyParentUserLogin;
    if (typeof parent === 'string') element.dataset.tfrReplyParent = parent.slice(0, 100);
    else delete element.dataset.tfrReplyParent;
    if (user?.login) element.dataset.tfrCurrentLogin = String(user.login).slice(0, 25);
    else delete element.dataset.tfrCurrentLogin;
    const id = message?.id;
    if (typeof id === 'string') element.dataset.tfrMessageId = id.slice(0, 150);
    else delete element.dataset.tfrMessageId;
  }, true);
})();
