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

function parseFractionInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  // Accept "a/b"
  const parts = s.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0].trim());
    const den = Number(parts[1].trim());
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return { num, den };
  }

  // Accept decimal
  const v = Number(s);
  if (Number.isFinite(v)) {
    // Convert to fraction with limited denominator for comparison.
    // This is conservative; we mainly expect a/b input.
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
  const parts = s.split(/[^0-9\-]+/g).filter(Boolean);
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
  // Accept: "500000 + 7000 + 400 + 30 + 2"
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

function getAnswerFromDom(q) {
  const id = `ans_${q.id}`;
  const el = document.getElementById(id);
  if (!el) return null;

  if (q.type === 'mc') return el.value;
  if (q.type === 'number') return el.value;
  if (q.type === 'fraction') return el.value;
  if (q.type === 'set_numbers') return el.value;
  if (q.type === 'expanded_sum') return el.value;
  return el.value;
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

function renderAssignmentMeta(a, quiz, seed) {
  const metaEl = document.getElementById('assignmentMeta');
  if (!metaEl) return;
  metaEl.style.display = 'block';
  const standards = (a.standards || []).map((st) => `<span class="pill mono">${escapeHtml(st)}</span>`).join('');

  metaEl.innerHTML = `
    <h2>What You Must Do (Verification)</h2>
    <div class="small">
      To be marked <span class="mono">mastered</span>, you must score at least <span class="mono">${quiz.passPercent}%</span>
      on this test, and complete every question.
    </div>
    <div class="pill-row" style="margin-top:10px;">
      <span class="pill">${escapeHtml(a.subject)}</span>
      ${a.band ? `<span class="pill mono">Band ${escapeHtml(a.band)}</span>` : ''}
      ${standards}
      <span class="pill mono">Seed ${seed}</span>
    </div>

    <div class="grid" style="margin-top:14px;">
      <div class="section" style="margin:0;">
        <h2>Learning Targets</h2>
        <ul style="padding-left:18px;">
          ${(a.learningTargets || []).map((t) => `<li class="small">${escapeHtml(t)}</li>`).join('')}
        </ul>
      </div>
      <div class="section" style="margin:0;">
        <h2>Practice Plan (Before Test)</h2>
        <ul style="padding-left:18px;">
          ${(a.practicePlan || []).map((t) => `<li class="small">${escapeHtml(t)}</li>`).join('')}
        </ul>
      </div>
      <div class="section" style="margin:0;">
        <h2>AI Co-Learning</h2>
        <div class="small">Optional, but recommended after you miss a question.</div>
        <div class="btn-row" style="margin-top:10px;">
          <a class="btn secondary" href="assignments.html?assignment=${encodeURIComponent(a.id)}" style="text-decoration:none; display:inline-flex; align-items:center;">Open AI Prompts</a>
        </div>
      </div>
    </div>
  `;
}

function renderQuiz(quiz) {
  const quizEl = document.getElementById('quizContainer');
  if (!quizEl) return;

  if (!quiz.questions || quiz.questions.length === 0) {
    quizEl.innerHTML = `
      <h2>No test found</h2>
      <div class="small">This assignment does not have a quiz yet.</div>
    `;
    return;
  }

  const questionHtml = quiz.questions.map((q, idx) => {
    const number = idx + 1;
    const inputId = `ans_${q.id}`;

    let inputHtml = '';
    if (q.type === 'mc') {
      inputHtml = `
        <label for="${inputId}">Answer</label>
        <select id="${inputId}">
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
        <label for="${inputId}">Answer</label>
        <input id="${inputId}" type="text" placeholder="${escapeHtml(placeholder)}">
      `;
    }

    return `
      <div class="section" style="margin-top:14px;" data-question="${escapeHtml(q.id)}">
        <h2>Question ${number}</h2>
        <div class="small" style="white-space:pre-wrap;">${escapeHtml(q.prompt)}</div>
        <div class="field-row" style="margin-top:12px;">
          <div>${inputHtml}</div>
        </div>
        <div class="small" id="feedback_${escapeHtml(q.id)}"></div>
      </div>
    `;
  }).join('');

  quizEl.innerHTML = `
    <h2>Test</h2>
    <div class="small">Answer every question, then submit for a score and mastery decision.</div>
    ${questionHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn" type="button" id="submitQuiz">Submit & Grade</button>
      <button class="btn secondary" type="button" id="retakeQuiz">New Version</button>
      <span class="small" id="submitMsg"></span>
    </div>
  `;
}

function renderResults(summary) {
  const el = document.getElementById('resultsContainer');
  if (!el) return;

  el.style.display = 'block';
  el.innerHTML = `
    <h2>Results</h2>
    <div class="pill-row" style="margin-top:10px;">
      <span class="pill mono">Score ${summary.scorePercent}%</span>
      <span class="pill mono">${summary.correctQuestions}/${summary.totalQuestions} correct</span>
      <span class="status-badge ${summary.passed ? 'mastered' : 'in_progress'}">${summary.passed ? 'Passed (Mastered)' : 'Not Passed Yet'}</span>
    </div>
    <div class="small" style="margin-top:10px;">
      ${summary.passed
        ? 'You passed. This assignment is marked mastered.'
        : `You did not reach the pass score (${summary.passPercent}%). Review missed questions and try a new version.`
      }
    </div>
  `;
}

async function loadAttemptHistory(session, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_attempts')
    .select('attempted_at,score_percent,correct_questions,total_questions,seed')
    .eq('user_id', session.user.id)
    .eq('assignment_id', assignmentId)
    .order('attempted_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

function renderAttemptHistory(rows) {
  const el = document.getElementById('attemptHistory');
  if (!el) return;

  el.style.display = 'block';
  if (!rows || rows.length === 0) {
    el.innerHTML = `
      <h2>Attempt History</h2>
      <div class="small">No attempts saved yet.</div>
    `;
    return;
  }

  const rowsHtml = rows.map((r) => {
    const t = r.attempted_at ? new Date(r.attempted_at).toLocaleString() : '';
    return `
      <tr>
        <td class="mono">${escapeHtml(t)}</td>
        <td class="mono">${escapeHtml(r.score_percent)}</td>
        <td class="mono">${escapeHtml(r.correct_questions)}/${escapeHtml(r.total_questions)}</td>
        <td class="mono">${escapeHtml(r.seed)}</td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Attempt History</h2>
    <div class="small">Most recent 10 attempts.</div>
    <table class="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Score%</th>
          <th>Correct</th>
          <th>Seed</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

async function loadProgressRow(session, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('status,score')
    .eq('user_id', session.user.id)
    .eq('assignment_id', assignmentId)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function upsertProgressFromScore(session, assignmentId, scorePercent, passPercent) {
  const existing = await loadProgressRow(session, assignmentId);
  const alreadyMastered = existing?.status === 'mastered';
  const status = alreadyMastered ? 'mastered' : (scorePercent >= passPercent ? 'mastered' : 'in_progress');
  const bestScore = Math.max(Number(existing?.score || 0), Number(scorePercent || 0));

  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_progress').upsert({
    user_id: session.user.id,
    assignment_id: assignmentId,
    status,
    score: bestScore,
    last_attempt_at: new Date().toISOString(),
  }, { onConflict: 'user_id,assignment_id' });
  if (error) throw error;
}

async function saveAttempt(session, assignmentId, seed, summary, answers, results) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_attempts').insert({
    user_id: session.user.id,
    assignment_id: assignmentId,
    seed,
    score_percent: summary.scorePercent,
    total_questions: summary.totalQuestions,
    correct_questions: summary.correctQuestions,
    answers,
    results,
  });
  if (error) throw error;
}

async function main() {
  const url = new URL(window.location.href);
  const assignmentId = url.searchParams.get('id') || url.searchParams.get('assignment') || '';

  try {
    const nextPath = assignmentId ? `brady/assignment.html?id=${encodeURIComponent(assignmentId)}` : 'brady/assignments.html';
    const gate = await MHA_Brady.requireBrady({ nextPath });
    if (!gate) return;

    await MHA_Auth.initAuthUI(false);
    document.body.classList.add('has-user-nav');

    const a = (BRADY_ASSIGNMENTS || []).find((x) => x.id === assignmentId);
    if (!a) {
      setAlert('Assignment not found. Go back to assignments and choose one.');
      const quizEl = document.getElementById('quizContainer');
      if (quizEl) {
        quizEl.innerHTML = `<h2>Not found</h2><div class="btn-row"><a class="btn secondary" href="assignments.html" style="text-decoration:none; display:inline-flex; align-items:center;">← Assignments</a></div>`;
      }
      return;
    }

    // Seed: allow specifying in URL for repeatability.
    const seedRaw = url.searchParams.get('seed');
    let seed = Number(seedRaw);
    if (!Number.isFinite(seed)) {
      seed = (Date.now() & 0xffffffff) >>> 0;
    }

    const quiz = BRADY_QUIZ.buildQuiz(a, seed);

    document.title = `${a.title} | Math Hunter Academy`;
    const titleEl = document.getElementById('assignmentTitle');
    const subtitleEl = document.getElementById('assignmentSubtitle');
    if (titleEl) titleEl.textContent = a.title;
    if (subtitleEl) subtitleEl.textContent = `Pass >= ${quiz.passPercent}% to master`;

    renderAssignmentMeta(a, quiz, seed);
    renderQuiz(quiz);

    // Load history
    try {
      const history = await loadAttemptHistory(gate.session, a.id);
      renderAttemptHistory(history);
    } catch (_) {
      // It's OK if table isn't available yet; show nothing.
    }

    const submitBtn = document.getElementById('submitQuiz');
    const retakeBtn = document.getElementById('retakeQuiz');
    const submitMsg = document.getElementById('submitMsg');

    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        const nextSeed = (Date.now() & 0xffffffff) >>> 0;
        window.location.href = `assignment.html?id=${encodeURIComponent(a.id)}&seed=${encodeURIComponent(nextSeed)}`;
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        setAlert('');
        if (submitMsg) submitMsg.textContent = 'Grading…';
        submitBtn.disabled = true;

        try {
          const answers = {};
          const results = {};
          let correct = 0;

          for (const q of quiz.questions) {
            const raw = getAnswerFromDom(q);
            answers[q.id] = raw;
            const r = gradeQuestion(q, raw);
            results[q.id] = r;
            if (r.correct) correct++;

            const feedbackEl = document.getElementById(`feedback_${q.id}`);
            if (feedbackEl) {
              if (r.correct) {
                feedbackEl.innerHTML = `<span style="color: var(--accent-green);">Correct.</span>`;
              } else {
                feedbackEl.innerHTML = `<span style="color: var(--accent-red);">Incorrect.</span> Expected: <span class="mono">${escapeHtml(r.expected)}</span>${r.explanation ? `<div class="small" style="margin-top:6px;">${escapeHtml(r.explanation)}</div>` : ''}`;
              }
            }
          }

          const total = quiz.questions.length;
          const scorePercent = Math.round((correct / total) * 100);
          const passed = scorePercent >= quiz.passPercent;

          const summary = {
            assignmentId: a.id,
            seed,
            passPercent: quiz.passPercent,
            totalQuestions: total,
            correctQuestions: correct,
            scorePercent,
            passed,
          };

          renderResults(summary);

          // Save attempt + update mastery.
          await saveAttempt(gate.session, a.id, seed, summary, answers, results);
          await upsertProgressFromScore(gate.session, a.id, scorePercent, quiz.passPercent);

          // Refresh history UI.
          const history = await loadAttemptHistory(gate.session, a.id);
          renderAttemptHistory(history);

          if (submitMsg) submitMsg.textContent = passed ? 'Saved. Mastered.' : 'Saved. Not mastered yet.';
        } catch (e) {
          setAlert(e?.message || 'Save failed. (If this is the first time, the attempts table may not be installed yet.)');
          if (submitMsg) submitMsg.textContent = '';
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    // Auto-scroll to quiz top on load.
    const quizEl = document.getElementById('quizContainer');
    if (quizEl) {
      // Add a hint if opened from daily.
      const today = todayLocalISO();
      void today;
    }

  } catch (e) {
    setAlert(e?.message || 'Unable to load assignment.');
  }
}

document.addEventListener('DOMContentLoaded', main);

