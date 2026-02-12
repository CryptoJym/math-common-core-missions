/* global BRADY_ASSIGNMENTS, BRADY_QUIZ */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function seedFromString(s) {
  // FNV-1a 32-bit hash (stable across sessions)
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

function pickMixedAssignment(progressById, target, dayISO) {
  const list = (BRADY_ASSIGNMENTS || []).slice().sort((a, b) => (a.priority || 9999) - (b.priority || 9999));
  const mastered = list.filter((a) => (progressById[a.id] || 'not_started') === 'mastered');
  const pool = (mastered.length > 0 ? mastered : list).filter((a) => a && a.id && a.id !== target?.id);
  if (pool.length === 0) return null;
  const idx = seedFromString(`daily_mixed_pick:${dayISO}`) % pool.length;
  return pool[idx];
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

async function loadDailyPracticeAttempts(session, dayISO) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_practice_attempts')
    .select('practice_kind,day,assignment_id,seed,practiced_at,score_percent,total_questions,correct_questions')
    .eq('user_id', session.user.id)
    .eq('day', dayISO)
    .in('practice_kind', ['daily_warmup', 'daily_target', 'daily_mixed', 'daily_ai'])
    .order('practiced_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

function findLatestPassingAttempt(attempts, kind, assignmentId, passPercent) {
  const pp = Number(passPercent || 80);
  for (const row of (attempts || [])) {
    if (!row) continue;
    if (row.practice_kind !== kind) continue;
    if (String(row.assignment_id || '') !== String(assignmentId || '')) continue;
    const score = Number(row.score_percent);
    if (Number.isFinite(score) && score >= pp) return row;
  }
  return null;
}

function parseFractionInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0].trim());
    const den = Number(parts[1].trim());
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return { num, den };
  }
  const v = Number(s);
  if (Number.isFinite(v)) {
    const den = 1000;
    const num = Math.round(v * den);
    return { num, den };
  }
  return null;
}

function fracEqual(a, b) {
  if (!a || !b) return false;
  return a.num * b.den === b.num * a.den;
}

function parseNumberSet(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  const parts = s.split(/[^0-9\\-]+/g).filter(Boolean);
  const nums = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  const unique = Array.from(new Set(nums)).sort((x, y) => x - y);
  return unique;
}

function arrayEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseExpandedSum(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, '');
  const pieces = cleaned.split('+').map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0) return null;
  let sum = 0;
  for (const p of pieces) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    sum += n;
  }
  return sum;
}

function gradeQuestion(q, rawAnswer) {
  const explanation = q.explanation || '';
  const expected = q.answer;

  if (q.type === 'mc') {
    const correct = String(rawAnswer || '') === String(expected);
    return { correct, expected: String(expected), explanation };
  }

  if (q.type === 'number') {
    const given = Number(String(rawAnswer || '').trim());
    const correct = Number.isFinite(given) && Math.abs(given - Number(expected)) < 1e-9;
    return { correct, expected: String(expected), explanation };
  }

  if (q.type === 'fraction') {
    const given = parseFractionInput(rawAnswer);
    const correct = given ? fracEqual(given, expected) : false;
    return { correct, expected: `${expected.num}/${expected.den}`, explanation };
  }

  if (q.type === 'set_numbers') {
    const given = parseNumberSet(rawAnswer);
    const correct = arrayEqual(given, expected);
    return { correct, expected: expected.join(', '), explanation: explanation || 'Enter all numbers, separated by commas.' };
  }

  if (q.type === 'expanded_sum') {
    const given = parseExpandedSum(rawAnswer);
    const correct = given !== null && Number(given) === Number(expected);
    return { correct, expected: String(expected), explanation: explanation || 'Expanded form is a sum of place-value parts.' };
  }

  return { correct: false, expected: String(expected), explanation };
}

function getAnswerFromDom(sectionKey, q) {
  const id = `${sectionKey}_ans_${q.id}`;
  const el = document.getElementById(id);
  if (!el) return null;
  return el.value;
}

function setInputsDisabled(sectionKey, quiz, disabled) {
  for (const q of (quiz.questions || [])) {
    const id = `${sectionKey}_ans_${q.id}`;
    const el = document.getElementById(id);
    if (el) el.disabled = Boolean(disabled);
  }
}

