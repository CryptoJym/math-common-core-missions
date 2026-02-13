/* global MHA_Auth, MHA_Brady */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAlert(msg, isError = true) {
  const el = document.getElementById('alert');
  if (!el) return;

  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    el.style.background = 'rgba(255, 68, 68, 0.12)';
    el.style.borderColor = 'rgba(255, 68, 68, 0.55)';
    el.style.color = 'var(--accent-red)';
    return;
  }

  el.textContent = msg;
  el.style.display = 'block';

  if (isError) {
    el.style.background = 'rgba(255, 68, 68, 0.12)';
    el.style.borderColor = 'rgba(255, 68, 68, 0.55)';
    el.style.color = 'var(--accent-red)';
    return;
  }

  el.style.background = 'rgba(0, 255, 136, 0.10)';
  el.style.borderColor = 'rgba(0, 255, 136, 0.45)';
  el.style.color = 'var(--accent-green)';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBradyRole(value) {
  const v = String(value || 'student').trim().toLowerCase();
  if (['parent', 'teacher', 'student', 'child'].includes(v)) return v;
  return 'student';
}

function getRoleLabel(role) {
  const map = {
    parent: 'Parent',
    teacher: 'Teacher',
    student: 'Student',
    child: 'Child',
  };
  return map[normalizeBradyRole(role)] || 'Student';
}

