(() => {
  const createDomWorkScheduler = ({ process, maxBatchSize = 12 }) => {
    const queue = new Set();
    let handle = null;
    let disposed = false;
    let scheduledWithIdleCallback = false;

    const schedule = () => {
      if (disposed || handle !== null || !queue.size) return;
      if (typeof window.requestIdleCallback === 'function') {
        scheduledWithIdleCallback = true;
        handle = window.requestIdleCallback((deadline) => flush(deadline), { timeout: 250 });
      } else {
        scheduledWithIdleCallback = false;
        handle = window.setTimeout(() => flush(null), 0);
      }
    };

    const flush = (deadline) => {
      handle = null;
      let processed = 0;
      for (const item of queue) {
        if (processed >= maxBatchSize) break;
        if (processed > 0 && deadline?.timeRemaining?.() < 1 && !deadline.didTimeout) break;
        queue.delete(item);
        process(item);
        processed += 1;
      }
      schedule();
      return processed;
    };

    const enqueue = (item) => {
      if (disposed || !item) return;
      queue.add(item);
      schedule();
    };

    const dispose = () => {
      disposed = true;
      queue.clear();
      if (handle === null) return;
      if (scheduledWithIdleCallback && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
      handle = null;
    };

    return { enqueue, flushNow: () => flush({ didTimeout: true, timeRemaining: () => Infinity }), dispose, get size() { return queue.size; } };
  };

  window.TFRDomWorkScheduler = { create: createDomWorkScheduler };
})();
