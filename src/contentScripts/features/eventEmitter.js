(() => {
  const create = ({ onListenerError = () => {} } = {}) => {
    const listeners = new Set();
    return Object.freeze({
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit(...args) {
        [...listeners].forEach((listener) => {
          try {
            listener(...args);
          } catch (error) {
            onListenerError(error);
          }
        });
      },
      clear() {
        listeners.clear();
      },
      get size() {
        return listeners.size;
      }
    });
  };

  window.TFREventEmitter = Object.freeze({ create });
})();
