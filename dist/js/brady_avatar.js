/* global BRADY_ASSIGNMENTS, MHA_Auth, MHA_Brady */

const AVATAR_STANDING_BANDS = [
  { min: 0, label: 'Emerging Explorer', next: 'Complete your first assignment target and 2 daily sessions this week.' },
  { min: 25, label: 'Explorer-in-Training', next: 'Build consistency on daily training and submit one assignment retake.' },
  { min: 50, label: 'Steady Competitor', next: 'Raise accuracy in your weakest assignment area by repeating assignment quizzes.' },
  { min: 75, label: 'Core Operator', next: 'Focus on reading and AI feedback loop for one assignment area each week.' },
  { min: 90, label: 'Mission-Ready', next: 'Keep current rhythm and add one high-difficulty challenge in your weakest math group.' },
];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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

  el.style.display = 'block';
  el.textContent = msg;

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

function toLocalDayISO(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDayISO(dayISO, offset) {
  if (!dayISO) return '';
  const d = new Date(`${dayISO}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return '';
  d.setDate(d.getDate() + offset);
  return toLocalDayISO(d);
}

function parseNumeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowLocalDayISO() {
  return toLocalDayISO(new Date());
}

function lastNDays(startISO, n) {
  const out = [];
  let current = startISO;
  for (let i = 0; i < n; i++) {
    out.push(current);
    current = shiftDayISO(current, -1);
  }
  return out;
}

function computeConsecutiveStreakFromRows(rows, isActiveFn, dayField = 'day') {
  const activeDays = new Set();

  (rows || []).forEach((row) => {
    if (!row || !isActiveFn(row)) return;
    const day = toLocalDayISO(new Date(`${row[dayField]}T00:00:00`));
    if (day) activeDays.add(day);
  });

  if (activeDays.size === 0) {
    return 0;
  }

  let startDay = [...activeDays].sort().reverse()[0];
  let streak = 0;
  let cursor = startDay;

  while (cursor && activeDays.has(cursor)) {
    streak += 1;
    cursor = shiftDayISO(cursor, -1);
  }

  return streak;
}

function formatPercent(v) {
  const n = parseNumeric(v, 0);
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n)}%`;
}

function summarizeAssignmentProgress(progressRows, assignmentList) {
  const assignments = Array.isArray(assignmentList) ? assignmentList : [];
  const counts = {
    total: assignments.length,
    mastered: 0,
    in_progress: 0,
    not_started: 0,
  };

  const byId = {};
  for (const row of (progressRows || [])) {
    byId[row.assignment_id] = row;
  }

  for (const a of assignments) {
    const s = String((byId[a.id]?.status || 'not_started')).toLowerCase();
    if (s === 'mastered') counts.mastered += 1;
    else if (s === 'in_progress') counts.in_progress += 1;
    else counts.not_started += 1;
  }

  const completionRate = counts.total > 0
    ? Math.round((counts.mastered / counts.total) * 100)
    : 0;

  return {
    ...counts,
    completionRate,
    byId,
  };
}

function aggregateAttempts(attemptRows) {
  const attempts = Array.isArray(attemptRows) ? attemptRows : [];
  if (!attempts.length) {
    return {
      allAttemptCount: 0,
      averageAllTime: null,
      averageLast14: null,
      attemptsThisWeek: 0,
      lastAttemptAt: '',
    };
  }

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  let total = 0;
  let totalCount = 0;
  let lastAttemptAt = '';
  let recentTotal = 0;
  let recentCount = 0;

  for (const r of attempts) {
    const score = parseNumeric(r?.score_percent, null);
    if (score === null || Number.isNaN(score)) continue;
    total += score;
    totalCount += 1;

    const ts = new Date(r?.attempted_at || 0).getTime();
    if (Number.isFinite(ts) && ts > now - fourteenDaysMs) {
      recentTotal += score;
      recentCount += 1;
    }

    if (!lastAttemptAt && Number.isFinite(ts)) {
      lastAttemptAt = toLocalDayISO(new Date(ts));
    }
  }

  if (totalCount === 0) {
    return {
      allAttemptCount: 0,
      averageAllTime: null,
      averageLast14: null,
      attemptsThisWeek: 0,
      lastAttemptAt: '',
    };
  }

  return {
    allAttemptCount: totalCount,
    averageAllTime: Math.round(total / totalCount),
    averageLast14: recentCount > 0 ? Math.round(recentTotal / recentCount) : null,
    attemptsThisWeek: recentCount,
    lastAttemptAt,
  };
}

function summarizeReading(readingRows) {
  const rows = Array.isArray(readingRows) ? readingRows : [];
  const now = nowLocalDayISO();
  const weekDays = new Set(lastNDays(now, 7));

  const totalMinutes = rows.reduce((acc, r) => acc + parseNumeric(r?.minutes, 0), 0);
  const minutesLast7 = rows
    .filter((r) => {
      const rowDay = toLocalDayISO(new Date(`${r?.day}T00:00:00`));
      return weekDays.has(rowDay);
    })
    .reduce((acc, r) => acc + parseNumeric(r?.minutes, 0), 0);

  const streak = computeConsecutiveStreakFromRows(
    rows,
    (r) => parseNumeric(r?.minutes, 0) > 0,
    'day',
  );

  const entries = rows.length;
  return {
    totalEntries: entries,
    totalMinutes,
    minutesLast7,
    streak,
    latestDay: rows[0]?.day ? toLocalDayISO(new Date(`${rows[0].day}T00:00:00`)) : '',
  };
}

function summarizeDaily(dailyRows) {
  const rows = Array.isArray(dailyRows) ? dailyRows : [];
  const now = nowLocalDayISO();
  const last14 = new Set(lastNDays(now, 14));
  const recentRows = rows.filter((r) => {
    const rowDay = toLocalDayISO(new Date(`${r?.day}T00:00:00`));
    return last14.has(rowDay);
  });

  const completedRows = recentRows.filter((r) => r?.completed);
  const completedRate = recentRows.length > 0
    ? Math.round((completedRows.length / recentRows.length) * 100)
    : 0;

  const warmupRate = countBooleanRate(rows, 'warmup_done');
  const targetRate = countBooleanRate(rows, 'target_done');
  const mixedRate = countBooleanRate(rows, 'mixed_review_done');
  const aiRate = countBooleanRate(rows, 'ai_task_done');

  const streak = computeConsecutiveStreakFromRows(
    rows,
    (r) => Boolean(r?.completed),
    'day',
  );

  return {
    totalTrackedDays: rows.length,
    completedDays: completedRows.length,
    completedRate,
    warmupRate,
    targetRate,
    mixedRate,
    aiRate,
    streak,
    latestDay: rows[0]?.day ? toLocalDayISO(new Date(`${rows[0].day}T00:00:00`)) : '',
  };
}

function countBooleanRate(rows, field) {
  let completed = 0;
  let considered = 0;
  for (const row of (rows || [])) {
    const value = Boolean(row?.[field]);
    const completedDay = Boolean(row?.completed);
    if (!completedDay) continue;
    considered += 1;
    if (value) completed += 1;
  }

  return considered > 0 ? Math.round((completed / considered) * 100) : 0;
}

function chooseStandingLabel(completionRate) {
  const n = Math.max(0, Math.min(100, parseNumeric(completionRate, 0)));
  const found = AVATAR_STANDING_BANDS
    .slice()
    .reverse()
    .find((band) => n >= band.min);
  return found || AVATAR_STANDING_BANDS[0];
}

function pickLearnerTitle(context, profile, identityLabel) {
  const isSelf = context?.isSelf;
  const role = String(context?.role || 'student').trim();
  const roleLabel = role ? `(${role})` : '';

  const name = identityLabel || profile?.display_name || '';
  if (!name) {
    return isSelf ? 'You (No profile set yet)' : 'Linked Learner';
  }
  return isSelf ? `${name} ${roleLabel}`.trim() : `${name} • ${roleLabel || 'Learner'}`;
}

async function loadProfile(userId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('display_name, hunter_rank, xp_total')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadAssignmentProgress(userId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('assignment_id,status,score,last_attempt_at')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

async function loadAssignmentAttempts(userId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_attempts')
    .select('assignment_id,attempted_at,score_percent')
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false })
    .limit(300);

  if (error) throw error;
  return data || [];
}

async function loadDailyTrainingLog(userId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_daily_training_log')
    .select('day,completed,warmup_done,target_done,mixed_review_done,ai_task_done')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(120);

  if (error) throw error;
  return data || [];
}

async function loadReadingLog(userId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_reading_log')
    .select('day,minutes')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data || [];
}

function buildIdentityHtml(leader, profile, context, assignmentSummary, attemptAgg) {
  const displayName = pickLearnerTitle(context, profile, leader);
  const rank = String(profile?.hunter_rank || 'E-Rank');
  const xp = parseNumeric(profile?.xp_total, 0);
  const completionRate = assignmentSummary?.completionRate || 0;
  const standing = chooseStandingLabel(completionRate);

  return `
    <div class="pill-row">
      <span class="pill">${escapeHtml(displayName)}</span>
      <span class="status-badge" style="border-color: rgba(255, 215, 0, 0.35); color: var(--accent-gold);">${escapeHtml(rank)}</span>
      <span class="pill mono">${xp} XP</span>
      <span class="pill">${parseNumeric(attemptAgg?.allAttemptCount, 0)} assignment tests</span>
    </div>
    <div class="small" style="margin-top:8px;">Assignment mastery standing: <span class="mono">${escapeHtml(standing.label)}</span></div>
    <div class="small" style="margin-top:8px;">${escapeHtml(standing.next)}</div>
  `;
}

function renderAssignmentSummary(summary) {
  const el = document.getElementById('assignmentSection');
  if (!el) return;

  const total = parseNumeric(summary.total, 0);
  const mastered = parseNumeric(summary.mastered, 0);
  const inProgress = parseNumeric(summary.in_progress, 0);
  const notStarted = parseNumeric(summary.not_started, 0);
  const completionRate = parseNumeric(summary.completionRate, 0);

  el.innerHTML = `
    <div class="pill-row">
      <span class="pill mono">${mastered}/${total} mastered</span>
      <span class="pill mono">${inProgress} in progress</span>
      <span class="pill mono">${notStarted} not started</span>
    </div>
    <div class="small" style="margin-top:8px;">Completion rate: <span class="mono">${formatPercent(completionRate)}</span></div>
    <div class="table-wrap" style="margin-top:10px; overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Why it matters</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total assigned targets</td>
            <td class="mono">${total}</td>
            <td class="small">This is the full target set that drives readiness.</td>
          </tr>
          <tr>
            <td>Strongest signal</td>
            <td class="mono">${mastered}</td>
            <td class="small">Rows with status <span class="mono">mastered</span> are fully passed with required score.</td>
          </tr>
          <tr>
            <td>Active signal</td>
            <td class="mono">${inProgress}</td>
            <td class="small">These are currently visible in the training queue with partial progress.</td>
          </tr>
          <tr>
            <td>Unopened signal</td>
            <td class="mono">${notStarted}</td>
            <td class="small">Unseen items to begin when schedule allows.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderMomentumSection({ daily, reading }) {
  const dailyEl = document.getElementById('dailyMomentumCard');
  if (dailyEl) {
    const content = dailyEl.querySelector('.small') || dailyEl;
    const warmupRate = parseNumeric(daily?.warmupRate, 0);
    const targetRate = parseNumeric(daily?.targetRate, 0);
    const mixedRate = parseNumeric(daily?.mixedRate, 0);
    const aiRate = parseNumeric(daily?.aiRate, 0);
    const completedRate = parseNumeric(daily?.completedRate, 0);

    dailyEl.innerHTML = `
      <h2>Daily Momentum</h2>
      <div class="pill-row" style="margin-top:8px;">
        <span class="pill">Streak ${parseNumeric(daily?.streak, 0)} day(s)</span>
        <span class="pill mono">Completed ${parseNumeric(daily?.completedDays, 0)}/${parseNumeric(daily?.totalTrackedDays, 0)}</span>
        <span class="pill mono">Completed rate ${formatPercent(completedRate)}</span>
      </div>
      <div class="small" style="margin-top:8px;">Task consistency: warm-up ${formatPercent(warmupRate)}, target ${formatPercent(targetRate)}, mixed ${formatPercent(mixedRate)}, AI ${formatPercent(aiRate)}.</div>
    `;
  }

  const readingEl = document.getElementById('readingMomentumCard');
  if (readingEl) {
    const streak = parseNumeric(reading?.streak, 0);
    const totalMinutes = parseNumeric(reading?.totalMinutes, 0);
    const minutesLast7 = parseNumeric(reading?.minutesLast7, 0);
    readingEl.innerHTML = `
      <h2>Reading Momentum</h2>
      <div class="pill-row" style="margin-top:8px;">
        <span class="pill">Streak ${streak} day(s)</span>
        <span class="pill mono">${totalMinutes} total minutes</span>
        <span class="pill mono">${minutesLast7} min in 7 days</span>
      </div>
      <div class="small" style="margin-top:8px;">Recent consistency score: ${parseNumeric(reading?.totalEntries, 0)} entries logged.</div>
    `;
  }
}

function renderPerformance(attemptAgg) {
  const el = document.getElementById('performanceSection');
  if (!el) return;

  const allTime = attemptAgg.averageAllTime;
  const last14 = attemptAgg.averageLast14;
  const tests = parseNumeric(attemptAgg.allAttemptCount, 0);
  const recent = parseNumeric(attemptAgg.attemptsThisWeek, 0);
  const last = attemptAgg.lastAttemptAt ? escapeHtml(attemptAgg.lastAttemptAt) : 'none yet';

  el.innerHTML = `
    <div class="table-wrap" style="overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Value</th>
            <th>How to read it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>All-time test accuracy</td>
            <td class="mono">${allTime === null ? 'No test yet' : formatPercent(allTime)}</td>
            <td class="small">Raw completion score across all graded attempts.</td>
          </tr>
          <tr>
            <td>Last 14 days</td>
            <td class="mono">${last14 === null ? 'Not enough data' : formatPercent(last14)}</td>
            <td class="small">The trend to check whether recent work improved.</td>
          </tr>
          <tr>
            <td>Attempt volume</td>
            <td class="mono">${tests} total / ${recent} last 14d</td>
            <td class="small">Higher volume only helps if accuracy follows up.</td>
          </tr>
          <tr>
            <td>Last test date</td>
            <td class="mono">${last}</td>
            <td class="small">Shows if this learner has recent proof of work.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderNextSteps({ assignmentSummary, attemptAgg, daily, reading }) {
  const el = document.getElementById('nextStepsSection');
  if (!el) return;

  const completionRate = parseNumeric(assignmentSummary?.completionRate, 0);
  const tasks = [];

  if (completionRate < 40) {
    tasks.push('Finish the current mission target from the dashboard before adding extra practice.');
  }
  if (parseNumeric(daily?.streak, 0) < 3) {
    tasks.push('Prioritize 3 daily sessions this week to rebuild routine and consistency.');
  }
  if (parseNumeric(reading?.streak, 0) < 2) {
    tasks.push('Add at least one 15+ minute reading entry daily for 7 days.');
  }
  if (attemptAgg.averageLast14 !== null && parseNumeric(attemptAgg.averageLast14, 0) < 75) {
    tasks.push('Review missed tags in your last failed attempt and use AI prompt regeneration if the system provides one.');
  }

  if (tasks.length === 0) {
    tasks.push('Keep the rhythm: one assignment test each week and full daily training each day.');
  }

  el.innerHTML = `
    <ul style="padding-left: 18px; margin-top: 6px;">
      ${tasks.map((item) => `<li class="small">${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function renderStanding(standingEl, summary) {
  if (!standingEl) return;

  const standing = chooseStandingLabel(summary?.completionRate || 0);
  const mastery = parseNumeric(summary?.completionRate, 0);
  standingEl.innerHTML = `
    <div class="pill-row" style="margin-top:0;">
      <span class="pill">Standing: ${escapeHtml(standing.label)}</span>
      <span class="status-badge in_progress">${parseNumeric(summary.mastered, 0)} / ${parseNumeric(summary.total, 0)} mastered</span>
      <span class="pill mono">Mastery ${formatPercent(mastery)}</span>
    </div>
  `;
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/avatar.html' });
    if (!gate) return;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const context = gate.context || {};
    const leaderLabel = context.label || gate.session?.user?.email || '';
    const { userId } = MHA_Brady.getBradyQueryUser(gate.session, context);

    const [profile, progressRows, attemptRows, dailyRows, readingRows] = await Promise.all([
      loadProfile(userId),
      loadAssignmentProgress(userId),
      loadAssignmentAttempts(userId),
      loadDailyTrainingLog(userId),
      loadReadingLog(userId),
    ]);

    const assignmentSummary = summarizeAssignmentProgress(progressRows, BRADY_ASSIGNMENTS);
    const attemptAgg = aggregateAttempts(attemptRows);
    const daily = summarizeDaily(dailyRows);
    const reading = summarizeReading(readingRows);

    const identity = buildIdentityHtml(leaderLabel, profile, context, assignmentSummary, attemptAgg);
    const standingEl = document.getElementById('standingSection');

    document.getElementById('identitySection').innerHTML = identity;
    renderStanding(standingEl, assignmentSummary);
    renderAssignmentSummary(assignmentSummary);
    renderMomentumSection({ daily, reading });
    renderPerformance(attemptAgg);
    renderNextSteps({ assignmentSummary, attemptAgg, daily, reading });

    setAlert('', true);
  } catch (error) {
    setAlert(error?.message || 'Unable to load avatar page.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void main();
});

window.BRADY_AVATAR = {
  toLocalDayISO,
  shiftDayISO,
  computeConsecutiveStreakFromRows,
  summarizeAssignmentProgress,
  summarizeDaily,
  summarizeReading,
  aggregateAttempts,
  chooseStandingLabel,
  nowLocalDayISO,
};