function statusPill(row) {
  const hasLearner = Boolean(row?.learner_id);
  if (!hasLearner) {
    return '<span class="pill">Pending signup</span>';
  }
  return row?.is_active
    ? '<span class="pill mono" style="border-color: rgba(0, 255, 136, 0.4); color: var(--accent-green);">Active</span>'
    : '<span class="pill mono" style="border-color: rgba(255, 68, 68, 0.4); color: var(--accent-red);">Inactive</span>';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftLocalISO(dayISO, deltaDays) {
  const base = new Date(`${String(dayISO || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return todayLocalISO();
  base.setDate(base.getDate() + Number(deltaDays || 0));
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

let _gateContext = null;

async function loadRows(session) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_sub_accounts')
    .select('id,admin_user_id,learner_id,learner_email,learner_name,learner_role,is_active,created_at')
    .eq('admin_user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderAccountSummary(session) {
  const name = String(session?.user?.email || '').trim() || 'Unknown';
  const summary = document.getElementById('accountSummary');
  if (!summary) return;
  summary.textContent = `Signed in as ${name}. Use this account to create and manage sub-accounts.`;
}

function setActiveLearner(session, learnerId) {
  return MHA_Brady.setBradyLearner(session, learnerId);
}

function bindClearContextButton() {
  const btn = document.getElementById('clearContextBtn');
  if (!btn) return;
  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    try {
      const session = await MHA_Auth.getSession();
      if (!session) {
        setAlert('Please sign in again to clear context.');
        return;
      }

      const email = MHA_Brady.normalizeEmail(session?.user?.email);
      if (!MHA_Brady.isAllowedEmail(email)) {
        setAlert('Only Brady admin accounts can manage learners.');
        return;
      }

      // Clearing context is local-only (stored in browser storage). Do it
      // immediately without a database call so UX stays fast and tests remain stable.
      MHA_Brady.clearBradyLearner(session);
      setAlert('Context set to your own account.', false);

      // Refresh in the background; do not block the "context set" feedback.
      void refresh(session).catch((e) => {
        setAlert(`Could not refresh learners: ${String(e?.message || e)}`);
      });
    } catch (e) {
      setAlert(`Could not switch context: ${String(e?.message || e)}`);
    }
  });
}

function renderSubAccountRows(rows, session) {
  const summary = document.getElementById('subAccountSummary');
  const holder = document.getElementById('subAccountList');
  if (!holder) return;

  const sorted = Array.isArray(rows) ? rows.slice() : [];
  summary.textContent = `${sorted.length} record${sorted.length === 1 ? '' : 's'} saved.`;

  if (!sorted.length) {
    holder.innerHTML = '<div class="small">No learners yet. Add one using the form above.</div>';
    return;
  }

  const rowsHtml = sorted.map((row) => {
    const canOpen = Boolean(row?.learner_id && row?.is_active);
    const openBtnLabel = canOpen ? 'Use As Learner' : 'Not Available';
    const openBtn = canOpen ? `<button class="btn secondary" type="button" data-use-learner="${escapeHtml(row.id)}">Work As This Learner</button>` : '';
    const toggleBtn = row?.is_active
      ? `<button class="btn secondary" type="button" data-deactivate-learner="${escapeHtml(row.id)}">Deactivate</button>`
      : `<button class="btn secondary" type="button" data-activate-learner="${escapeHtml(row.id)}">Activate</button>`;
    const deleteBtn = `<button class="btn danger" type="button" data-delete-learner="${escapeHtml(row.id)}">Delete</button>`;
    const claimedAt = formatDate(row?.created_at);
    const learnerName = row?.learner_name ? escapeHtml(row.learner_name) : '—';
    const learnerEmail = escapeHtml(row?.learner_email || '');
    const learnerRole = escapeHtml(getRoleLabel(row?.learner_role));
    const learnerId = row?.learner_id ? escapeHtml(row.learner_id) : 'pending';

    return `
      <tr>
        <td class="small">${learnerName}</td>
        <td class="small mono">${learnerEmail}</td>
        <td class="small">${learnerId}</td>
        <td class="small">${learnerRole}</td>
        <td class="small">${statusPill(row)}</td>
        <td class="small" title="${escapeHtml(String(row?.created_at || ''))}">${claimedAt}</td>
        <td>
          <div class="btn-row">
            ${openBtn}
            ${toggleBtn}
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  holder.innerHTML = `
    <div class="small">Use one of these actions to switch which learner receives saved work.</div>
    <div style="overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Learner ID</th>
            <th>Role</th>
            <th>Status</th>
            <th>Added</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  Array.from(holder.querySelectorAll('[data-use-learner]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = String(btn.getAttribute('data-use-learner') || '').trim();
      const match = sorted.find((r) => r && String(r.id) === id);
      if (!match) return;
      if (!match.learner_id) {
        setAlert('Learner is not claimed yet.');
        return;
      }

      try {
        await setActiveLearner(session, match.learner_id);
        setAlert(`Working context set to ${match.learner_name || match.learner_email}.`, false);
      } catch (e) {
        setAlert(`Could not switch context: ${String(e?.message || e)}`);
      }
    });
  });

  Array.from(holder.querySelectorAll('[data-deactivate-learner]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = String(btn.getAttribute('data-deactivate-learner') || '').trim();
      try {
        await MHA_Auth.getSupabase()
          .from('brady_sub_accounts')
          .update({ is_active: false })
          .eq('id', id)
          .eq('admin_user_id', session.user.id);
        setAlert('Link deactivated.', false);
        await refresh(session);
      } catch (e) {
        setAlert(`Deactivate failed: ${String(e?.message || e)}`);
      }
    });
  });

  Array.from(holder.querySelectorAll('[data-activate-learner]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = String(btn.getAttribute('data-activate-learner') || '').trim();
      try {
        await MHA_Auth.getSupabase()
          .from('brady_sub_accounts')
          .update({ is_active: true })
          .eq('id', id)
          .eq('admin_user_id', session.user.id);
        setAlert('Link activated.', false);
        await refresh(session);
      } catch (e) {
        setAlert(`Activate failed: ${String(e?.message || e)}`);
      }
    });
  });

  Array.from(holder.querySelectorAll('[data-delete-learner]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = String(btn.getAttribute('data-delete-learner') || '').trim();
      if (!window.confirm('Delete this learner link? This cannot be undone.')) return;
      try {
        await MHA_Auth.getSupabase()
          .from('brady_sub_accounts')
          .delete()
          .eq('id', id)
          .eq('admin_user_id', session.user.id);
        setAlert('Learner link deleted.', false);
        await refresh(session);
      } catch (e) {
        setAlert(`Delete failed: ${String(e?.message || e)}`);
      }
    });
  });
}

async function refresh(session) {
  const rows = await loadRows(session);
  renderSubAccountRows(rows, session);
  const current = document.getElementById('subAccountSummary');
  if (current) {
    current.textContent = `Loaded ${rows.length} learner link${rows.length === 1 ? '' : 's'}.`;
  }

  // Also refresh export UI from the same rows.
  renderExportUI(rows, session);
}

function renderExportUI(rows, session) {
  const learnerSelect = document.getElementById('exportLearner');
  if (!learnerSelect) return;

  const options = [];
  options.push({ value: session.user.id, label: `Me (${session.user.email})` });

  const claimed = (Array.isArray(rows) ? rows : []).filter((r) => r && r.is_active && r.learner_id);
  claimed.forEach((r) => {
    const label = r.learner_name || r.learner_email || r.learner_id;
    options.push({ value: r.learner_id, label });
  });

  learnerSelect.innerHTML = options
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join('');

  // Default selection: current working learner context, if set.
  try {
    const current = MHA_Brady.getBradyQueryUser(session, _gateContext).userId;
    if (current) learnerSelect.value = current;
  } catch (_) {
    // ignore
  }

  const startEl = document.getElementById('exportStart');
  const endEl = document.getElementById('exportEnd');
  const end = todayLocalISO();
  if (endEl && !endEl.value) endEl.value = end;
  if (startEl && !startEl.value) startEl.value = shiftLocalISO(end, -7);

  const btn = document.getElementById('downloadExportBtn');
  if (btn && btn.dataset.bound !== '1') {
    btn.dataset.bound = '1';
    // The button starts disabled in markup to avoid "click does nothing" during initial async loads.
    btn.disabled = false;
    btn.addEventListener('click', async () => {
      const msgEl = document.getElementById('exportMsg');
      const includeFilesEl = document.getElementById('exportIncludeFiles');

      const queryUserId = String(learnerSelect.value || '').trim();
      const startDay = String(startEl?.value || '').trim();
      const endDay = String(endEl?.value || '').trim();
      const includeFiles = String(includeFilesEl?.value || '0') === '1';

      if (!queryUserId) {
        setAlert('Select a learner to export.');
        return;
      }
      if (!startDay || !endDay) {
        setAlert('Pick a start and end date.');
        return;
      }

      btn.disabled = true;
      if (msgEl) msgEl.textContent = 'Preparing…';
      setAlert('', false);

      try {
        const token = await MHA_Auth.getAccessToken();
        const resp = await fetch('/api/brady/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            queryUserId,
            startDay,
            endDay,
            includeArtifactContent: includeFiles,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          const code = String(body?.error_code || body?.errorCode || '');
          const msg = String(body?.error || '').toLowerCase();
          const looksLikeMissingSession = resp.status === 401
            || code === 'session_not_found'
            || msg.includes('session_not_found')
            || msg.includes('session_id claim');
          if (looksLikeMissingSession) {
            try { await MHA_Auth.getSupabase().auth.signOut({ scope: 'local' }); } catch (_) { /* ignore */ }
            window.location.href = MHA_Brady.bradyLoginUrl('brady/admin.html');
            return;
          }
          throw new Error(body?.error || `Export failed (${resp.status})`);
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mha_export_${queryUserId}_${startDay}_to_${endDay}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);

        if (msgEl) msgEl.textContent = 'Downloaded.';
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 1600);
      } catch (e) {
        setAlert(String(e?.message || e));
        if (msgEl) msgEl.textContent = '';
      } finally {
        btn.disabled = false;
      }
    });
  }
}

async function addSubAccount(session) {
  const emailInput = document.getElementById('learnerEmail');
  const nameInput = document.getElementById('learnerName');
  const roleInput = document.getElementById('learnerRole');
  const email = normalizeEmail(emailInput?.value);
  const name = String(nameInput?.value || '').trim();
  const role = normalizeBradyRole(roleInput?.value);

  if (!email) {
    setAlert('Learner email is required.');
    return;
  }

  const sb = MHA_Auth.getSupabase();
  const payload = {
    admin_user_id: session.user.id,
    learner_email: email,
    learner_name: name || null,
    learner_role: role,
    learner_id: null,
    is_active: true,
  };

  const { error } = await sb.from('brady_sub_accounts').insert(payload);
  if (error) {
    const message = String(error?.message || '');
    if (error?.code === '23505' || message.includes('duplicate key value')) {
      setAlert('Learner link already exists.', false);
      await refresh(session);
      return;
    }
    throw error;
  }

  setAlert('Learner link saved.', false);
  if (emailInput) emailInput.value = '';
  if (nameInput) nameInput.value = '';
  if (roleInput) roleInput.value = 'student';
  await refresh(session);
}

async function main() {
  const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/admin.html' });
  if (!gate) return;

  await MHA_Auth.initAuthUI(false);
  document.body.classList.add('has-user-nav');

  if (!MHA_Brady.isAllowedEmail(MHA_Brady.normalizeEmail(gate.session.user.email))) {
    setAlert('Only Brady admin accounts can manage learners.');
    return;
  }

  _gateContext = gate.context;
  const { session } = gate;
  renderAccountSummary(session);
  // Bind the export UI immediately so it is clickable even before learner rows finish loading.
  renderExportUI([], session);

  const addForm = document.getElementById('addSubAccountForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = addForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await addSubAccount(session);
      } catch (e) {
        setAlert(`Could not save learner: ${String(e?.message || e)}`);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  await refresh(session);
}

document.addEventListener('DOMContentLoaded', () => {
  bindClearContextButton();
  void main();
});
