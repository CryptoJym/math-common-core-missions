/* global BRADY_ASSIGNMENTS */

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

async function loadAssignmentProgress(session, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('assignment_id,status,last_attempt_at')
    .eq('user_id', queryUserId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.assignment_id] = r; });
  return map;
}

function pickTargetAssignment(progressMap) {
  const list = (BRADY_ASSIGNMENTS || []).slice().sort((a, b) => (a.priority || 9999) - (b.priority || 9999));
  const firstNotMastered = list.find((a) => (progressMap[a.id]?.status || 'not_started') !== 'mastered');
  return firstNotMastered || list[0] || null;
}

async function loadDailyLog(session, dayISO, queryUserId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_daily_training_log')
    .select('*')
    .eq('user_id', queryUserId)
    .eq('day', dayISO)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function loadReadingMinutesThisWeek(session, queryUserId) {
  // We avoid date math in SQL to keep it simple; just fetch last ~10 rows and sum client-side.
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_reading_log')
    .select('day,minutes')
    .eq('user_id', queryUserId)
    .order('day', { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = data || [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  let total = 0;
  rows.forEach((r) => {
    if (!r.day) return;
    const d = new Date(`${r.day}T00:00:00`);
    if (d >= start) total += Number(r.minutes) || 0;
  });
  return total;
}

function renderTodaySummary(dayISO, daily, readingMinutesWeek) {
  const el = document.getElementById('todaySummary');
  if (!el) return;

  if (!daily) {
    el.innerHTML = `
      <div class="small">No training saved yet for today.</div>
      <div class="btn-row">
        <a class="btn secondary" href="daily.html" style="text-decoration:none; display:inline-flex; align-items:center;">Start Daily Training</a>
      </div>
      <div class="small" style="margin-top:10px;">Reading (last 7 days): <span class="mono">${readingMinutesWeek}</span> minutes</div>
    `;
    return;
  }

  const done = (v) => v ? '✅' : '⬜';
  el.innerHTML = `
    <div class="small">Today is <span class="mono">${dayISO}</span>.</div>
    <div class="small" style="margin-top:10px;">
      ${done(daily.warmup_done)} Warm-up<br>
      ${done(daily.target_done)} Target Skill<br>
      ${done(daily.mixed_review_done)} Mixed Review<br>
      ${done(daily.ai_task_done)} AI Co-Learning
    </div>
    <div class="small" style="margin-top:10px;">Reading (last 7 days): <span class="mono">${readingMinutesWeek}</span> minutes</div>
    <div class="btn-row">
      <a class="btn secondary" href="daily.html" style="text-decoration:none; display:inline-flex; align-items:center;">
        ${daily.completed ? 'View Daily Training' : 'Continue Daily Training'}
      </a>
    </div>
  `;
}

function renderNextUp(target, progressRow) {
  const el = document.getElementById('nextUp');
  if (!el) return;

  if (!target) {
    el.textContent = 'No assignments found.';
    return;
  }

  const status = progressRow?.status || 'not_started';
  const last = progressRow?.last_attempt_at ? new Date(progressRow.last_attempt_at).toLocaleString() : '';
  const link = `assignment.html?id=${encodeURIComponent(target.id)}`;

  el.innerHTML = `
    <div class="pill-row">
      <span class="pill">${target.subject}</span>
      <span class="status-badge ${status}">${status.replace(/_/g, ' ')}</span>
      ${last ? `<span class="small">Last updated: ${last}</span>` : ''}
    </div>
    <div style="margin-top:10px; font-family: 'Orbitron', sans-serif; color: var(--accent-gold);">${target.title}</div>
    <div class="btn-row">
      <a class="btn secondary" href="${link}" style="text-decoration:none; display:inline-flex; align-items:center;">Open Assignment</a>
      <a class="btn secondary" href="daily.html" style="text-decoration:none; display:inline-flex; align-items:center;">Do Today’s Training</a>
    </div>
  `;
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/index.html' });
    if (!gate) return;

    if (window.MHA_BradyNav && typeof window.MHA_BradyNav.setContext === 'function') {
      window.MHA_BradyNav.setContext(gate.context);
    }

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');
    const { userId: queryUserId } = MHA_Brady.getBradyQueryUser(gate.session, gate.context);

    const dayISO = todayLocalISO();
    const progressMap = await loadAssignmentProgress(gate.session, queryUserId);
    const target = pickTargetAssignment(progressMap);
    const daily = await loadDailyLog(gate.session, dayISO, queryUserId);
    const readingMinutesWeek = await loadReadingMinutesThisWeek(gate.session, queryUserId);

    renderTodaySummary(dayISO, daily, readingMinutesWeek);
    renderNextUp(target, progressMap[target?.id]);
  } catch (e) {
    setAlert(e?.message || 'Unable to load Brady dashboard.');
  }
}

document.addEventListener('DOMContentLoaded', main);
