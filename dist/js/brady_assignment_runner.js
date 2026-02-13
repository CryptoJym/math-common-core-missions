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

function ensureSeedInUrl(seed) {
  try {
    const url = new URL(window.location.href);
    const current = url.searchParams.get('seed');
    const next = String(seed);
    if (current === next) return;
    url.searchParams.set('seed', next);
    window.history.replaceState({}, document.title, url.toString());
  } catch (_) {
    // ignore
  }
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

function setDraftMsg(msg) {
  const el = document.getElementById('draftMsg');
  if (!el) return;
  el.textContent = String(msg || '');
}

function assignmentDraftKey(userId, assignmentId, seed) {
  return `mha_assignment_draft:${String(userId || '')}:${String(assignmentId || '')}:${String(seed || '')}`;
}

function readLocalDraft(userId, assignmentId, seed) {
  try {
    const raw = localStorage.getItem(assignmentDraftKey(userId, assignmentId, seed));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeLocalDraft(userId, assignmentId, seed, payload) {
  try {
    localStorage.setItem(assignmentDraftKey(userId, assignmentId, seed), JSON.stringify(payload));
  } catch (_) {
    // ignore
  }
}

function clearLocalDraft(userId, assignmentId, seed) {
  try {
    localStorage.removeItem(assignmentDraftKey(userId, assignmentId, seed));
  } catch (_) {
    // ignore
  }
}

async function loadAssignmentDraftRow(session, queryUserId, assignmentId, seed) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_drafts')
    .select('assignment_id,seed,quiz,answers,updated_at')
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .eq('seed', seed)
    .eq('draft_kind', 'test')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveAssignmentDraftRow(session, queryUserId, assignmentId, seed, quiz, answers) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_assignment_drafts')
    .upsert({
      user_id: queryUserId,
      assignment_id: assignmentId,
      seed,
      draft_kind: 'test',
      quiz: quiz || {},
      answers: answers || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,assignment_id,seed,draft_kind' });
  if (error) throw error;
}

async function clearAssignmentDraftRow(session, queryUserId, assignmentId, seed) {
  void session;
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_assignment_drafts')
    .delete()
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .eq('seed', seed)
    .eq('draft_kind', 'test');
  if (error) throw error;
}

const LOCKOUT_DAYS = 3;
const LOCKOUT_MS = LOCKOUT_DAYS * 24 * 60 * 60 * 1000;
let lockoutTimerId = null;

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function computeLockedUntil(latestAttempt, passPercent) {
  if (!latestAttempt) return null;
  const score = Number(latestAttempt.score_percent);
  if (!Number.isFinite(score)) return null;
  if (score >= Number(passPercent)) return null;

  const t = latestAttempt.attempted_at ? new Date(latestAttempt.attempted_at).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + LOCKOUT_MS);
}

function computeFocusTagsFromAttempt(attempt, assignment) {
  const out = {};
  const results = attempt?.results && typeof attempt.results === 'object' ? attempt.results : null;
  if (!results) return out;

  const addTag = (tag) => {
    const k = String(tag || '').trim();
    if (!k) return;
    out[k] = (out[k] || 0) + 1;
  };

  // Preferred: tags were saved with each question result.
  for (const [qid, r] of Object.entries(results)) {
    void qid;
    if (!r || typeof r !== 'object') continue;
    if (r.correct !== false) continue;
    const tags = Array.isArray(r.tags) ? r.tags : [];
    tags.forEach(addTag);
  }

  const hasAny = Object.keys(out).length > 0;
  if (hasAny) return out;

  // Fallback: reconstruct the quiz from the attempt seed and read tags from questions.
  const seed = Number(attempt?.seed);
  if (!Number.isFinite(seed)) return out;
  try {
    const quiz = BRADY_QUIZ.buildQuiz(assignment, seed);
    const byId = {};
    for (const q of (quiz.questions || [])) byId[q.id] = q;
    for (const [qid, r] of Object.entries(results)) {
      if (!r || typeof r !== 'object') continue;
      if (r.correct !== false) continue;
      const q = byId[qid];
      const tags = Array.isArray(q?.tags) ? q.tags : [];
      tags.forEach(addTag);
    }
  } catch (_) {
    // no-op
  }
  return out;
}

function buildAgentPromptText(assignment, passPercent, latestAttempt, focusTags) {
  const standards = (assignment?.standards || []).join(', ');
  const focusLines = Object.entries(focusTags || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 8)
    .map(([k, v]) => `- ${k}: missed in ${v} question(s)`)
    .join('\n');

  const score = Number(latestAttempt?.score_percent);
  const when = latestAttempt?.attempted_at ? new Date(latestAttempt.attempted_at).toLocaleString() : '';

  return [
    'You are an expert tutor and curriculum designer.',
    '',
    `Create a brand-new auto-graded quiz for this assignment: "${assignment?.title || assignment?.id}".`,
    standards ? `Standards: ${standards}` : 'Standards: (not provided)',
    assignment?.learningTargets?.length ? `Learning targets:\n- ${assignment.learningTargets.join('\n- ')}` : 'Learning targets: (not provided)',
    '',
    Number.isFinite(score) ? `Most recent attempt: ${score}% (pass >= ${passPercent}%) at ${when}` : `Pass threshold: ${passPercent}%`,
    '',
    'The student missed these skill tags (highest priority first):',
    focusLines || '- (no tag data available; generate a balanced version)',
    '',
    'Requirements:',
    '- Output EXACTLY 10 questions.',
    '- Each question must be auto-gradable and include an answer key.',
    '- For each question include: id (q1..q10), type (mc|number|fraction|set_numbers|expanded_sum), prompt, choices (if mc), answer, explanation, tags.',
    '- Keep wording clear; no trick questions.',
    '- Make it similar difficulty to the original assignment, but focus on the missed tags.',
    '',
    'Return only JSON (no markdown).',
  ].join('\n');
}

async function copyToClipboard(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch (_) {
    // Fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  }
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
      <span class="small" id="draftMsg" style="color: var(--text-secondary);"></span>
    </div>
  `;
}

async function setupTestDraftAutosave(session, queryUserId, assignmentId, seed, quiz) {
  const snapshotQuiz = quiz && typeof quiz === 'object'
    ? {
      title: quiz.title || '',
      passPercent: quiz.passPercent,
      questions: Array.isArray(quiz.questions) ? quiz.questions : [],
    }
    : { title: '', passPercent: 80, questions: [] };

  const local = readLocalDraft(queryUserId, assignmentId, seed);
  let remote = null;
  try {
    remote = await loadAssignmentDraftRow(session, queryUserId, assignmentId, seed);
  } catch (_) {
    remote = null;
  }

  const localAt = local?.updated_at ? new Date(local.updated_at).getTime() : NaN;
  const remoteAt = remote?.updated_at ? new Date(remote.updated_at).getTime() : NaN;
  const useRemote = Number.isFinite(remoteAt) && (!Number.isFinite(localAt) || remoteAt >= localAt);
  const chosen = useRemote ? remote : local;

  const draftAnswers = (chosen?.answers && typeof chosen.answers === 'object') ? { ...chosen.answers } : {};
  if (chosen) {
    for (const q of (snapshotQuiz.questions || [])) {
      setQuestionInputValue(q, draftAnswers[q.id]);
    }
    setDraftMsg('Draft restored.');
  }

  let saveTimerId = null;
  const scheduleSave = () => {
    if (saveTimerId) window.clearTimeout(saveTimerId);
    saveTimerId = window.setTimeout(async () => {
      try {
        await saveAssignmentDraftRow(session, queryUserId, assignmentId, seed, snapshotQuiz, draftAnswers);
        setDraftMsg('Draft saved.');
      } catch (_) {
        setDraftMsg('Draft saved locally (offline).');
      }
    }, 650);
  };

  const flush = async () => {
    const payload = {
      assignment_id: assignmentId,
      seed,
      quiz: snapshotQuiz,
      answers: draftAnswers,
      updated_at: new Date().toISOString(),
    };
    writeLocalDraft(queryUserId, assignmentId, seed, payload);
    try {
      await saveAssignmentDraftRow(session, queryUserId, assignmentId, seed, snapshotQuiz, draftAnswers);
    } catch (_) {
      // ignore
    }
  };

  const onAnyInput = (q) => {
    draftAnswers[q.id] = getAnswerFromDom(q);
    writeLocalDraft(queryUserId, assignmentId, seed, {
      assignment_id: assignmentId,
      seed,
      quiz: snapshotQuiz,
      answers: draftAnswers,
      updated_at: new Date().toISOString(),
    });
    setDraftMsg('Saving…');
    scheduleSave();
  };

  for (const q of (snapshotQuiz.questions || [])) {
    const el = document.getElementById(`ans_${q.id}`);
    if (!el) continue;
    el.addEventListener('input', () => onAnyInput(q));
    el.addEventListener('change', () => onAnyInput(q));
  }

  const onHide = () => { void flush(); };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });

  const clear = async () => {
    clearLocalDraft(queryUserId, assignmentId, seed);
    try { await clearAssignmentDraftRow(session, queryUserId, assignmentId, seed); } catch (_) { /* ignore */ }
    setDraftMsg('');
  };

  return { flush, clear };
}

function getPracticeAnswerFromDom(q) {
  const id = `prac_ans_${q.id}`;
  const el = document.getElementById(id);
  if (!el) return null;
  return el.value;
}

async function loadPassingPracticeAttempt(session, queryUserId, assignmentId, basedOnAttemptedAt, passPercent) {
  const sb = MHA_Auth.getSupabase();
  let q = sb
    .from('brady_practice_attempts')
    .select('practiced_at,score_percent,correct_questions,total_questions,based_on_attempted_at')
    .eq('user_id', queryUserId)
    .eq('practice_kind', 'assignment_retake')
    .eq('assignment_id', assignmentId)
    .order('practiced_at', { ascending: false })
    .limit(1);

  if (basedOnAttemptedAt) {
    q = q.eq('based_on_attempted_at', basedOnAttemptedAt);
  } else {
    q = q.is('based_on_attempted_at', null);
  }

  q = q.gte('score_percent', Number(passPercent || 80));

  const { data, error } = await q;
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function savePracticeAttempt(session, queryUserId, assignmentId, basedOnAttemptedAt, seed, summary, answers, results) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_practice_attempts').insert({
    user_id: queryUserId,
    practice_kind: 'assignment_retake',
    assignment_id: assignmentId,
    based_on_attempted_at: basedOnAttemptedAt || null,
    seed,
    score_percent: summary.scorePercent,
    total_questions: summary.totalQuestions,
    correct_questions: summary.correctQuestions,
    answers,
    results,
  });
  if (error) throw error;
}

function renderTestLocked(passPercent) {
  const quizEl = document.getElementById('quizContainer');
  if (!quizEl) return;
  quizEl.innerHTML = `
    <h2>Test Locked</h2>
    <div class="small">
      You must complete the required practice set (score >= <span class="mono">${escapeHtml(passPercent)}</span>%) to unlock the next test attempt.
    </div>
  `;
}

function renderPractice(session, assignment, seed, focusTags, gate) {
  const el = document.getElementById('practiceContainer');
  if (!el) return;

  const quizOptions = focusTags && Object.keys(focusTags).length > 0 ? { focusTags } : undefined;
  const practiceQuiz = BRADY_QUIZ.buildPracticeQuiz(assignment, seed, quizOptions);
  const qCount = (practiceQuiz.questions || []).length;

  el.style.display = 'block';

  if (!practiceQuiz.questions || qCount === 0) {
    el.innerHTML = `
      <h2>Practice</h2>
      <div class="small">No practice set is available yet for this assignment.</div>
    `;
    return;
  }

  const focusHtml = Object.entries(focusTags || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 8)
    .map(([k, v]) => `<span class="pill mono">${escapeHtml(k)}:${escapeHtml(v)}</span>`)
    .join('');

  const questionHtml = practiceQuiz.questions.map((q, idx) => {
    const number = idx + 1;
    const inputId = `prac_ans_${q.id}`;

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
      <div class="section" style="margin-top:14px;" data-practice-question="${escapeHtml(q.id)}">
        <h2>Practice ${number}</h2>
        <div class="small" style="white-space:pre-wrap;">${escapeHtml(q.prompt)}</div>
        <div class="field-row" style="margin-top:12px;">
          <div>${inputHtml}</div>
        </div>
        <div class="small" id="prac_feedback_${escapeHtml(q.id)}"></div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Practice Problems (Auto-checked)</h2>
    <div class="small">
      Do these before the test. Practice does not count as a test attempt.
      ${gate?.required ? ` <span class="mono">REQUIRED after failing</span> (unlock target >= ${escapeHtml(gate.passPercent)}%).` : ''}
      ${gate?.required && gate?.passed ? ' Practice is complete for this retake.' : ''}
    </div>
    <div class="pill-row" style="margin-top:10px;">
      <span class="pill mono">Seed ${escapeHtml(seed)}</span>
      <span class="pill mono">${escapeHtml(qCount)} problems</span>
      ${focusHtml || '<span class="pill">Balanced practice</span>'}
    </div>
    <div class="small" id="practiceMsg" style="margin-top:10px;"></div>
    ${questionHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn secondary" type="button" id="checkPractice">Check Practice</button>
      <button class="btn secondary" type="button" id="newPractice">New Practice Set</button>
    </div>
  `;

  const practiceMsg = document.getElementById('practiceMsg');
  const checkBtn = document.getElementById('checkPractice');
  const newBtn = document.getElementById('newPractice');

  const grade = async () => {
    let correct = 0;
    const missing = [];
    const answers = {};
    const results = {};

    for (let idx = 0; idx < practiceQuiz.questions.length; idx++) {
      const q = practiceQuiz.questions[idx];
      const raw = getPracticeAnswerFromDom(q);
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

      const feedbackEl = document.getElementById(`prac_feedback_${q.id}`);
      if (feedbackEl) {
        if (r.correct) {
          feedbackEl.innerHTML = `<span style="color: var(--accent-green);">Correct.</span>`;
        } else {
          feedbackEl.innerHTML = `<span style=\"color: var(--accent-red);\">Incorrect.</span> Expected: <span class=\"mono\">${escapeHtml(r.expected)}</span>${r.explanation ? `<div class=\"small\" style=\"margin-top:6px;\">${escapeHtml(r.explanation)}</div>` : ''}`;
        }
      }
    }

    const total = practiceQuiz.questions.length;
    const scorePercent = Math.round((correct / total) * 100);

    if (missing.length > 0) {
      if (practiceMsg) practiceMsg.textContent = `Answer every practice problem before checking. Missing: ${missing.map((n) => `#${n}`).join(', ')}`;
      return;
    }

    const summary = {
      assignmentId: assignment?.id || '',
      seed,
      passPercent: Number(gate?.passPercent || assignment?.passPercent || 80),
      totalQuestions: total,
      correctQuestions: correct,
      scorePercent,
      passed: scorePercent >= Number(gate?.passPercent || assignment?.passPercent || 80),
    };

    if (practiceMsg) {
      practiceMsg.textContent = `Practice score: ${scorePercent}% (${correct}/${total} correct).`;
    }

    if (summary.passed && session && gate?.required) {
      if (practiceMsg) practiceMsg.textContent = `${practiceMsg.textContent} Practice passed. Saving…`;
      try {
        await savePracticeAttempt(
          session,
          assignment.id,
          gate?.basedOnAttemptedAt || null,
          seed,
          summary,
          answers,
          results
        );
        if (practiceMsg) practiceMsg.textContent = `${practiceMsg.textContent} Saved. Reloading to unlock test…`;
        try { window.location.reload(); } catch (_) { /* no-op */ }
      } catch (e) {
        if (practiceMsg) practiceMsg.textContent = `Practice passed, but save failed: ${String(e?.message || e)}`;
      }
      return;
    }

    if (practiceMsg && summary.passed && !gate?.required) {
      practiceMsg.textContent = `${practiceMsg.textContent} Nice. You are ready for the test.`;
      return;
    }

    if (practiceMsg && gate?.required && !summary.passed) {
      practiceMsg.textContent = `${practiceMsg.textContent} You must reach ${escapeHtml(summary.passPercent)}% to unlock the test.`;
      return;
    }

    if (practiceMsg && !summary.passed) {
      practiceMsg.textContent = `${practiceMsg.textContent} Fix misses, then check again.`;
    }
  };

  if (checkBtn) checkBtn.addEventListener('click', () => { void grade(); });
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const nextSeed = (Date.now() & 0xffffffff) >>> 0;
      renderPractice(session, assignment, nextSeed, focusTags, gate);
    });
  }
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

function setQuestionInputValue(q, rawValue) {
  const id = `ans_${q.id}`;
  const el = document.getElementById(id);
  if (!el) return;

  const v = rawValue == null ? '' : String(rawValue);
  el.value = v;
}

function setQuizInputsDisabled(quiz, disabled) {
  for (const q of (quiz.questions || [])) {
    const id = `ans_${q.id}`;
    const el = document.getElementById(id);
    if (el) el.disabled = Boolean(disabled);
  }
}

function applyStoredFeedback(quiz, storedResults) {
  const results = storedResults && typeof storedResults === 'object' ? storedResults : {};
  for (const q of (quiz.questions || [])) {
    const r = results[q.id];
    if (!r || typeof r !== 'object') continue;
    const feedbackEl = document.getElementById(`feedback_${q.id}`);
    if (!feedbackEl) continue;

    const correct = r.correct === true;
    if (correct) {
      feedbackEl.innerHTML = `<span style="color: var(--accent-green);">Correct.</span>`;
    } else {
      const expected = r.expected != null ? String(r.expected) : '';
      const explanation = r.explanation != null ? String(r.explanation) : '';
      feedbackEl.innerHTML = `<span style="color: var(--accent-red);">Incorrect.</span> Expected: <span class="mono">${escapeHtml(expected)}</span>${explanation ? `<div class="small" style="margin-top:6px;">${escapeHtml(explanation)}</div>` : ''}`;
    }
  }
}

function quizFromAttemptResults(assignment, attempt, passPercent) {
  const results = attempt?.results && typeof attempt.results === 'object' ? attempt.results : {};

  const ids = Object.keys(results)
    .filter((k) => /^q(10|[1-9])$/.test(k))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const questions = ids.map((id) => {
    const r = results[id] && typeof results[id] === 'object' ? results[id] : {};
    const type = String(r.type || '').trim() || 'number';
    const prompt = String(r.prompt || '').trim();
    const choices = Array.isArray(r.choices) ? r.choices.map((c) => String(c)) : [];
    const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t)) : [];

    return {
      id,
      type,
      prompt,
      choices,
      tags,
      explanation: String(r.explanation || ''),
    };
  });

  return {
    passPercent: Number(passPercent || assignment?.passPercent || 80),
    title: assignment?.title || assignment?.id || 'Assignment',
    questions,
  };
}

