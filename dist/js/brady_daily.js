/* global BRADY_ASSIGNMENTS */

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function titleCase(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
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

async function loadAssignmentProgress(session) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('assignment_id,status')
    .eq('user_id', session.user.id);
  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => { map[row.assignment_id] = row.status; });
  return map;
}

function pickTargetAssignment(progressById) {
  const list = (BRADY_ASSIGNMENTS || []).slice().sort((a, b) => (a.priority || 9999) - (b.priority || 9999));
  const firstNotMastered = list.find((a) => (progressById[a.id] || 'not_started') !== 'mastered');
  return firstNotMastered || list[0] || null;
}

async function loadDailyLog(session, dayISO) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_daily_training_log')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('day', dayISO)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function upsertDailyLog(session, dayISO, patch) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_daily_training_log')
    .upsert({
      user_id: session.user.id,
      day: dayISO,
      ...patch,
    }, { onConflict: 'user_id,day' });
  if (error) throw error;
}

function renderPlan(dayISO, target, state) {
  const el = document.getElementById('dailyPlan');
  if (!el) return;

  const warmup = !!state.warmup_done;
  const targetDone = !!state.target_done;
  const mixed = !!state.mixed_review_done;
  const ai = !!state.ai_task_done;
  const completed = !!state.completed;

  const targetLink = target
    ? `assignments.html?assignment=${encodeURIComponent(target.id)}`
    : 'assignments.html';

  el.innerHTML = `
    <h2>Plan for ${dayISO}</h2>
    <div class="small" style="margin-top:6px;">
      Target assignment: ${target ? `<a href="${targetLink}" style="color: var(--accent-blue); text-decoration:none;">${target.title}</a>` : 'None found'}
    </div>

    <div class="section" style="margin-top:14px;">
      <h2>Steps</h2>
      <div class="small">Check each box when finished. Your progress saves automatically.</div>
      <div style="margin-top:12px; display:grid; gap:10px;">
        <label class="small" style="display:flex; gap:10px; align-items:flex-start; text-transform:none; letter-spacing:0;">
          <input id="warmup_done" type="checkbox" ${warmup ? 'checked' : ''} style="width:auto; margin-top:4px;">
          <span><strong>Warm-up (5 min)</strong><br>Quick review: fractions/operations/place value. Keep it fast.</span>
        </label>

        <label class="small" style="display:flex; gap:10px; align-items:flex-start; text-transform:none; letter-spacing:0;">
          <input id="target_done" type="checkbox" ${targetDone ? 'checked' : ''} style="width:auto; margin-top:4px;">
          <span><strong>Target Skill (10–15 min)</strong><br>Work today's target assignment. Write 1-2 notes about what was confusing.</span>
        </label>

        <label class="small" style="display:flex; gap:10px; align-items:flex-start; text-transform:none; letter-spacing:0;">
          <input id="mixed_review_done" type="checkbox" ${mixed ? 'checked' : ''} style="width:auto; margin-top:4px;">
          <span><strong>Mixed Review (5–10 min)</strong><br>Pick one older assignment and do a short review so skills stick.</span>
        </label>

        <label class="small" style="display:flex; gap:10px; align-items:flex-start; text-transform:none; letter-spacing:0;">
          <input id="ai_task_done" type="checkbox" ${ai ? 'checked' : ''} style="width:auto; margin-top:4px;">
          <span><strong>AI Co-Learning (5–10 min)</strong><br>Use ChatGPT/Codex/Claude to practice the skill and learn how to prompt.</span>
        </label>
      </div>
    </div>

    <div class="section" style="margin-top:14px;">
      <h2>Reflection (2–3 sentences)</h2>
      <div class="small">What was hardest? What clicked? What do you do tomorrow?</div>
      <textarea id="reflection" placeholder="Example: I kept mixing up..., but then I realized... Tomorrow I will...">${state.reflection || ''}</textarea>
      <div class="btn-row">
        <button class="btn secondary" type="button" id="openTarget">Open Target Assignment</button>
        <span class="small" id="saveMsg">${completed ? 'Completed today.' : ''}</span>
      </div>
    </div>
  `;

  const openTargetBtn = document.getElementById('openTarget');
  if (openTargetBtn) {
    openTargetBtn.addEventListener('click', () => {
      window.location.href = targetLink;
    });
  }
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/daily.html' });
    if (!gate) return;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const dayISO = todayLocalISO();
    const progressById = await loadAssignmentProgress(gate.session);
    const target = pickTargetAssignment(progressById);

    const existing = await loadDailyLog(gate.session, dayISO);
    const state = {
      warmup_done: !!existing?.warmup_done,
      target_done: !!existing?.target_done,
      mixed_review_done: !!existing?.mixed_review_done,
      ai_task_done: !!existing?.ai_task_done,
      reflection: existing?.reflection || '',
      completed: !!existing?.completed,
    };

    renderPlan(dayISO, target, state);

    // Ensure target assignment is stored for today (useful for history/consistency).
    await upsertDailyLog(gate.session, dayISO, { target_assignment_id: target?.id || null });

    const bind = (id, key) => {
      const cb = document.getElementById(id);
      if (!cb) return;
      cb.addEventListener('change', async () => {
        setAlert('');
        state[key] = !!cb.checked;
        const completed = !!state.warmup_done && !!state.target_done && !!state.mixed_review_done && !!state.ai_task_done;
        state.completed = completed;
        const saveMsg = document.getElementById('saveMsg');
        if (saveMsg) saveMsg.textContent = 'Saving…';
        try {
          await upsertDailyLog(gate.session, dayISO, {
            warmup_done: !!state.warmup_done,
            target_done: !!state.target_done,
            mixed_review_done: !!state.mixed_review_done,
            ai_task_done: !!state.ai_task_done,
            completed,
          });
          if (saveMsg) saveMsg.textContent = completed ? 'Completed today.' : 'Saved.';
        } catch (e) {
          if (saveMsg) saveMsg.textContent = '';
          setAlert(e?.message || 'Save failed.');
        }
      });
    };

    bind('warmup_done', 'warmup_done');
    bind('target_done', 'target_done');
    bind('mixed_review_done', 'mixed_review_done');
    bind('ai_task_done', 'ai_task_done');

    const reflectionEl = document.getElementById('reflection');
    if (reflectionEl) {
      let timeout = null;
      reflectionEl.addEventListener('input', () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(async () => {
          setAlert('');
          state.reflection = reflectionEl.value || '';
          const saveMsg = document.getElementById('saveMsg');
          if (saveMsg) saveMsg.textContent = 'Saving…';
          try {
            await upsertDailyLog(gate.session, dayISO, { reflection: state.reflection });
            if (saveMsg) saveMsg.textContent = state.completed ? 'Completed today.' : 'Saved.';
          } catch (e) {
            if (saveMsg) saveMsg.textContent = '';
            setAlert(e?.message || 'Save failed.');
          }
        }, 700);
      });
    }
  } catch (e) {
    setAlert(e?.message || 'Unable to load daily training.');
  }
}

document.addEventListener('DOMContentLoaded', main);

