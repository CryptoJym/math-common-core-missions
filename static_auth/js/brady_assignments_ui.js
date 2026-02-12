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

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function loadProgressMap(session) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('assignment_id,status,score,last_attempt_at,notes')
    .eq('user_id', session.user.id);

  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => {
    map[row.assignment_id] = row;
  });
  return map;
}

function renderAssignmentCard(a, progress) {
  const status = progress?.status || 'not_started';
  const lastAttempt = progress?.last_attempt_at ? new Date(progress.last_attempt_at).toLocaleString() : '';
  const score = (progress?.score !== null && progress?.score !== undefined) ? Number(progress.score) : null;
  const notes = progress?.notes || '';

  const statusOptions = ['not_started', 'in_progress', 'mastered']
    .map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${titleCase(s)}</option>`)
    .join('');

  const standards = (a.standards || []).map((st) => `<span class="pill mono">${safeText(st)}</span>`).join('');
  const targets = (a.learningTargets || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');
  const plan = (a.practicePlan || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');
  const check = (a.masteryCheck || []).map((t) => `<li class="small">${safeText(t)}</li>`).join('');

  const chatId = `ai_chatgpt_${a.id}`;
  const codexId = `ai_codex_${a.id}`;
  const claudeId = `ai_claude_${a.id}`;
  const aiBoxId = `ai_box_${a.id}`;

  return `
    <div class="section" id="assignment_${a.id}">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="pill-row">
            <span class="${subjectPillClass(a.subject)}">${titleCase(a.subject)}</span>
            ${a.band ? `<span class="pill mono">Band ${safeText(a.band)}</span>` : ''}
            ${standards}
          </div>
          <h2 style="margin-top:12px;">${safeText(a.title)}</h2>
          <div style="margin-top:6px;">
            <span class="status-badge ${status}">${titleCase(status)}</span>
            ${score !== null ? `<span class="pill mono" style="margin-left:10px;">Best ${safeText(score)}%</span>` : ''}
            ${lastAttempt ? `<span class="small" style="margin-left:10px;">Last updated: ${safeText(lastAttempt)}</span>` : ''}
          </div>
        </div>
        <div class="btn-row">
          <a class="btn secondary" href="assignment.html?id=${encodeURIComponent(a.id)}" style="text-decoration:none; display:inline-flex; align-items:center;">Start Test</a>
          <button class="btn secondary" type="button" data-toggle-ai="${a.id}">AI Prompts</button>
          <a class="btn secondary" href="daily.html" style="text-decoration:none; display:inline-flex; align-items:center;">Daily</a>
        </div>
      </div>

      <div class="grid" style="margin-top:14px;">
        <div class="section" style="margin:0;">
          <h2>Learning Targets</h2>
          <ul style="padding-left:18px;">${targets}</ul>
        </div>
        <div class="section" style="margin:0;">
          <h2>Practice Plan</h2>
          <ul style="padding-left:18px;">${plan}</ul>
        </div>
        <div class="section" style="margin:0;">
          <h2>Mastery Check</h2>
          <ul style="padding-left:18px;">${check}</ul>
        </div>
      </div>

      <div class="section" style="margin-top:14px;">
        <h2>Progress</h2>
        <div class="field-row">
          <div>
            <label for="status_${a.id}">Status</label>
            <select id="status_${a.id}">${statusOptions}</select>
          </div>
          <div>
            <label for="notes_${a.id}">Notes (what I learned / what I missed)</label>
            <textarea id="notes_${a.id}" placeholder="Write what was confusing, what clicked, and what to practice next.">${safeText(notes)}</textarea>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" data-save="${a.id}">Save</button>
          <button class="btn danger" type="button" data-reset="${a.id}">Reset</button>
          <span class="small" id="save_msg_${a.id}"></span>
        </div>
      </div>

      <div class="ai-box" id="${aiBoxId}" style="display:none;">
        <h4>AI Co-Learning</h4>
        <div class="small">Use ONE path today: ChatGPT (web), Codex CLI, or Claude Code.</div>

        <div style="margin-top:10px;">
          <label>ChatGPT Web App Prompt</label>
          <textarea class="ai-prompt" id="${chatId}" readonly>${safeText(a.ai?.chatgpt_web || '')}</textarea>
          <div class="btn-row">
            <button class="btn secondary" type="button" data-copy="${chatId}">Copy</button>
          </div>
        </div>

        <div style="margin-top:12px;">
          <label>Codex CLI Prompt</label>
          <textarea class="ai-prompt" id="${codexId}" readonly>${safeText(a.ai?.codex_cli || '')}</textarea>
          <div class="btn-row">
            <button class="btn secondary" type="button" data-copy="${codexId}">Copy</button>
          </div>
        </div>

        <div style="margin-top:12px;">
          <label>Claude Code Prompt</label>
          <textarea class="ai-prompt" id="${claudeId}" readonly>${safeText(a.ai?.claude_code || '')}</textarea>
          <div class="btn-row">
            <button class="btn secondary" type="button" data-copy="${claudeId}">Copy</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function upsertAssignmentProgress(session, assignmentId, patch) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_progress').upsert({
    user_id: session.user.id,
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

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const url = new URL(window.location.href);
    const requestedId = url.searchParams.get('assignment');

    let activeFilter = 'all';
    const buttons = Array.from(document.querySelectorAll('button[data-filter]'));
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-filter') || 'all';
        render();
      });
    });

    const progressMap = await loadProgressMap(gate.session);

    const listEl = document.getElementById('assignmentList');
    if (!listEl) return;

    function render() {
      const filtered = (BRADY_ASSIGNMENTS || [])
        .filter((a) => activeFilter === 'all' ? true : a.subject === activeFilter)
        .sort((a, b) => (a.priority || 9999) - (b.priority || 9999));

      listEl.innerHTML = filtered.map((a) => renderAssignmentCard(a, progressMap[a.id])).join('');

      // Wire save/reset/toggles/copy
      filtered.forEach((a) => {
        const saveBtn = document.querySelector(`button[data-save="${a.id}"]`);
        const resetBtn = document.querySelector(`button[data-reset="${a.id}"]`);
        const toggleAiBtn = document.querySelector(`button[data-toggle-ai="${a.id}"]`);
        const aiBox = document.getElementById(`ai_box_${a.id}`);
        const msgEl = document.getElementById(`save_msg_${a.id}`);
        const statusEl = document.getElementById(`status_${a.id}`);
        const notesEl = document.getElementById(`notes_${a.id}`);

        if (toggleAiBtn && aiBox) {
          toggleAiBtn.addEventListener('click', () => {
            aiBox.style.display = (aiBox.style.display === 'none') ? 'block' : 'none';
          });
        }

        if (saveBtn && statusEl && notesEl) {
          saveBtn.addEventListener('click', async () => {
            setAlert('');
            if (msgEl) msgEl.textContent = 'Saving…';
            try {
              const status = statusEl.value;
              const notes = notesEl.value || null;
              await upsertAssignmentProgress(gate.session, a.id, { status, notes });
              progressMap[a.id] = { ...(progressMap[a.id] || {}), status, notes, last_attempt_at: new Date().toISOString() };
              if (msgEl) msgEl.textContent = 'Saved.';
            } catch (e) {
              if (msgEl) msgEl.textContent = '';
              setAlert(e?.message || 'Save failed.');
            }
          });
        }

        if (resetBtn && statusEl && notesEl) {
          resetBtn.addEventListener('click', async () => {
            setAlert('');
            if (msgEl) msgEl.textContent = 'Resetting…';
            try {
              await upsertAssignmentProgress(gate.session, a.id, { status: 'not_started', notes: null, score: null });
              statusEl.value = 'not_started';
              notesEl.value = '';
              progressMap[a.id] = { ...(progressMap[a.id] || {}), status: 'not_started', notes: null, last_attempt_at: new Date().toISOString() };
              if (msgEl) msgEl.textContent = 'Reset.';
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
          target.style.borderColor = 'rgba(255, 215, 0, 0.45)';
          target.style.boxShadow = '0 0 18px rgba(255, 215, 0, 0.12)';
          setTimeout(() => {
            target.style.borderColor = '';
            target.style.boxShadow = '';
          }, 2500);
        }
      }
    }

    render();

  } catch (e) {
    setAlert(e?.message || 'Unable to load assignments.');
  }
}

document.addEventListener('DOMContentLoaded', main);