function hasRenderableAttemptQuiz(attempt) {
  const results = attempt?.results && typeof attempt.results === 'object' ? attempt.results : null;
  if (!results) return false;
  for (let i = 1; i <= 10; i++) {
    const r = results[`q${i}`];
    if (!r || typeof r !== 'object') return false;
    if (typeof r.prompt !== 'string' || !r.prompt.trim()) return false;
    if (typeof r.type !== 'string' || !r.type.trim()) return false;
    if (String(r.type) === 'mc') {
      if (!Array.isArray(r.choices) || r.choices.length < 2) return false;
    }
  }
  return true;
}

function renderLockoutPanel(assignment, passPercent, latestAttempt, lockedUntil, focusTags) {
  const el = document.getElementById('resultsContainer');
  if (!el) return;

  const score = Number(latestAttempt?.score_percent);
  const attemptedAt = latestAttempt?.attempted_at ? new Date(latestAttempt.attempted_at).toLocaleString() : '';
  const unlockAt = lockedUntil ? lockedUntil.toLocaleString() : '';

  const focusHtml = Object.entries(focusTags || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 10)
    .map(([k, v]) => `<span class="pill mono">${escapeHtml(k)}:${escapeHtml(v)}</span>`)
    .join('');

  const agentPrompt = buildAgentPromptText(assignment, passPercent, latestAttempt, focusTags);

  el.style.display = 'block';
  el.innerHTML = `
    <h2>Lockout</h2>
    <div class="small">
      ${Number.isFinite(score) ? `Most recent score: <span class="mono">${escapeHtml(score)}</span>% (pass >= <span class="mono">${escapeHtml(passPercent)}</span>%)` : ''}
      ${attemptedAt ? ` on <span class="mono">${escapeHtml(attemptedAt)}</span>.` : ''}
      ${unlockAt ? ` Locked until <span class="mono">${escapeHtml(unlockAt)}</span>.` : ''}
    </div>
    <div class="pill-row" style="margin-top:10px;">
      ${focusHtml || '<span class="pill">No focus tags available</span>'}
    </div>
    <div class="section" style="margin-top:14px;">
      <h2>What To Do During Lockout</h2>
      <div class="btn-row">
        <a class="btn secondary" href="daily.html" style="text-decoration:none; display:inline-flex; align-items:center;">Daily Training</a>
        <a class="btn secondary" href="reading.html" style="text-decoration:none; display:inline-flex; align-items:center;">Reading Log</a>
        <a class="btn secondary" href="assignments.html" style="text-decoration:none; display:inline-flex; align-items:center;">Assignments</a>
      </div>
    </div>
    <div class="ai-box">
      <h4>Agent Prompt (Paste Into ChatGPT / Claude / Codex)</h4>
      <textarea class="ai-prompt mono" id="agentPromptText" readonly></textarea>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn secondary" type="button" id="copyAgentPrompt">Copy Prompt</button>
        <span class="small" id="copyAgentPromptMsg"></span>
      </div>
    </div>
  `;

  const ta = document.getElementById('agentPromptText');
  if (ta) ta.value = agentPrompt;
  const copyBtn = document.getElementById('copyAgentPrompt');
  const copyMsg = document.getElementById('copyAgentPromptMsg');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(agentPrompt);
      if (copyMsg) copyMsg.textContent = ok ? 'Copied.' : 'Copy failed.';
    });
  }
}

