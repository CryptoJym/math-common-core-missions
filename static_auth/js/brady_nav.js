/* global MHA_Brady */

// Lightweight nav injected on every Brady page.
// Goal: consistent menu + a visible "working as" context to avoid parent/learner confusion.

(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sameOriginReferrer() {
    try {
      if (!document.referrer) return false;
      const ref = new URL(document.referrer);
      return ref.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function currentFile() {
    try {
      const path = String(window.location.pathname || '');
      const parts = path.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeFile(href) {
    const s = String(href || '');
    const parts = s.split('?')[0].split('#')[0].split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
  }

  let _mounted = false;
  let _contextEl = null;
  let _pendingContext = null;

  function renderIntoContainer() {
    if (_mounted) return;
    const container = document.querySelector('.container');
    if (!container) return;

    const file = currentFile();
    const primaryLinks = [
      { href: 'index.html', label: 'HQ' },
      { href: 'daily.html', label: 'Daily' },
      { href: 'assignments.html', label: 'Assignments' },
      { href: 'reading.html', label: 'Reading' },
      { href: 'avatar.html', label: 'Avatar' },
      { href: 'coach.html', label: 'Coach' },
    ];

    const moreLinks = [
      { href: 'admin.html', label: 'Admin' },
      { href: '../index.html', label: 'Main' },
    ];

    const nav = document.createElement('nav');
    nav.className = 'brady-topnav';
    nav.innerHTML = `
      <div class="brady-topnav-left">
        <div class="brady-topnav-brand">Level Up HQ</div>
      </div>
      <div class="brady-topnav-links" role="navigation" aria-label="Level Up Menu">
        ${primaryLinks.map((l) => {
          const active = normalizeFile(l.href) === file;
          return `<a class="brady-topnav-link ${active ? 'active' : ''}" href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`;
        }).join('')}
      </div>
      <div class="brady-topnav-right">
        <details class="brady-topnav-more">
          <summary class="brady-topnav-more-btn">More</summary>
          <div class="brady-topnav-more-panel" role="menu" aria-label="More links">
            ${moreLinks.map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join('')}
          </div>
        </details>
        <span class="sync-chip" title="Sync state">Saved</span>
        <span class="brady-topnav-rank">Rank 12 / 2400 XP</span>
        <div class="brady-topnav-context small" data-brady-context style="display:none;"></div>
      </div>
    `;

    container.insertBefore(nav, container.firstChild);
    _contextEl = nav.querySelector('[data-brady-context]');
    _mounted = true;

    if (_pendingContext) applyContext(_pendingContext);
  }

  function applyContext(context) {
    _pendingContext = context;
    if (!_contextEl) return;

    const label = String(context?.label || '').trim();
    const role = String(context?.role || '').trim();
    const isSelf = Boolean(context?.isSelf);

    if (!label) {
      _contextEl.style.display = 'none';
      _contextEl.textContent = '';
      return;
    }

    const roleText = role ? ` (${role})` : '';
    _contextEl.textContent = `Working as: ${label}${roleText}${isSelf ? '' : ' delegated'}`;
    _contextEl.style.display = 'block';
  }

  function setContext(context) {
    applyContext(context);
  }

  function init() {
    renderIntoContainer();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.MHA_BradyNav = {
    init,
    setContext,
  };
})();
