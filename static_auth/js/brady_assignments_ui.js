/* global BRADY_ASSIGNMENTS */

function subjectPillClass(subject) {
  if (subject === 'math') return 'pill pill-math';
  if (subject === 'reading') return 'pill pill-reading';
  if (subject === 'language') return 'pill pill-language';
  return 'pill';
}

function titleCase(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function safeText(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusLabel(status) {
  const value = String(status || 'not_started');
  if (value === 'in_progress') return 'Working';
  if (value === 'mastered') return 'Mastered';
  return 'Not started';
}

function statusOptionsHtml(current) {
  const selected = String(current || 'not_started');
  return [
    { value: 'not_started', label: 'Not started' },
    { value: 'in_progress', label: 'Working' },
    { value: 'mastered', label: 'Mastered' },
  ]
    .map((opt) => `<option value="${opt.value}" ${opt.value === selected ? 'selected' : ''}>${opt.label}</option>`)
    .join('');
}

async function loadProgressMap(session, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('assignment_id,status,score,last_attempt_at,notes')
    .eq('user_id', queryUserId);

  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => {
    map[row.assignment_id] = row;
  });
  return map;
}

function sortAssignments(list) {
  return (list || []).slice().sort((a, b) => (a.priority || 9999) - (b.priority || 9999));
}

function pickNextAssignment(progressMap) {
  const ordered = sortAssignments(BRADY_ASSIGNMENTS || []);
  const active = ordered.find((a) => (progressMap[a.id]?.status || 'not_started') === 'in_progress');
  if (active) return active;
  return ordered.find((a) => (progressMap[a.id]?.status || 'not_started') !== 'mastered') || ordered[0] || null;
}

function renderNextUp(progressMap, openAssignmentId) {
  const panel = document.getElementById('nextUpPanel');
  if (!panel) return;

  const assignment = pickNextAssignment(progressMap);
  if (!assignment) {
    panel.innerHTML = '<h2>Next Up</h2><div class="small">No assignments available yet.</div>';
    return;
  }

  const progress = progressMap[assignment.id] || {};
  const status = progress.status || 'not_started';
  const score = (progress.score !== null && progress.score !== undefined) ? Number(progress.score) : null;

  panel.innerHTML = `
    <h2>Next Up</h2>
    <div class="pill-row">
      <span class="${subjectPillClass(assignment.subject)}">${titleCase(assignment.subject)}</span>
      ${assignment.band ? `<span class="pill mono">Band ${safeText(assignment.band)}</span>` : ''}
      <span class="status-badge ${safeText(status)}">${statusLabel(status)}</span>
      ${score !== null ? `<span class="pill mono">Best ${safeText(score)}%</span>` : ''}
    </div>
    <div class="assignment-nextup-title">${safeText(assignment.title)}</div>
    <div class="small" style="margin-top:6px;">Start here. Keep all other assignments collapsed unless needed.</div>
    <div class="btn-row">
      <a class="btn" href="assignment.html?id=${encodeURIComponent(assignment.id)}">Start Test</a>
      <a class="btn secondary" href="assignments.html?assignment=${encodeURIComponent(assignment.id)}">Open Details</a>
      <a class="btn secondary" href="daily.html">Open Daily</a>
    </div>
    ${openAssignmentId === assignment.id ? '<div class="small" style="margin-top:8px;">Details are open below.</div>' : ''}
  `;
}

function renderAssignmentCard(a, progress, isOpen) {
  const status = progress?.status || 'not_started';
  const lastAttempt = progress?.last_attempt_at ? new Date(progress.last_attempt_at).toLocaleString() : '';
  const score = (progress?.score !== null && progress?.score !== undefined) ? Number(progress.score) : null;
  const notes = progress?.notes || '';

  const standards = (a.standards || []).map((st) => `<span class="pill mono">${safeText(st)}</span>`).join('');
  const targets = (a.learningTargets || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');
  const plan = (a.practicePlan || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');
  const check = (a.masteryCheck || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');

  const chatId = `ai_chatgpt_${a.id}`;
  const codexId = `ai_codex_${a.id}`;
  const claudeId = `ai_claude_${a.id}`;
  const aiBoxId = `ai_box_${a.id}`;

  return `
    <div class="section assignment-compact" id="assignment_${a.id}">
      <div class="assignment-main">
        <div>
          <div class="pill-row">
            <span class="${subjectPillClass(a.subject)}">${titleCase(a.subject)}</span>
            ${a.band ? `<span class="pill mono">Band ${safeText(a.band)}</span>` : ''}
            ${standards}
          </div>
          <div class="assignment-titleline" style="margin-top:9px;">${safeText(a.title)}</div>
          <div class="pill-row" style="margin-top:7px;">
            <span class="status-badge ${safeText(status)}">${statusLabel(status)}</span>
            ${score !== null ? `<span class="pill mono">Best ${safeText(score)}%</span>` : ''}
            ${lastAttempt ? `<span class="small">Updated ${safeText(lastAttempt)}</span>` : ''}
          </div>
        </div>
        <div class="assignment-actions">
          <a class="btn" href="assignment.html?id=${encodeURIComponent(a.id)}">Start Test</a>
          <button class="btn secondary" type="button" data-toggle-details="${a.id}">${isOpen ? 'Close' : 'Open'}</button>
        </div>
      </div>

      <div class="assignment-drawer" id="details_${a.id}" ${isOpen ? '' : 'hidden'}>
        <div class="grid">
          <div class="section" style="margin:0;">
            <h2>Targets</h2>
            <ul style="padding-left:18px;">${targets}</ul>
          </div>
          <div class="section" style="margin:0;">
            <h2>Practice</h2>
            <ul style="padding-left:18px;">${plan}</ul>
          </div>
          <div class="section" style="margin:0;">
            <h2>Check</h2>
            <ul style="padding-left:18px;">${check}</ul>
          </div>
        </div>

        <div class="section" style="margin-top:11px;">
          <h2>Progress</h2>
          <div class="field-row">
            <div>
              <label for="status_${a.id}">Status</label>
              <select id="status_${a.id}">${statusOptionsHtml(status)}</select>
            </div>
            <div>
              <label for="notes_${a.id}">Quick notes</label>
              <textarea id="notes_${a.id}" placeholder="What clicked? What should be reviewed next?">${safeText(notes)}</textarea>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn" type="button" data-save="${a.id}">Save</button>
            <button class="btn danger" type="button" data-reset="${a.id}">Reset</button>
            <button class="btn secondary" type="button" data-toggle-ai="${a.id}">AI prompts</button>
            <span class="small" id="save_msg_${a.id}"></span>
          </div>
        </div>

        <div class="ai-box" id="${aiBoxId}" style="display:none;">
          <h4>AI Co-Learning</h4>
          <div class="small">Pick one tool and copy the prompt.</div>

          <div style="margin-top:10px;">
            <label>ChatGPT prompt</label>
            <textarea class="ai-prompt" id="${chatId}" readonly>${safeText(a.ai?.chatgpt_web || '')}</textarea>
            <div class="btn-row">
              <button class="btn secondary" type="button" data-copy="${chatId}">Copy</button>
            </div>
          </div>

          <div style="margin-top:12px;">
            <label>Codex prompt</label>
            <textarea class="ai-prompt" id="${codexId}" readonly>${safeText(a.ai?.codex_cli || '')}</textarea>
            <div class="btn-row">
              <button class="btn secondary" type="button" data-copy="${codexId}">Copy</button>
            </div>
          </div>

          <div style="margin-top:12px;">
            <label>Claude Code prompt</label>
            <textarea class="ai-prompt" id="${claudeId}" readonly>${safeText(a.ai?.claude_code || '')}</textarea>
            <div class="btn-row">
              <button class="btn secondary" type="button" data-copy="${claudeId}">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function upsertAssignmentProgress(session, queryUserId, assignmentId, patch) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_progress').upsert({
    user_id: queryUserId,
    assignment_id: assignmentId,
    last_attempt_at: new Date().toISOString(),
    ...patch,
  }, { onConflict: 'user_id,assignment_id' });
  if (error) throw error;
}

function setAlert(msg) {
  const el = document.getElementById('alert');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.style.display = 'block';
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/assignments.html' });
    if (!gate) return;

    if (window.MHA_BradyNav && typeof window.MHA_BradyNav.setContext === 'function') {
      window.MHA_BradyNav.setContext(gate.context);
    }

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const url = new URL(window.location.href);
    const requestedId = url.searchParams.get('assignment');

    let activeFilter = 'all';
    let openAssignmentId = requestedId || null;

    const buttons = Array.from(document.querySelectorAll('button[data-filter]'));
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-filter') || 'all';
        render();
      });
    });

    const { userId: queryUserId } = MHA_Brady.getBradyQueryUser(gate.session, gate.context);
    const progressMap = await loadProgressMap(gate.session, queryUserId);

    const listEl = document.getElementById('assignmentList');
    if (!listEl) return;

    function render() {
      const filtered = sortAssignments(BRADY_ASSIGNMENTS || [])
        .filter((a) => activeFilter === 'all' ? true : a.subject === activeFilter);

      if (openAssignmentId && !filtered.some((a) => a.id === openAssignmentId)) {
        openAssignmentId = null;
      }

      renderNextUp(progressMap, openAssignmentId);

      listEl.innerHTML = filtered.map((a) => renderAssignmentCard(a, progressMap[a.id], openAssignmentId === a.id)).join('');

      filtered.forEach((a) => {
        const saveBtn = document.querySelector(`button[data-save="${a.id}"]`);
        const resetBtn = document.querySelector(`button[data-reset="${a.id}"]`);
        const toggleAiBtn = document.querySelector(`button[data-toggle-ai="${a.id}"]`);
        const toggleDetailsBtn = document.querySelector(`button[data-toggle-details="${a.id}"]`);
        const aiBox = document.getElementById(`ai_box_${a.id}`);
        const msgEl = document.getElementById(`save_msg_${a.id}`);
        const statusEl = document.getElementById(`status_${a.id}`);
        const notesEl = document.getElementById(`notes_${a.id}`);

        if (toggleDetailsBtn) {
          toggleDetailsBtn.addEventListener('click', () => {
            openAssignmentId = openAssignmentId === a.id ? null : a.id;
            render();
          });
        }

        if (toggleAiBtn && aiBox) {
          toggleAiBtn.addEventListener('click', () => {
            aiBox.style.display = (aiBox.style.display === 'none') ? 'block' : 'none';
          });
        }

        if (saveBtn && statusEl && notesEl) {
          saveBtn.addEventListener('click', async () => {
            setAlert('');
            if (msgEl) msgEl.textContent = 'Saving...';
            try {
              const status = statusEl.value;
              const notes = notesEl.value || null;
              await upsertAssignmentProgress(gate.session, queryUserId, a.id, { status, notes });
              progressMap[a.id] = {
                ...(progressMap[a.id] || {}),
                status,
                notes,
                last_attempt_at: new Date().toISOString(),
              };
              if (msgEl) msgEl.textContent = 'Saved.';
              renderNextUp(progressMap, openAssignmentId);
            } catch (e) {
              if (msgEl) msgEl.textContent = '';
              setAlert(e?.message || 'Save failed.');
            }
          });
        }

        if (resetBtn && statusEl && notesEl) {
          resetBtn.addEventListener('click', async () => {
            setAlert('');
            if (msgEl) msgEl.textContent = 'Resetting...';
            try {
              await upsertAssignmentProgress(gate.session, queryUserId, a.id, {
                status: 'not_started',
                notes: null,
                score: null,
              });
              statusEl.value = 'not_started';
              notesEl.value = '';
              progressMap[a.id] = {
                ...(progressMap[a.id] || {}),
                status: 'not_started',
                notes: null,
                score: null,
                last_attempt_at: new Date().toISOString(),
              };
              if (msgEl) msgEl.textContent = 'Reset.';
              renderNextUp(progressMap, openAssignmentId);
            } catch (e) {
              if (msgEl) msgEl.textContent = '';
              setAlert(e?.message || 'Reset failed.');
            }
          });
        }
      });

      Array.from(document.querySelectorAll('button[data-copy]')).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-copy');
          try {
            await MHA_Brady.copyTextFromEl(id);
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 900);
          } catch (_) {
            setAlert('Copy failed. Your browser may block clipboard access here.');
          }
        });
      });

      if (requestedId) {
        const target = document.getElementById(`assignment_${requestedId}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.style.borderColor = 'rgba(255, 215, 0, 0.55)';
          target.style.boxShadow = '0 0 16px rgba(255, 215, 0, 0.24)';
          setTimeout(() => {
            target.style.borderColor = '';
            target.style.boxShadow = '';
          }, 2200);
        }
      }
    }

    render();

  } catch (e) {
    setAlert(e?.message || 'Unable to load assignments.');
  }
}

document.addEventListener('DOMContentLoaded', main);