function startLockoutCountdown(passPercent, latestAttempt, lockedUntil) {
  if (lockoutTimerId) {
    clearInterval(lockoutTimerId);
    lockoutTimerId = null;
  }

  if (!lockedUntil) return;
  const unlockAt = lockedUntil.getTime();
  if (!Number.isFinite(unlockAt)) return;

  const score = Number(latestAttempt?.score_percent);
  const tryReload = () => {
    try {
      if (window?.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    } catch (_) {
      // no-op
    }
  };

  // If the lockout already expired (time passed since page load), refresh state.
  if (Date.now() >= unlockAt) {
    setAlert('');
    tryReload();
    return;
  }

  const tick = () => {
    const now = Date.now();
    const remaining = unlockAt - now;
    if (remaining <= 0) {
      setAlert('');
      if (lockoutTimerId) {
        clearInterval(lockoutTimerId);
        lockoutTimerId = null;
      }
      tryReload();
      return;
    }
    const when = lockedUntil.toLocaleString();
    const parts = [];
    parts.push('LOCKED');
    if (Number.isFinite(score)) parts.push(`score ${score}%`);
    parts.push(`unlock in ${formatCountdown(remaining)}`);
    parts.push(`(${when})`);
    setAlert(parts.join(' | '));
  };

  tick();
  lockoutTimerId = setInterval(tick, 1000);
}

async function loadAttemptHistory(session, queryUserId, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_attempts')
    .select('attempted_at,score_percent,correct_questions,total_questions,seed')
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .order('attempted_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function loadLatestAttempt(session, queryUserId, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_attempts')
    .select('attempted_at,score_percent,correct_questions,total_questions,seed,answers,results')
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .order('attempted_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function loadGeneratedQuiz(session, queryUserId, assignmentId, basedOnAttemptedAt) {
  const sb = MHA_Auth.getSupabase();
  let q = sb
    .from('brady_generated_quizzes')
    .select('created_at,quiz,based_on_attempted_at')
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (basedOnAttemptedAt) {
    q = q.eq('based_on_attempted_at', basedOnAttemptedAt);
  }

  const { data, error } = await q;
  if (error) throw error;
  const row = (data && data[0]) ? data[0] : null;
  return row?.quiz || null;
}

function isValidQuizShape(quiz) {
  if (!quiz || typeof quiz !== 'object') return false;
  if (!Number.isFinite(Number(quiz.passPercent))) return false;
  if (!quiz.title || typeof quiz.title !== 'string') return false;
  if (!Array.isArray(quiz.questions) || quiz.questions.length !== 10) return false;
  const allowedTypes = new Set(['mc', 'number', 'fraction', 'set_numbers', 'expanded_sum']);
  const ids = new Set();
  for (const q of quiz.questions) {
    if (!q || typeof q !== 'object') return false;
    if (!q.id || typeof q.id !== 'string') return false;
    if (ids.has(q.id)) return false;
    ids.add(q.id);

    if (!allowedTypes.has(q.type)) return false;
    if (!q.prompt || typeof q.prompt !== 'string') return false;
    if (typeof q.explanation !== 'string') return false;
    if (!Array.isArray(q.tags) || q.tags.length < 1) return false;

    if (q.type === 'mc') {
      if (!Array.isArray(q.choices) || q.choices.length < 2) return false;
      if (typeof q.answer !== 'string') return false;
      if (!q.choices.includes(q.answer)) return false;
    } else if (q.type === 'number' || q.type === 'expanded_sum') {
      if (!Number.isFinite(Number(q.answer))) return false;
    } else if (q.type === 'fraction') {
      if (!q.answer || typeof q.answer !== 'object') return false;
      const num = Number(q.answer?.num);
      const den = Number(q.answer?.den);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return false;
    } else if (q.type === 'set_numbers') {
      if (!Array.isArray(q.answer)) return false;
      if (q.answer.some((n) => !Number.isFinite(Number(n)))) return false;
    }
  }
  for (let i = 1; i <= 10; i++) if (!ids.has(`q${i}`)) return false;
  return true;
}

async function generateQuizViaApi(payload) {
  const token = await MHA_Auth.getAccessToken();
  const url = new URL('/api/brady/generate-quiz', window.location.origin);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = null; }
  if (!resp.ok) {
    const msg = data?.error || `AI generation failed (${resp.status}).`;
    const err = new Error(msg);
    err.statusCode = resp.status;
    err.errorCode = data?.error_code || data?.errorCode || data?.error_code || null;
    throw err;
  }
  if (!data || !data.quiz) throw new Error('AI generation returned no quiz.');
  return data.quiz;
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

async function loadProgressRow(session, queryUserId, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_assignment_progress')
    .select('status,score')
    .eq('user_id', queryUserId)
    .eq('assignment_id', assignmentId)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function upsertProgressFromScore(session, queryUserId, assignmentId, scorePercent, passPercent) {
  const existing = await loadProgressRow(session, queryUserId, assignmentId);
  const alreadyMastered = existing?.status === 'mastered';
  const status = alreadyMastered ? 'mastered' : (scorePercent >= passPercent ? 'mastered' : 'in_progress');
  const bestScore = Math.max(Number(existing?.score || 0), Number(scorePercent || 0));

  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_progress').upsert({
    user_id: queryUserId,
    assignment_id: assignmentId,
    status,
    score: bestScore,
    last_attempt_at: new Date().toISOString(),
  }, { onConflict: 'user_id,assignment_id' });
  if (error) throw error;
}

async function saveAttempt(session, queryUserId, assignmentId, seed, summary, answers, results) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb.from('brady_assignment_attempts').insert({
    user_id: queryUserId,
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

    if (window.MHA_BradyNav && typeof window.MHA_BradyNav.setContext === 'function') {
      window.MHA_BradyNav.setContext(gate.context);
    }

    const { userId: queryUserId } = MHA_Brady.getBradyQueryUser(gate.session, gate.context);

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

    const passPercent = Number(a.passPercent || 80);

    let latestAttempt = null;
    try {
      latestAttempt = await loadLatestAttempt(gate.session, queryUserId, a.id);
    } catch (_) {
      // It's OK if the attempts table doesn't exist yet.
      latestAttempt = null;
    }

    const lockedUntil = computeLockedUntil(latestAttempt, passPercent);
    const isLocked = Boolean(lockedUntil && Date.now() < lockedUntil.getTime());

    let focusTags = {};
    if (latestAttempt && Number(latestAttempt.score_percent) < passPercent) {
      focusTags = computeFocusTagsFromAttempt(latestAttempt, a);
    }

    // Always provide practice problems (even during lockout).
    // Default: stable "daily" practice seed, but user can randomize with the UI button.
    const practiceSeed = seedFromString(`${a.id}:${todayLocalISO()}`);
    const lastFailedAttemptedAt = (latestAttempt && Number(latestAttempt.score_percent) < passPercent)
      ? String(latestAttempt.attempted_at || '')
      : '';
    const practiceRequired = Boolean(lastFailedAttemptedAt);
    let practicePassed = false;
    if (practiceRequired) {
      try {
        const row = await loadPassingPracticeAttempt(gate.session, queryUserId, a.id, lastFailedAttemptedAt, passPercent);
        practicePassed = Boolean(row);
      } catch (_) {
        practicePassed = false;
      }
    }
    renderPractice(gate.session, a, practiceSeed, focusTags, {
      required: practiceRequired,
      passed: practicePassed,
      passPercent,
      basedOnAttemptedAt: lastFailedAttemptedAt,
    });

    // Seed: allow specifying in URL for repeatability.
    const seedRaw = url.searchParams.get('seed');
    let seed = Number(seedRaw);
    if (isLocked) {
      const attemptSeed = Number(latestAttempt?.seed);
      if (Number.isFinite(attemptSeed)) seed = attemptSeed;
    }
    if (!Number.isFinite(seed)) {
      seed = (Date.now() & 0xffffffff) >>> 0;
    }
    ensureSeedInUrl(seed);

    // If they already failed once and cooldown expired, they must pass practice before retaking the test.
    const practiceBlocksTest = (!isLocked && practiceRequired && !practicePassed);
    if (practiceBlocksTest) {
      document.title = `${a.title} | Math Hunter Academy`;
      const titleEl = document.getElementById('assignmentTitle');
      const subtitleEl = document.getElementById('assignmentSubtitle');
      if (titleEl) titleEl.textContent = a.title;
      if (subtitleEl) subtitleEl.textContent = `Practice Required | Pass >= ${passPercent}% to master`;

      renderAssignmentMeta(a, { passPercent }, seed);
      renderTestLocked(passPercent);

      // Load history (still useful context)
      try {
        const history = await loadAttemptHistory(gate.session, queryUserId, a.id);
        renderAttemptHistory(history);
      } catch (_) {
        // no-op
      }

      return;
    }

    let quiz = null;
    let quizSource = 'bank';

    if (isLocked && latestAttempt && hasRenderableAttemptQuiz(latestAttempt)) {
      quiz = quizFromAttemptResults(a, latestAttempt, passPercent);
      quizSource = 'attempt';
    } else if (isLocked) {
      quiz = BRADY_QUIZ.buildQuiz(a, seed);
      quizSource = 'bank';
    } else {
      // After a failed attempt + cooldown, try to load an LLM-generated adaptive quiz.
      // If none exists yet, we attempt to generate one once, then cache it in Supabase.
      let aiQuiz = null;
      let aiGenErrorMsg = '';
      const failedAttemptedAt = latestAttempt?.attempted_at || '';
      const latestScore = Number(latestAttempt?.score_percent);
      const shouldTryAi = Boolean(latestAttempt && Number.isFinite(latestScore) && latestScore < passPercent && failedAttemptedAt && practicePassed);

      if (shouldTryAi) {
        try {
          aiQuiz = await loadGeneratedQuiz(gate.session, queryUserId, a.id, failedAttemptedAt);
        } catch (_) {
          aiQuiz = null;
        }

        if (!aiQuiz) {
          // Simple throttle so we don't spam the AI endpoint if it's misconfigured.
          const throttleKey = `mha_ai_gen_fail_${a.id}`;
          const lastFail = Number(localStorage.getItem(throttleKey) || 0);
          const now = Date.now();
          if (!Number.isFinite(lastFail) || (now - lastFail) > (30 * 60 * 1000)) {
            try {
              aiQuiz = await generateQuizViaApi({
                queryUserId,
                assignmentId: a.id,
                passPercent,
                latestScorePercent: latestScore,
                basedOnAttemptedAt: failedAttemptedAt,
                focusTags,
                assignment: {
                  id: a.id,
                  title: a.title,
                  standards: a.standards || [],
                  learningTargets: a.learningTargets || [],
                  passPercent,
                },
              });
              localStorage.removeItem(throttleKey);
            } catch (e) {
              const status = Number(e?.statusCode || e?.status || 0);
              const code = String(e?.errorCode || e?.error_code || '');
              const msg = String(e?.message || '').toLowerCase();
              const looksLikeMissingSession = status === 401
                || code === 'session_not_found'
                || msg.includes('session_not_found')
                || msg.includes('session_id claim');
              if (looksLikeMissingSession) {
                try {
                  await MHA_Auth.getSupabase().auth.signOut({ scope: 'local' });
                } catch (_) {
                  // ignore
                }
                window.location.href = MHA_Brady.bradyLoginUrl(nextPath);
                return;
              }
              localStorage.setItem(throttleKey, String(now));
              aiGenErrorMsg = String(e?.message || 'AI generation failed.');
              aiQuiz = null;
            }
          }
        }
      }

      if (aiQuiz && isValidQuizShape(aiQuiz)) {
        quiz = aiQuiz;
        quizSource = 'ai';
      } else {
        const quizOptions = Object.keys(focusTags).length > 0 ? { focusTags } : undefined;
        quiz = BRADY_QUIZ.buildQuiz(a, seed, quizOptions);
        quizSource = quizOptions ? 'bank_adaptive' : 'bank';

        if (aiGenErrorMsg) {
          setAlert(`AI quiz generation unavailable. Using built-in adaptive quiz.\n\nDetails: ${aiGenErrorMsg}`);
        }
      }
    }

    document.title = `${a.title} | Math Hunter Academy`;
    const titleEl = document.getElementById('assignmentTitle');
    const subtitleEl = document.getElementById('assignmentSubtitle');
    if (titleEl) titleEl.textContent = a.title;
    if (subtitleEl) {
      const base = `Pass >= ${quiz.passPercent}% to master`;
      const prefix = quizSource === 'ai'
        ? 'AI Adaptive Version'
        : (quizSource === 'bank_adaptive' ? 'Adaptive Version' : (quizSource === 'attempt' ? 'Review Mode' : ''));
      subtitleEl.textContent = prefix ? `${prefix} | ${base}` : base;
    }

    renderAssignmentMeta(a, quiz, seed);
    renderQuiz(quiz);

      // Load history
    try {
      const history = await loadAttemptHistory(gate.session, queryUserId, a.id);
      renderAttemptHistory(history);
    } catch (_) {
      // It's OK if table isn't available yet; show nothing.
    }

    const submitBtn = document.getElementById('submitQuiz');
    const retakeBtn = document.getElementById('retakeQuiz');
    const submitMsg = document.getElementById('submitMsg');

    if (isLocked) {
      // Review mode: show the last attempt and lock out retakes.
      const attemptAnswers = latestAttempt?.answers && typeof latestAttempt.answers === 'object' ? latestAttempt.answers : {};
      for (const q of (quiz.questions || [])) setQuestionInputValue(q, attemptAnswers[q.id]);
      setQuizInputsDisabled(quiz, true);
      applyStoredFeedback(quiz, latestAttempt?.results);

      if (submitBtn) submitBtn.style.display = 'none';
      if (retakeBtn) retakeBtn.style.display = 'none';
      if (submitMsg) submitMsg.textContent = '';

      renderLockoutPanel(a, passPercent, latestAttempt, lockedUntil, focusTags);
      startLockoutCountdown(passPercent, latestAttempt, lockedUntil);
    } else {
      // If we were previously counting down, stop.
      if (lockoutTimerId) {
        clearInterval(lockoutTimerId);
        lockoutTimerId = null;
      }

      // Autosave in-progress answers so refresh/navigation doesn't lose work.
      let draftHandle = null;
      try {
        draftHandle = await setupTestDraftAutosave(gate.session, queryUserId, a.id, seed, quiz);
      } catch (_) {
        draftHandle = null;
      }

      // Optional hint: this version is adaptive if last attempt failed.
      if (submitMsg && latestAttempt && Number(latestAttempt.score_percent) < passPercent && Object.keys(focusTags).length > 0) {
        submitMsg.textContent = `Adaptive version (focus: ${Object.keys(focusTags).slice(0, 4).join(', ')})`;
      }

      if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
          if (draftHandle) void draftHandle.clear();
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
            const missing = [];

            for (let idx = 0; idx < quiz.questions.length; idx++) {
              const q = quiz.questions[idx];
              const raw = getAnswerFromDom(q);
              answers[q.id] = raw;

              const isMissing = raw == null || String(raw).trim() === '';
              if (isMissing) {
                missing.push(idx + 1);
                continue;
              }

              const r = gradeQuestion(q, raw);
              results[q.id] = {
                ...r,
                // Store enough question data to re-render the exact quiz later (review mode),
                // even if the quiz came from an AI generator (not seed-based).
                prompt: q.prompt || '',
                type: q.type || '',
                choices: q.type === 'mc' ? (q.choices || []) : [],
                tags: q.tags || [],
              };
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

            if (missing.length > 0) {
              setAlert(`Answer every question before submitting. Missing: ${missing.map((n) => `#${n}`).join(', ')}`);
              if (submitMsg) submitMsg.textContent = '';
              return;
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
            await saveAttempt(gate.session, queryUserId, a.id, seed, summary, answers, results);
            await upsertProgressFromScore(gate.session, queryUserId, a.id, scorePercent, quiz.passPercent);
            if (draftHandle) await draftHandle.clear();

            // Refresh history UI.
            const history = await loadAttemptHistory(gate.session, queryUserId, a.id);
            renderAttemptHistory(history);

            if (passed) {
              if (submitMsg) submitMsg.textContent = 'Saved. Mastered.';
              return;
            }

            // If not passed, lock out and show the lockout panel based on the actual saved row.
            let latest = null;
            try {
              latest = await loadLatestAttempt(gate.session, queryUserId, a.id);
            } catch (_) {
              latest = null;
            }

            const lu = computeLockedUntil(latest, quiz.passPercent);
            const ft = computeFocusTagsFromAttempt(latest || { seed, results }, a);

            setQuizInputsDisabled(quiz, true);
            if (submitBtn) submitBtn.style.display = 'none';
            if (retakeBtn) retakeBtn.style.display = 'none';
            if (submitMsg) submitMsg.textContent = '';

            renderLockoutPanel(a, quiz.passPercent, latest || { score_percent: scorePercent, attempted_at: new Date().toISOString() }, lu || new Date(Date.now() + LOCKOUT_MS), ft);
            startLockoutCountdown(quiz.passPercent, latest || { score_percent: scorePercent, attempted_at: new Date().toISOString() }, lu || new Date(Date.now() + LOCKOUT_MS));
          } catch (e) {
            setAlert(e?.message || 'Save failed. (If this is the first time, the attempts table may not be installed yet.)');
            if (submitMsg) submitMsg.textContent = '';
          } finally {
            submitBtn.disabled = false;
          }
        });
      }
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
