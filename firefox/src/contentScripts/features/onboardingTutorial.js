(() => {
  'use strict';
  const TUTORIAL_VERSION = 1;
  const OPEN_EVENT = 'tfr:onboarding:open';
  const MANAGER_OPEN_EVENT = 'tfr:favorites-manager:open';
  const MANAGER_CLOSE_EVENT = 'tfr:favorites-manager:close';
  const TOP_NAV_BUTTON_SELECTOR = '[data-tfr-topnav-button="true"]';
  const SHARED_WORKSPACE_SELECTOR = '[data-tfr-workspace-mode="shared"]';
  const BASIC_STEP_KEYS = Object.freeze([
    'favorites', 'groups', 'sidebar', 'enhancements', 'profiles'
  ]);
  const ADVANCED_STEP_KEYS = Object.freeze([
    'vodsDeep', 'categoriesDeep', 'appearanceDeep', 'notificationsDeep',
    'chatDeep', 'audioDeep', 'soundDeep', 'sharedDeep', 'sharedCollabDeep'
  ]);
  const STEP_TARGETS = Object.freeze({
    favorites: Object.freeze({ selectors: ['.tfr-inline-button', '[data-tfr-topnav-button="true"]'] }),
    groups: Object.freeze({ selectors: ['.tfr-board'], openManager: true }),
    sidebar: Object.freeze({ selectors: ['#tfr-favorites-root', '[data-tfr-topnav-button="true"]'] }),
    enhancements: Object.freeze({ selectors: ['.tfr-feature-toggles'], openManager: true }),
    profiles: Object.freeze({ selectors: ['.tfr-profile-controls'], openManager: true }),
    vodsDeep: Object.freeze({ selectors: ['[data-tfr-vods-button="true"]'] }),
    categoriesDeep: Object.freeze({ selectors: ['.tfr-board'], openManager: true }),
    appearanceDeep: Object.freeze({ selectors: ['.tfr-appearance-wizard'], openManager: true }),
    notificationsDeep: Object.freeze({ selectors: ['.tfr-toast-settings'], openManager: true }),
    chatDeep: Object.freeze({ selectors: ['[data-tfr-feature-group="chat"]'], openManager: true }),
    audioDeep: Object.freeze({ selectors: ['[data-tfr-feature-group="player"]'], openManager: true }),
    soundDeep: Object.freeze({
      selectors: ['.tfr-audio-compressor-button'],
      fallbackSelectors: ['[data-tfr-feature-group="player"]'],
      optionalManagerFallback: true
    }),
    sharedDeep: Object.freeze({ selectors: ['[data-tfr-workspace-mode="shared"]'], openManager: true }),
    sharedCollabDeep: Object.freeze({
      selectors: ['.tfr-shared-remote'],
      openManager: true,
      activateShared: true
    })
  });

  const normalizeStep = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(BASIC_STEP_KEYS.length - 1, Math.round(parsed)))
      : 0;
  };

  const shouldAutoStart = (preferences = {}) => {
    const parsedVersion = Number(preferences.onboardingTutorialVersion);
    const version = Number.isFinite(parsedVersion) ? parsedVersion : 0;
    return version < TUTORIAL_VERSION && preferences.onboardingTutorialDismissed !== true;
  };

  const hasExistingFavorites = (state = {}) => {
    if (Object.keys(state.favorites || {}).length > 0) return true;
    return Object.values(state.profiles || {}).some(
      (profile) => Object.keys(profile?.favorites || {}).length > 0
    );
  };

  const create = ({ t }) => class OnboardingTutorial {
    constructor(store) {
      this.store = store;
      this.root = null;
      this.step = 0;
      this.mode = 'basic';
      this.pendingTimers = new Set();
      this.spotlightRoot = null;
      this.spotlightFrame = null;
      this.spotlightTarget = null;
      this.openFromEvent = (event) => this.open({
        restart: true,
        mode: event?.detail?.mode === 'advanced' ? 'advanced' : 'basic'
      });
      this.handleKeydown = (event) => {
        if (event.key !== 'Escape' || !this.root?.isConnected) return;
        event.preventDefault();
        this.closeForLater();
      };
    }

    init() {
      document.addEventListener(OPEN_EVENT, this.openFromEvent);
      document.addEventListener('keydown', this.handleKeydown, true);
      const state = this.store.getState();
      const preferences = state.preferences || {};
      if (!shouldAutoStart(preferences) || hasExistingFavorites(state)) return;
      this.step = normalizeStep(preferences.onboardingTutorialStep);
      this.schedule(() => this.open(), 1400);
    }

    get stepKeys() {
      return this.mode === 'advanced' ? ADVANCED_STEP_KEYS : BASIC_STEP_KEYS;
    }

    normalizeCurrentStep(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? Math.max(0, Math.min(this.stepKeys.length - 1, Math.round(parsed)))
        : 0;
    }

    async open({ restart = false, mode = this.mode } = {}) {
      this.mode = mode === 'advanced' ? 'advanced' : 'basic';
      if (restart) {
        this.step = 0;
        if (this.mode === 'basic') {
          await this.store.setOnboardingTutorialState({ step: 0, dismissed: false });
        }
      }
      this.render();
    }

    createButton(labelKey, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = t(labelKey);
      button.addEventListener('click', onClick);
      return button;
    }

    schedule(callback, delay = 0) {
      const timer = window.setTimeout(() => {
        this.pendingTimers.delete(timer);
        callback();
      }, delay);
      this.pendingTimers.add(timer);
      return timer;
    }

    clearPendingTimers() {
      this.pendingTimers.forEach((timer) => window.clearTimeout(timer));
      this.pendingTimers.clear();
    }

    dispatchManagerEvent(eventName) {
      document.dispatchEvent(new CustomEvent(eventName));
    }

    render() {
      this.clearPendingTimers();
      this.clearSpotlight();
      this.root?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'tfr-onboarding-backdrop';
      const dialog = document.createElement('section');
      dialog.className = 'tfr-onboarding';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'tfr-onboarding-title');

      const stepKey = this.stepKeys[this.step];
      const header = document.createElement('header');
      const eyebrow = document.createElement('span');
      eyebrow.className = 'tfr-onboarding__eyebrow';
      eyebrow.textContent = t('onboarding.progress', {
        current: this.step + 1,
        total: this.stepKeys.length
      });
      const later = this.createButton(
        'onboarding.later', 'tfr-onboarding__later', () => this.closeForLater()
      );
      header.append(eyebrow, later);

      const visual = document.createElement('div');
      visual.className = `tfr-onboarding__visual is-${stepKey}`;
      visual.setAttribute('aria-hidden', 'true');
      visual.textContent = t(`onboarding.step.${stepKey}.icon`);
      const title = document.createElement('h2');
      title.id = 'tfr-onboarding-title';
      title.textContent = t(`onboarding.step.${stepKey}.title`);
      const description = document.createElement('p');
      description.textContent = t(`onboarding.step.${stepKey}.description`);
      const tip = document.createElement('div');
      tip.className = 'tfr-onboarding__tip';
      tip.textContent = t(`onboarding.step.${stepKey}.tip`);

      const dots = document.createElement('div');
      dots.className = 'tfr-onboarding__dots';
      this.stepKeys.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.classList.toggle('is-active', index === this.step);
        dots.appendChild(dot);
      });

      const actions = document.createElement('footer');
      const skip = this.createButton(
        'onboarding.skip', 'tfr-onboarding__skip', () => this.dismiss()
      );
      const navigation = document.createElement('div');
      navigation.appendChild(this.createButton(
        'onboarding.showMe', 'tfr-onboarding__secondary', () => this.showCurrentTarget()
      ));
      if (this.step > 0) {
        navigation.appendChild(this.createButton(
          'onboarding.previous', 'tfr-onboarding__secondary', () => this.goTo(this.step - 1)
        ));
      }
      navigation.appendChild(this.createButton(
        this.step === this.stepKeys.length - 1 ? 'onboarding.finish' : 'onboarding.next',
        'tfr-onboarding__primary',
        () => this.step === this.stepKeys.length - 1 ? this.complete() : this.goTo(this.step + 1)
      ));
      actions.append(skip, navigation);
      dialog.append(header, visual, title, description, tip, dots, actions);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      this.root = backdrop;
      dialog.querySelector('.tfr-onboarding__primary')?.focus();
    }

    async goTo(step) {
      this.step = this.normalizeCurrentStep(step);
      if (this.mode === 'basic') await this.store.setOnboardingTutorialState({ step: this.step });
      this.render();
    }

    findTarget(stepKey, selectors = null) {
      const config = STEP_TARGETS[stepKey];
      for (const selector of selectors || config?.selectors || []) {
        const target = document.querySelector(selector);
        if (target) return target;
      }
      return null;
    }

    async showCurrentTarget() {
      const stepKey = this.stepKeys[this.step];
      const config = STEP_TARGETS[stepKey];
      this.root?.remove();
      this.root = null;
      const directTarget = this.findTarget(stepKey);
      const needsManagerFallback = config?.optionalManagerFallback && !directTarget;
      if (config?.openManager || needsManagerFallback) {
        this.dispatchManagerEvent(MANAGER_CLOSE_EVENT);
        this.schedule(() => {
          const managerButton = this.findTarget(stepKey, [TOP_NAV_BUTTON_SELECTOR]);
          if (!managerButton) {
            this.showManagerTarget(stepKey);
            return;
          }
          this.renderSpotlight(managerButton, stepKey, {
            locationKey: 'onboarding.managerButtonLocation',
            primaryLabelKey: 'onboarding.openAndShow',
            onPrimary: () => this.showManagerTarget(stepKey)
          });
        }, 80);
        return;
      }
      this.schedule(() => {
        const target = this.findTarget(stepKey);
        if (!target) {
          this.render();
          return;
        }
        target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
        this.schedule(() => this.renderSpotlight(target, stepKey), 180);
      }, 0);
    }

    showManagerTarget(stepKey) {
      this.clearSpotlight();
      this.dispatchManagerEvent(MANAGER_OPEN_EVENT);
      const config = STEP_TARGETS[stepKey];
      this.schedule(() => {
        if (config?.activateShared) {
          document.querySelector(SHARED_WORKSPACE_SELECTOR)?.click();
        }
        this.schedule(() => {
          const target = this.findTarget(stepKey, config?.optionalManagerFallback
            ? config.fallbackSelectors : null);
          if (!target) {
            this.render();
            return;
          }
          target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
          this.schedule(() => this.renderSpotlight(target, stepKey), 220);
        }, config?.activateShared ? 450 : 0);
      }, 140);
    }

    renderSpotlight(target, stepKey, {
      locationKey = `onboarding.step.${stepKey}.location`,
      primaryLabelKey = this.step === this.stepKeys.length - 1 ? 'onboarding.finish' : 'onboarding.next',
      onPrimary = () => this.step === this.stepKeys.length - 1 ? this.complete() : this.goTo(this.step + 1)
    } = {}) {
      this.clearSpotlight();
      if (!target?.isConnected) {
        this.render();
        return;
      }
      const root = document.createElement('div');
      root.className = 'tfr-onboarding-guide';
      const highlight = document.createElement('div');
      highlight.className = 'tfr-onboarding-guide__highlight';
      const callout = document.createElement('aside');
      callout.className = 'tfr-onboarding-guide__callout';
      const marker = document.createElement('strong');
      marker.textContent = t('onboarding.here');
      const text = document.createElement('p');
      text.textContent = t(locationKey);
      const actions = document.createElement('div');
      actions.append(
        this.createButton('onboarding.backToTutorial', 'tfr-onboarding__secondary', () => this.render()),
        this.createButton(primaryLabelKey, 'tfr-onboarding__primary', onPrimary)
      );
      callout.append(marker, text, actions);
      root.append(highlight, callout);
      document.body.appendChild(root);
      this.spotlightRoot = root;
      this.spotlightTarget = target;
      const track = () => {
        if (!this.spotlightRoot?.isConnected || !this.spotlightTarget?.isConnected) return;
        this.positionSpotlight(this.spotlightTarget, highlight, callout);
        this.spotlightFrame = window.requestAnimationFrame(track);
      };
      track();
    }

    positionSpotlight(target, highlight, callout) {
      const rect = target.getBoundingClientRect();
      const padding = 8;
      const leftEdge = Math.max(3, rect.left - padding);
      const topEdge = Math.max(3, rect.top - padding);
      const rightEdge = Math.min(window.innerWidth - 3, rect.right + padding);
      const bottomEdge = Math.min(window.innerHeight - 3, rect.bottom + padding);
      highlight.style.left = `${leftEdge}px`;
      highlight.style.top = `${topEdge}px`;
      highlight.style.width = `${Math.max(24, rightEdge - leftEdge)}px`;
      highlight.style.height = `${Math.max(24, bottomEdge - topEdge)}px`;
      const calloutWidth = Math.min(340, window.innerWidth - 24);
      const left = Math.max(12, Math.min(window.innerWidth - calloutWidth - 12, rect.left));
      const calloutHeight = Math.max(120, callout.offsetHeight || 0);
      const placeBelow = rect.bottom + calloutHeight + 28 < window.innerHeight;
      callout.style.width = `${calloutWidth}px`;
      callout.style.left = `${left}px`;
      callout.style.top = placeBelow
        ? `${rect.bottom + 18}px`
        : `${Math.max(12, rect.top - calloutHeight - 18)}px`;
    }

    clearSpotlight() {
      if (this.spotlightFrame) window.cancelAnimationFrame(this.spotlightFrame);
      this.spotlightFrame = null;
      this.spotlightTarget = null;
      this.spotlightRoot?.remove();
      this.spotlightRoot = null;
    }

    async closeForLater() {
      if (this.mode === 'basic') {
        await this.store.setOnboardingTutorialState({ step: this.step, dismissed: false });
      }
      this.close();
    }

    async dismiss() {
      if (this.mode === 'basic') {
        await this.store.setOnboardingTutorialState({ step: this.step, dismissed: true });
      }
      this.close();
    }

    async complete() {
      if (this.mode === 'basic') {
        await this.store.setOnboardingTutorialState({
          version: TUTORIAL_VERSION,
          step: 0,
          dismissed: false
        });
      }
      this.close();
    }

    close() {
      this.clearPendingTimers();
      this.clearSpotlight();
      this.root?.remove();
      this.root = null;
    }

    dispose() {
      document.removeEventListener(OPEN_EVENT, this.openFromEvent);
      document.removeEventListener('keydown', this.handleKeydown, true);
      this.close();
    }
  };

  window.TFROnboardingTutorial = Object.freeze({
    create,
    OPEN_EVENT,
    STEP_KEYS: BASIC_STEP_KEYS,
    BASIC_STEP_KEYS,
    ADVANCED_STEP_KEYS,
    STEP_TARGETS,
    TUTORIAL_VERSION,
    normalizeStep,
    shouldAutoStart,
    hasExistingFavorites
  });
})();
