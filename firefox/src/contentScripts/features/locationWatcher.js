(() => {
  const createLocationWatcher = ({ LOCATION_CHECK_INTERVAL }) => {
  class LocationWatcher {
    constructor(callback) {
      this.callback = callback;
      this.timer = null;
      this.lastHref = window.location.href;
    }
    start() {
      this.stop();
      this.timer = setInterval(() => {
        if (window.location.href !== this.lastHref) {
          this.lastHref = window.location.href;
          this.callback(window.location.href);
        }
      }, LOCATION_CHECK_INTERVAL);
    }
    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }
    return LocationWatcher;
  };

  window.TFRLocationWatcher = {
    create: createLocationWatcher
  };
})();