async function saveDailyAttempt(session, dayISO, practiceKind, assignmentId, seed, summary, answers, results) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_practice_attempts').insert({
    user_id: session.user.id,
    practice_kind: practiceKind,
    day: dayISO,
    assignment_id: assignmentId,
    based_on_attempted_at: null,
    seed,
    score_percent: summary.scorePercent,
    total_questions: summary.totalQuestions,
    correct_questions: summary.correctQuestions,
    answers,
    results,
  });
  if (error) throw error;
}

function renderQuizSection(sectionKey, title, subtitleHtml, quiz, seed, status) {
  const host = document.getElementById(`${sectionKey}Section`);
  if (!host) return;

  const qCount = (quiz.questions || []).length;
  const passPercent = Number(quiz.passPercent || 80);
  const doneHtml = status?.passed
    ? `<span class="status-badge mastered">Completed</span>`
    : `<span class="status-badge not_started">Not done</span>`;

  const questionHtml = (quiz.questions || []).map((q, idx) => {
    const number = idx + 1;
    const inputId = `${sectionKey}_ans_${q.id}`;
    const feedbackId = `${sectionKey}_feedback_${q.id}`;

    let inputHtml = '';
    if (q.type === 'mc') {
      inputHtml = `
        <label for="${escapeHtml(inputId)}">Answer</label>
        <select id="${escapeHtml(inputId)}">
          <option value="" selected disabled>Select…</option>
          ${(q.choices || []).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
      `;
    } else {
      const placeholder =
        q.type === 'fraction' ? 'Example: 3/4' :
        q.type === 'set_numbers' ? 'Example: 1,2,3,6' :
        q.type === 'expanded_sum' ? 'Example: 500000 + 7000 + 400 + 30 + 2' :
        'Type your answer';
      inputHtml = `
        <label for="${escapeHtml(inputId)}">Answer</label>
        <input id="${escapeHtml(inputId)}" type="text" placeholder="${escapeHtml(placeholder)}">
      `;
    }

    return `
      <div class="section" style="margin-top:14px;" data-daily-question="${escapeHtml(sectionKey)}:${escapeHtml(q.id)}">
        <h2>Question ${number}</h2>
        <div class="small" style="white-space:pre-wrap;">${escapeHtml(q.prompt)}</div>
        <div class="field-row" style="margin-top:12px;">
          <div>${inputHtml}</div>
        </div>
        <div class="small" id="${escapeHtml(feedbackId)}"></div>
      </div>
    `;
  }).join('');

  const statusLine = status?.passed
    ? `<div class="small" style="margin-top:8px;">Latest passing score: <span class="mono">${escapeHtml(status.scorePercent)}%</span> (${escapeHtml(status.correctQuestions)}/${escapeHtml(status.totalQuestions)})</div>`
    : '';

  host.innerHTML = `
    <h2>${escapeHtml(title)} ${doneHtml}</h2>
    <div class="small">${subtitleHtml}</div>
    ${statusLine}
    <div class="pill-row" style="margin-top:10px;">
      <span class="pill mono">Seed ${escapeHtml(seed)}</span>
      <span class="pill mono">${escapeHtml(qCount)} problems</span>
      <span class="pill mono">Pass >= ${escapeHtml(passPercent)}%</span>
    </div>
    <div class="small" id="${escapeHtml(sectionKey)}Msg" style="margin-top:10px;"></div>
    ${questionHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn" type="button" id="${escapeHtml(sectionKey)}Submit">Submit & Grade</button>
      <button class="btn secondary" type="button" id="${escapeHtml(sectionKey)}New">New Version</button>
    </div>
  `;
}

