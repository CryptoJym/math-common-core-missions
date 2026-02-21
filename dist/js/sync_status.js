/* global window, document, navigator */

(function bootstrapSyncStatus() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const STATES = {
    SAVED: 'saved',
    SYNCING: 'syncing',
    OFFLINE: 'offline',
  };

  const LABELS = {
    [STATES.SAVED]: 'Saved',
    [STATES.SYNCING]: 'Syncing',
    [STATES.OFFLINE]: 'Needs internet',
  };

  let pendingRequests = 0;
  let manualState = '';
  const listeners = new Set();

  function normalizeState(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === STATES.SAVED || v === STATES.SYNCING || v === STATES.OFFLINE) return v;
    return '';
  }

  function getState() {
    const forced = normalizeState(manualState);
    if (forced) return forced;
    if (!navigator.onLine) return STATES.OFFLINE;
    if (pendingRequests > 0) return STATES.SYNCING;
    return STATES.SAVED;
  }

  function notify(state) {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (_) {
        // Listener errors must not break sync indicator updates.
      }
    });
  }

  function render(state) {
    const nodes = document.querySelectorAll('.sync-chip, [data-sync-chip]');
    nodes.forEach((node) => {
      node.textContent = LABELS[state] || LABELS[STATES.SAVED];
      node.dataset.syncState = state;
      node.classList.remove('sync-chip-saved', 'sync-chip-syncing', 'sync-chip-offline');
      node.classList.add(`sync-chip-${state}`);
    });
  }

  function emit() {
    const state = getState();
    render(state);
    notify(state);
    return state;
  }

  function setManualState(state) {
    manualState = normalizeState(state);
    return emit();
  }

  function markRequestStart() {
    pendingRequests += 1;
    emit();
  }

  function markRequestDone() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    emit();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    try {
      listener(getState());
    } catch (_) {
      // Ignore listener errors at subscription time.
    }
    return () => listeners.delete(listener);
  }

  function wrapFetch() {
    if (typeof window.fetch !== 'function') return;
    if (window.fetch.__syncStatusWrapped) return;

    const originalFetch = window.fetch.bind(window);
    const wrappedFetch = function wrappedFetch(...args) {
      markRequestStart();
      return originalFetch(...args)
        .finally(() => {
          markRequestDone();
        });
    };

    wrappedFetch.__syncStatusWrapped = true;
    wrappedFetch.__originalFetch = originalFetch;
    window.fetch = wrappedFetch;
  }

  window.addEventListener('online', () => {
    if (manualState === STATES.OFFLINE) manualState = '';
    emit();
  });
  window.addEventListener('offline', () => emit());
  document.addEventListener('DOMContentLoaded', () => emit());

  wrapFetch();
  window.MHA_SyncStatus = {
    STATES,
    getState,
    setManualState,
    clearManualState: () => setManualState(''),
    markSyncing: () => setManualState(STATES.SYNCING),
    markSaved: () => setManualState(STATES.SAVED),
    markOffline: () => setManualState(STATES.OFFLINE),
    subscribe,
    emit,
  };

  emit();
})();