function renderDailyLayout(dayISO, target, mixed, completion, reflection) {
  const el = document.getElementById('dailyPlan');
  if (!el) return;

  const targetLink = target ? `assignment.html?id=${encodeURIComponent(target.id)}` : 'assignments.html';
  const mixedText = mixed ? escapeHtml(mixed.title) : 'None found';

  const pill = (label, passed) => {
    const cls = passed ? 'pill pill-math' : 'pill';
    const suffix = passed ? 'Done' : 'Not done';
    return `<span class="${cls}">${escapeHtml(label)}: <span class="mono">${escapeHtml(suffix)}</span></span>`;
  };

  el.innerHTML = `
    <h2>Daily Training for ${escapeHtml(dayISO)}</h2>
    <div class="small" style="margin-top:6px;">
      Target assignment: ${target ? `<a href="${targetLink}" style="color: var(--accent-blue); text-decoration:none;">${escapeHtml(target.title)}</a>` : 'None found'}
      <br>
      Mixed review focus: <span class="mono">${mixedText}</span>
    </div>

    <div class="pill-row" style="margin-top:12px;">
      ${pill('Warm-up', completion.warmup)}
      ${pill('Target', completion.target)}
      ${pill('Mixed', completion.mixed)}
      ${pill('AI', completion.ai)}
      <span class="pill ${completion.completed ? 'pill-math' : ''}">Completed: <span class="mono">${completion.completed ? 'Yes' : 'No'}</span></span>
    </div>

    <div id="warmupSection" class="section" style="margin-top:18px;"></div>
    <div id="targetSection" class="section"></div>
    <div id="mixedSection" class="section"></div>
    <div id="aiSection" class="section"></div>

    <div class="section" style="margin-top:18px;">
      <h2>Reflection (2–3 sentences)</h2>
      <div class="small">What was hardest? What clicked? What do you do tomorrow?</div>
      <textarea id="reflection" placeholder="Example: I kept mixing up..., but then I realized... Tomorrow I will...">${escapeHtml(reflection || '')}</textarea>
      <div class="btn-row">
        <button class="btn secondary" type="button" id="openTarget">Open Target Assignment</button>
        <span class="small" id="saveMsg">${completion.completed ? 'Completed today.' : ''}</span>
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

function bindQuizSectionHandlers(opts) {
  const {
    session,
    dayISO,
    sectionKey,
    practiceKind,
    assignmentId,
    getSeed,
    getQuiz,
    onPassed,
  } = opts;

  const submitBtn = document.getElementById(`${sectionKey}Submit`);
  const newBtn = document.getElementById(`${sectionKey}New`);
  const msgEl = document.getElementById(`${sectionKey}Msg`);

  const gradeAndSave = async () => {
    setAlert('');
    if (msgEl) msgEl.textContent = 'Grading…';
    if (submitBtn) submitBtn.disabled = true;

    try {
      const seed = getSeed();
      const quiz = getQuiz();
      let correct = 0;
      const missing = [];
      const answers = {};
      const results = {};

      for (let idx = 0; idx < quiz.questions.length; idx++) {
        const q = quiz.questions[idx];
        const raw = getAnswerFromDom(sectionKey, q);
        answers[q.id] = raw;

        const isMissing = raw == null || String(raw).trim() === '';
        if (isMissing) {
          missing.push(idx + 1);
          continue;
        }

        const r = gradeQuestion(q, raw);
        results[q.id] = {
          ...r,
          prompt: q.prompt || '',
          type: q.type || '',
          choices: q.type === 'mc' ? (q.choices || []) : [],
          tags: q.tags || [],
        };
        if (r.correct) correct++;

        const feedbackEl = document.getElementById(`${sectionKey}_feedback_${q.id}`);
        if (feedbackEl) {
          if (r.correct) {
            feedbackEl.innerHTML = `<span style="color: var(--accent-green);">Correct.</span>`;
          } else {
            feedbackEl.innerHTML = `<span style="color: var(--accent-red);">Incorrect.</span> Expected: <span class="mono">${escapeHtml(r.expected)}</span>${r.explanation ? `<div class="small" style="margin-top:6px;">${escapeHtml(r.explanation)}</div>` : ''}`;
          }
        }
      }

      if (missing.length > 0) {
        if (msgEl) msgEl.textContent = `Answer every question before submitting. Missing: ${missing.map((n) => `#${n}`).join(', ')}`;
        return;
      }

      const total = quiz.questions.length;
      const scorePercent = Math.round((correct / total) * 100);
      const passed = scorePercent >= Number(quiz.passPercent || 80);

      const summary = {
        seed,
        passPercent: Number(quiz.passPercent || 80),
        totalQuestions: total,
        correctQuestions: correct,
        scorePercent,
        passed,
      };

      if (msgEl) msgEl.textContent = `Score: ${scorePercent}% (${correct}/${total}). ${passed ? 'Passed.' : `Need >= ${summary.passPercent}%.`}`;

      // Save the attempt so completion is provable (even if it did not pass yet).
      await saveDailyAttempt(session, dayISO, practiceKind, assignmentId, seed, summary, answers, results);

      if (passed) {
        setInputsDisabled(sectionKey, quiz, true);
        await onPassed(summary);
      }
    } catch (e) {
      if (msgEl) msgEl.textContent = '';
      setAlert(e?.message || 'Save failed.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  if (submitBtn) submitBtn.addEventListener('click', () => { void gradeAndSave(); });
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      // Re-rendering is handled by the caller (we simply reload for simplicity).
      // This also keeps the daily plan deterministic unless they explicitly request a new version.
      const nextSeed = (Date.now() & 0xffffffff) >>> 0;
      window.location.search = `?seed_${encodeURIComponent(sectionKey)}=${encodeURIComponent(nextSeed)}`;
    });
  }
}

async function main() {
  try {
    const gate = await MHA_Brady.requireBrady({ nextPath: 'brady/daily.html' });
    if (!gate) return;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const url = new URL(window.location.href);
    const dayISO = todayLocalISO();

    const progressById = await loadAssignmentProgress(gate.session);
    const target = pickTargetAssignment(progressById);
    const mixed = pickMixedAssignment(progressById, target, dayISO);

    // Ensure target assignment is stored for today (useful for history/consistency).
    await upsertDailyLog(gate.session, dayISO, { target_assignment_id: target?.id || null });

    const existingLog = await loadDailyLog(gate.session, dayISO);
    const reflection = existingLog?.reflection || '';

    let attempts = [];
    try {
      attempts = await loadDailyPracticeAttempts(gate.session, dayISO);
    } catch (e) {
      setAlert(e?.message || 'Daily quizzes are not available yet (database table missing).');
      return;
    }

    const warmupAssignmentId = 'daily_warmup';
    const aiAssignmentId = 'daily_ai';
    const targetAssignmentId = target?.id || '';
    const mixedAssignmentId = mixed?.id || '';

    const warmupQuiz = BRADY_QUIZ.buildDailyWarmupQuiz(seedFromString(`daily_warmup:${dayISO}`));
    const aiQuiz = BRADY_QUIZ.buildDailyAiQuiz(seedFromString(`daily_ai:${dayISO}`));
    const targetQuiz = target ? BRADY_QUIZ.buildPracticeQuiz(target, seedFromString(`daily_target:${dayISO}:${target.id}`)) : { passPercent: 80, title: 'Target', questions: [] };
    const mixedQuiz = mixed ? BRADY_QUIZ.buildPracticeQuiz(mixed, seedFromString(`daily_mixed:${dayISO}:${mixed.id}`)) : { passPercent: 80, title: 'Mixed', questions: [] };

    const warmupPassedRow = findLatestPassingAttempt(attempts, 'daily_warmup', warmupAssignmentId, warmupQuiz.passPercent);
    const targetPassedRow = target ? findLatestPassingAttempt(attempts, 'daily_target', targetAssignmentId, targetQuiz.passPercent) : null;
    const mixedPassedRow = mixed ? findLatestPassingAttempt(attempts, 'daily_mixed', mixedAssignmentId, mixedQuiz.passPercent) : null;
    const aiPassedRow = findLatestPassingAttempt(attempts, 'daily_ai', aiAssignmentId, aiQuiz.passPercent);

    const completion = {
      warmup: Boolean(warmupPassedRow),
      target: Boolean(targetPassedRow),
      mixed: Boolean(mixedPassedRow),
      ai: Boolean(aiPassedRow),
      completed: Boolean(warmupPassedRow && (target ? targetPassedRow : true) && (mixed ? mixedPassedRow : true) && aiPassedRow),
    };

    // Keep the legacy daily log booleans in sync (derived from the graded quizzes).
    await upsertDailyLog(gate.session, dayISO, {
      warmup_done: completion.warmup,
      target_done: completion.target,
      mixed_review_done: completion.mixed,
      ai_task_done: completion.ai,
      completed: completion.completed,
    });

    renderDailyLayout(dayISO, target, mixed, completion, reflection);

    const warmupSeed = Number(url.searchParams.get('seed_warmup')) || seedFromString(`daily_warmup:${dayISO}`);
    const targetSeed = Number(url.searchParams.get('seed_target')) || (target ? seedFromString(`daily_target:${dayISO}:${target.id}`) : 0);
    const mixedSeed = Number(url.searchParams.get('seed_mixed')) || (mixed ? seedFromString(`daily_mixed:${dayISO}:${mixed.id}`) : 0);
    const aiSeed = Number(url.searchParams.get('seed_ai')) || seedFromString(`daily_ai:${dayISO}`);

    const warmupQuizLive = BRADY_QUIZ.buildDailyWarmupQuiz(warmupSeed >>> 0);
    const aiQuizLive = BRADY_QUIZ.buildDailyAiQuiz(aiSeed >>> 0);
    const targetQuizLive = target ? BRADY_QUIZ.buildPracticeQuiz(target, targetSeed >>> 0) : targetQuiz;
    const mixedQuizLive = mixed ? BRADY_QUIZ.buildPracticeQuiz(mixed, mixedSeed >>> 0) : mixedQuiz;

    renderQuizSection(
      'warmup',
      'Warm-up Quiz',
      'Quick mixed review. This is graded and saved so it is provable.',
      warmupQuizLive,
      warmupSeed >>> 0,
      warmupPassedRow ? {
        passed: true,
        scorePercent: warmupPassedRow.score_percent,
        correctQuestions: warmupPassedRow.correct_questions,
        totalQuestions: warmupPassedRow.total_questions,
      } : { passed: false }
    );

    renderQuizSection(
      'target',
      'Target Skill Practice',
      target ? `Practice for <span class="mono">${escapeHtml(target.title)}</span>.` : 'No target assignment found.',
      targetQuizLive,
      targetSeed >>> 0,
      targetPassedRow ? {
        passed: true,
        scorePercent: targetPassedRow.score_percent,
        correctQuestions: targetPassedRow.correct_questions,
        totalQuestions: targetPassedRow.total_questions,
      } : { passed: false }
    );

    renderQuizSection(
      'mixed',
      'Mixed Review Practice',
      mixed ? `Review for <span class="mono">${escapeHtml(mixed.title)}</span>.` : 'No mixed review assignment found.',
      mixedQuizLive,
      mixedSeed >>> 0,
      mixedPassedRow ? {
        passed: true,
        scorePercent: mixedPassedRow.score_percent,
        correctQuestions: mixedPassedRow.correct_questions,
        totalQuestions: mixedPassedRow.total_questions,
      } : { passed: false }
    );

    renderQuizSection(
      'ai',
      'AI Co-Learning Quiz',
      'Short quiz on how to use ChatGPT / Codex / Claude effectively (provable completion).',
      aiQuizLive,
      aiSeed >>> 0,
      aiPassedRow ? {
        passed: true,
        scorePercent: aiPassedRow.score_percent,
        correctQuestions: aiPassedRow.correct_questions,
        totalQuestions: aiPassedRow.total_questions,
      } : { passed: false }
    );

    bindQuizSectionHandlers({
      session: gate.session,
      dayISO,
      sectionKey: 'warmup',
      practiceKind: 'daily_warmup',
      assignmentId: warmupAssignmentId,
      getSeed: () => warmupSeed >>> 0,
      getQuiz: () => warmupQuizLive,
      onPassed: async () => {
        try { window.location.reload(); } catch (_) { /* no-op */ }
      },
    });

    bindQuizSectionHandlers({
      session: gate.session,
      dayISO,
      sectionKey: 'target',
      practiceKind: 'daily_target',
      assignmentId: targetAssignmentId,
      getSeed: () => targetSeed >>> 0,
      getQuiz: () => targetQuizLive,
      onPassed: async () => {
        try { window.location.reload(); } catch (_) { /* no-op */ }
      },
    });

    bindQuizSectionHandlers({
      session: gate.session,
      dayISO,
      sectionKey: 'mixed',
      practiceKind: 'daily_mixed',
      assignmentId: mixedAssignmentId,
      getSeed: () => mixedSeed >>> 0,
      getQuiz: () => mixedQuizLive,
      onPassed: async () => {
        try { window.location.reload(); } catch (_) { /* no-op */ }
      },
    });

    bindQuizSectionHandlers({
      session: gate.session,
      dayISO,
      sectionKey: 'ai',
      practiceKind: 'daily_ai',
      assignmentId: aiAssignmentId,
      getSeed: () => aiSeed >>> 0,
      getQuiz: () => aiQuizLive,
      onPassed: async () => {
        try { window.location.reload(); } catch (_) { /* no-op */ }
      },
    });

    const reflectionEl = document.getElementById('reflection');
    if (reflectionEl) {
      let timeout = null;
      reflectionEl.addEventListener('input', () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(async () => {
          setAlert('');
          const saveMsg = document.getElementById('saveMsg');
          if (saveMsg) saveMsg.textContent = 'Saving…';
          try {
            await upsertDailyLog(gate.session, dayISO, { reflection: reflectionEl.value || '' });
            if (saveMsg) saveMsg.textContent = completion.completed ? 'Completed today.' : 'Saved.';
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

