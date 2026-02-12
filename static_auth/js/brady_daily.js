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

function formatLocalTime(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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

function localDraftKey(dayISO, practiceKind, assignmentId) {
  return `mha_daily_draft:${dayISO}:${practiceKind}:${assignmentId}`;
}

function readLocalDraft(dayISO, practiceKind, assignmentId) {
  try {
    const raw = localStorage.getItem(localDraftKey(dayISO, practiceKind, assignmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeLocalDraft(dayISO, practiceKind, assignmentId, payload) {
  try {
    localStorage.setItem(localDraftKey(dayISO, practiceKind, assignmentId), JSON.stringify(payload));
  } catch (_) {
    // ignore
  }
}

function clearLocalDraft(dayISO, practiceKind, assignmentId) {
  try {
    localStorage.removeItem(localDraftKey(dayISO, practiceKind, assignmentId));
  } catch (_) {
    // ignore
  }
}

async function loadDailyDrafts(session, dayISO) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_practice_drafts')
    .select('practice_kind,assignment_id,seed,answers,updated_at')
    .eq('user_id', session.user.id)
    .eq('day', dayISO)
    .in('practice_kind', ['daily_warmup', 'daily_target', 'daily_mixed', 'daily_ai'])
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function saveDailyDraft(session, dayISO, practiceKind, assignmentId, seed, answers) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_practice_drafts')
    .upsert({
      user_id: session.user.id,
      day: dayISO,
      practice_kind: practiceKind,
      assignment_id: assignmentId,
      seed,
      answers: answers || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,day,practice_kind,assignment_id' });
  if (error) throw error;
}

async function clearDailyDraft(session, dayISO, practiceKind, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_practice_drafts')
    .delete()
    .eq('user_id', session.user.id)
    .eq('day', dayISO)
    .eq('practice_kind', practiceKind)
    .eq('assignment_id', assignmentId);
  if (error) throw error;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const f = file;
    if (!f) return reject(new Error('No file selected.'));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('File read failed.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const idx = dataUrl.indexOf(',');
      const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : '';
      if (!base64) return reject(new Error('Unable to read file.'));
      resolve(base64);
    };
    reader.readAsDataURL(f);
  });
}

async function loadSectionArtifacts(session, dayISO, practiceKind, assignmentId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_artifacts')
    .select('id,practice_kind,assignment_id,filename,mime_type,size_bytes,created_at')
    .eq('user_id', session.user.id)
    .eq('day', dayISO)
    .eq('practice_kind', practiceKind)
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

async function loadArtifactContent(session, artifactId) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_artifacts')
    .select('id,filename,mime_type,content_base64')
    .eq('user_id', session.user.id)
    .eq('id', artifactId)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function deleteArtifact(session, artifactId) {
  const sb = MHA_Auth.getSupabase();
  const { error } = await sb
    .from('brady_artifacts')
    .delete()
    .eq('user_id', session.user.id)
    .eq('id', artifactId);
  if (error) throw error;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

async function loadArtifactReviews(session, artifactIds) {
  const ids = Array.isArray(artifactIds)
    ? artifactIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return {};
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_ai_reviews')
    .select('id,artifact_id,score_percent,feedback,next_steps,provider,model,created_at')
    .eq('user_id', session.user.id)
    .in('artifact_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const map = {};
  for (const row of (data || [])) {
    if (!row) continue;
    const key = String(row.artifact_id || '');
    if (!key || map[key]) continue;
    map[key] = row;
  }
  return map;
}

function renderReviewSummary(review) {
  if (!review) return '<span style="color: var(--text-secondary);">AI check not run yet.</span>';
  const score = Number(review.score_percent);
  const pass = Number.isFinite(score) && score >= 80;
  const nextSteps = Array.isArray(review.next_steps) ? review.next_steps : [];
  return `
    <div style="margin-top:6px;">
      <span class="status-badge ${pass ? 'mastered' : 'in_progress'}">${pass ? 'PASS' : 'REVIEW'}</span>
      <span class="mono" style="margin-left:8px;">${escapeHtml(Number.isFinite(score) ? `${score}%` : '')}</span>
      <span style="margin-left:8px; color: var(--text-secondary);">${escapeHtml(review.provider || '')}${review.model ? ` · ${escapeHtml(review.model)}` : ''}</span>
      <div class="small" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(review.feedback || '')}</div>
      ${nextSteps.length ? `<div class="small" style="margin-top:6px;">Next: ${escapeHtml(nextSteps.slice(0, 3).join(' | '))}</div>` : ''}
    </div>
  `;
}

function renderArtifactsList(sectionKey, artifacts, reviewsByArtifactId) {
  const el = document.getElementById(`${sectionKey}UploadList`);
  if (!el) return;

  const rows = artifacts || [];
  if (rows.length === 0) {
    el.innerHTML = '<span style="color: var(--text-secondary);">No uploads yet.</span>';
    return;
  }

  const fmtSize = (n) => {
    const bytes = Number(n);
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024) * 10) / 10} MB`;
  };

  el.innerHTML = `
    <div style="display:grid; gap:8px;">
      ${rows.map((r) => `
        <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
          <div>
            <span class="mono">${escapeHtml(formatLocalTime(r.created_at))}</span>
            <span style="margin-left:8px;">${escapeHtml(r.filename)}</span>
            <span style="margin-left:8px; color: var(--text-secondary);" class="mono">${escapeHtml(fmtSize(r.size_bytes))}</span>
            ${renderReviewSummary(reviewsByArtifactId ? reviewsByArtifactId[String(r.id || '')] : null)}
          </div>
          <div class="btn-row" style="margin:0;">
            <button class="btn secondary" type="button" data-open-artifact="${escapeHtml(r.id)}">Open</button>
            <button class="btn secondary" type="button" data-review-artifact="${escapeHtml(r.id)}">AI Check</button>
            <button class="btn danger" type="button" data-delete-artifact="${escapeHtml(r.id)}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function getAccessToken() {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token || '';
  if (!token) throw new Error('Session expired. Please log in again.');
  return token;
}

async function reviewArtifactById(artifactId) {
  const token = await getAccessToken();
  const resp = await fetch('/api/brady/review-artifact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ artifactId }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error || `AI review failed (${resp.status})`);
  }
  return body || {};
}

function bindArtifactsListHandlers(sectionKey, session, refresh) {
  const el = document.getElementById(`${sectionKey}UploadList`);
  if (!el) return;

  Array.from(el.querySelectorAll('button[data-open-artifact]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-open-artifact');
      if (!id) return;
      try {
        const row = await loadArtifactContent(session, id);
        if (!row) throw new Error('File not found.');
        const blob = base64ToBlob(row.content_base64, row.mime_type);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } catch (e) {
        setAlert(e?.message || 'Unable to open file.');
      }
    });
  });

  Array.from(el.querySelectorAll('button[data-delete-artifact]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-artifact');
      if (!id) return;
      try {
        btn.disabled = true;
        await deleteArtifact(session, id);
        await refresh();
      } catch (e) {
        setAlert(e?.message || 'Delete failed.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  Array.from(el.querySelectorAll('button[data-review-artifact]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-review-artifact');
      if (!id) return;
      try {
        btn.disabled = true;
        setAlert('');
        const out = await reviewArtifactById(id);
        const reused = Boolean(out?.reused);
        setAlert(reused ? 'AI check already existed and was loaded.' : 'AI check complete and saved.');
        await refresh();
      } catch (e) {
        setAlert(e?.message || 'AI check failed.');
      } finally {
        btn.disabled = false;
      }
    });
  });
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

function findLatestAttempt(attempts, kind, assignmentId) {
  for (const row of (attempts || [])) {
    if (!row) continue;
    if (row.practice_kind !== kind) continue;
    if (String(row.assignment_id || '') !== String(assignmentId || '')) continue;
    return row;
  }
  return null;
}

function countAttempts(attempts, kind, assignmentId) {
  let n = 0;
  for (const row of (attempts || [])) {
    if (!row) continue;
    if (row.practice_kind !== kind) continue;
    if (String(row.assignment_id || '') !== String(assignmentId || '')) continue;
    n++;
  }
  return n;
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
  const doneHtml = status?.completed
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

  const statusLines = [];
  if (Number.isFinite(Number(status?.attemptsCount))) {
    statusLines.push(`Attempts today: <span class="mono">${escapeHtml(status.attemptsCount)}</span>`);
  }
  if (status?.latestAttempt) {
    statusLines.push(
      `Latest attempt: <span class="mono">${escapeHtml(status.latestAttempt.scorePercent)}%</span> (${escapeHtml(status.latestAttempt.correctQuestions)}/${escapeHtml(status.latestAttempt.totalQuestions)}) at <span class="mono">${escapeHtml(status.latestAttempt.time)}</span>`
    );
  }
  if (status?.completed && status?.latestPassingAttempt) {
    statusLines.push(
      `Passing score: <span class="mono">${escapeHtml(status.latestPassingAttempt.scorePercent)}%</span> (${escapeHtml(status.latestPassingAttempt.correctQuestions)}/${escapeHtml(status.latestPassingAttempt.totalQuestions)})`
    );
  }
  const statusLine = statusLines.length
    ? `<div class="small" style="margin-top:8px;">${statusLines.join('<br>')}</div>`
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
    <div class="small" id="${escapeHtml(sectionKey)}Autosave" style="margin-top:8px; color: var(--text-secondary);"></div>
    <div class="small" id="${escapeHtml(sectionKey)}Msg" style="margin-top:10px;"></div>
    ${questionHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn" type="button" id="${escapeHtml(sectionKey)}Submit">Submit & Grade</button>
      <button class="btn secondary" type="button" id="${escapeHtml(sectionKey)}New">New Version</button>
    </div>

    <div class="section" style="margin-top:14px;">
      <h2>Upload Work (Optional)</h2>
      <div class="small">Upload a photo or PDF of scratch work. Max 8 MB per file.</div>
      <div class="field-row" style="margin-top:10px;">
        <div>
          <label for="${escapeHtml(sectionKey)}UploadFile">File</label>
          <input id="${escapeHtml(sectionKey)}UploadFile" type="file" accept="application/pdf,image/*,text/plain">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn secondary" type="button" id="${escapeHtml(sectionKey)}UploadBtn">Upload</button>
        <span class="small" id="${escapeHtml(sectionKey)}UploadMsg"></span>
      </div>
      <div class="small" id="${escapeHtml(sectionKey)}UploadList" style="margin-top:10px;"></div>
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

    <div id="attemptHistorySection" class="section" style="margin-top:18px;"></div>

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

function renderAttemptHistory(dayISO, attempts, lookup) {
  const el = document.getElementById('attemptHistorySection');
  if (!el) return;

  const rows = attempts || [];
  const safe = (s) => escapeHtml(String(s || ''));
  const kindLabel = (k) => {
    if (k === 'daily_warmup') return 'Warm-up';
    if (k === 'daily_target') return 'Target';
    if (k === 'daily_mixed') return 'Mixed';
    if (k === 'daily_ai') return 'AI';
    return String(k || '');
  };

  const assignmentTitle = (assignmentId) => {
    if (!assignmentId) return '';
    if (assignmentId === 'daily_warmup') return 'Daily Warm-up';
    if (assignmentId === 'daily_ai') return 'AI Co-Learning';
    const a = lookup?.byId?.[assignmentId];
    return a ? a.title : String(assignmentId);
  };

  const body = rows.map((r) => {
    const time = formatLocalTime(r.practiced_at);
    const score = Number(r.score_percent);
    const correct = Number(r.correct_questions);
    const total = Number(r.total_questions);
    const badge = Number.isFinite(score) && score >= 80
      ? '<span class="status-badge mastered">PASS</span>'
      : '<span class="status-badge in_progress">TRY</span>';

    return `
      <tr>
        <td class="mono">${safe(r.practice_kind)}</td>
        <td>${safe(kindLabel(r.practice_kind))}</td>
        <td>${safe(assignmentTitle(r.assignment_id))}</td>
        <td class="mono">${safe(time)}</td>
        <td class="mono">${Number.isFinite(score) ? safe(`${score}%`) : ''}</td>
        <td class="mono">${Number.isFinite(correct) && Number.isFinite(total) ? safe(`${correct}/${total}`) : ''}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Attempt History (Today)</h2>
    <div class="small">This is the proof that work was saved on ${escapeHtml(dayISO)} (including failed attempts).</div>
    <div class="small" style="margin-top:8px;">Total attempts shown: <span class="mono">${escapeHtml(rows.length)}</span></div>
    <table class="table" style="margin-top:12px;">
      <thead>
        <tr>
          <th>Kind</th>
          <th>Section</th>
          <th>Assignment</th>
          <th>Time</th>
          <th>Score</th>
          <th>Correct</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${body || ''}</tbody>
    </table>
  `;
}

function restoreDraftInputs(sectionKey, quiz, draftRow, seed) {
  if (!draftRow || typeof draftRow !== 'object') return { restored: 0 };
  const draftSeed = Number(draftRow.seed);
  if (Number.isFinite(draftSeed) && Number.isFinite(Number(seed)) && draftSeed !== Number(seed)) {
    return { restored: 0 };
  }

  const answers = (draftRow.answers && typeof draftRow.answers === 'object') ? draftRow.answers : {};
  let restored = 0;
  for (const q of (quiz.questions || [])) {
    const v = answers[q.id];
    if (v === undefined) continue;
    const el = document.getElementById(`${sectionKey}_ans_${q.id}`);
    if (!el) continue;
    el.value = String(v ?? '');
    if (String(v ?? '').trim() !== '') restored++;
  }
  return { restored };
}

function bindDraftAutosave(opts) {
  const {
    session,
    dayISO,
    practiceKind,
    assignmentId,
    sectionKey,
    seed,
    quiz,
  } = opts;

  const statusEl = document.getElementById(`${sectionKey}Autosave`);
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg || ''; };

  let timer = null;
  let lastSavedJson = '';
  let saving = false;

  const collectAnswers = () => {
    const out = {};
    for (const q of (quiz.questions || [])) {
      const raw = getAnswerFromDom(sectionKey, q);
      out[q.id] = raw == null ? '' : String(raw);
    }
    return out;
  };

  const saveNow = async () => {
    if (saving) return;
    saving = true;
    try {
      const answers = collectAnswers();
      const hasAny = Object.values(answers).some((v) => String(v || '').trim() !== '');

      if (!hasAny) {
        try {
          await clearDailyDraft(session, dayISO, practiceKind, assignmentId);
        } catch (_) {
          // ignore
        }
        clearLocalDraft(dayISO, practiceKind, assignmentId);
        setStatus('Draft cleared.');
        lastSavedJson = '';
        return;
      }

      const payloadJson = JSON.stringify({ seed, answers });
      if (payloadJson === lastSavedJson) return;

      setStatus('Saving draft…');
      await saveDailyDraft(session, dayISO, practiceKind, assignmentId, seed, answers);
      writeLocalDraft(dayISO, practiceKind, assignmentId, { seed, answers, updatedAt: new Date().toISOString() });
      lastSavedJson = payloadJson;
      setStatus(`Draft saved at ${formatLocalTime(new Date().toISOString())}.`);
    } catch (e) {
      // Fall back to local-only if Supabase save fails.
      const answers = collectAnswers();
      writeLocalDraft(dayISO, practiceKind, assignmentId, { seed, answers, updatedAt: new Date().toISOString(), localOnly: true });
      setStatus('Draft saved in this browser (cloud save failed).');
    } finally {
      saving = false;
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void saveNow(); }, 650);
  };

  for (const q of (quiz.questions || [])) {
    const el = document.getElementById(`${sectionKey}_ans_${q.id}`);
    if (!el) continue;
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  }

  // Save drafts when leaving the page.
  window.addEventListener('beforeunload', () => {
    try {
      const answers = collectAnswers();
      writeLocalDraft(dayISO, practiceKind, assignmentId, { seed, answers, updatedAt: new Date().toISOString(), localOnly: true });
    } catch (_) {
      // ignore
    }
  });

  return { saveNow, setStatus };
}

function bindUploadHandlers(opts) {
  const {
    session,
    dayISO,
    practiceKind,
    assignmentId,
    sectionKey,
  } = opts;

  const fileEl = document.getElementById(`${sectionKey}UploadFile`);
  const uploadBtn = document.getElementById(`${sectionKey}UploadBtn`);
  const msgEl = document.getElementById(`${sectionKey}UploadMsg`);

  const setMsg = (msg) => { if (msgEl) msgEl.textContent = msg || ''; };

  const refresh = async () => {
    try {
      const rows = await loadSectionArtifacts(session, dayISO, practiceKind, assignmentId);
      const ids = rows.map((r) => r.id);
      const reviewsByArtifactId = await loadArtifactReviews(session, ids).catch(() => ({}));
      renderArtifactsList(sectionKey, rows, reviewsByArtifactId);
      bindArtifactsListHandlers(sectionKey, session, refresh);
    } catch (e) {
      renderArtifactsList(sectionKey, [], {});
      setMsg(e?.message || 'Unable to load uploads.');
    }
  };

  if (!assignmentId) {
    if (uploadBtn) uploadBtn.disabled = true;
    if (fileEl) fileEl.disabled = true;
    setMsg('Uploads unavailable: missing assignment id.');
    return;
  }

  void refresh();

  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      setAlert('');
      setMsg('');
      const file = fileEl?.files?.[0] || null;
      if (!file) {
        setMsg('Select a file first.');
        return;
      }

      if (Number(file.size) > 8_000_000) {
        setMsg('File is too large. Max 8 MB.');
        return;
      }

      uploadBtn.disabled = true;
      setMsg('Uploading…');
      try {
        const base64 = await readFileAsBase64(file);
        const sb = MHA_Auth.getSupabase();
        const { error } = await sb.from('brady_artifacts').insert({
          user_id: session.user.id,
          day: dayISO,
          practice_kind: practiceKind,
          assignment_id: assignmentId,
          filename: file.name || 'upload',
          mime_type: file.type || 'application/octet-stream',
          size_bytes: Number(file.size) || 0,
          content_base64: base64,
        });
        if (error) throw error;

        if (fileEl) fileEl.value = '';
        setMsg('Uploaded.');
        await refresh();
      } catch (e) {
        setMsg(e?.message || 'Upload failed.');
      } finally {
        uploadBtn.disabled = false;
      }
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

      // Clear draft after a successful submission so a refresh doesn't look "unsaved".
      try {
        await clearDailyDraft(session, dayISO, practiceKind, assignmentId);
      } catch (_) {
        // no-op
      }
      clearLocalDraft(dayISO, practiceKind, assignmentId);

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

    let drafts = [];
    try {
      drafts = await loadDailyDrafts(gate.session, dayISO);
    } catch (_) {
      drafts = [];
    }

    const draftByKey = {};
    for (const d of (drafts || [])) {
      if (!d) continue;
      const k = `${String(d.practice_kind || '')}:${String(d.assignment_id || '')}`;
      draftByKey[k] = d;
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

    const warmupLatestRow = findLatestAttempt(attempts, 'daily_warmup', warmupAssignmentId);
    const targetLatestRow = target ? findLatestAttempt(attempts, 'daily_target', targetAssignmentId) : null;
    const mixedLatestRow = mixed ? findLatestAttempt(attempts, 'daily_mixed', mixedAssignmentId) : null;
    const aiLatestRow = findLatestAttempt(attempts, 'daily_ai', aiAssignmentId);

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
      {
        completed: Boolean(warmupPassedRow),
        attemptsCount: countAttempts(attempts, 'daily_warmup', warmupAssignmentId),
        latestAttempt: warmupLatestRow ? {
          scorePercent: warmupLatestRow.score_percent,
          correctQuestions: warmupLatestRow.correct_questions,
          totalQuestions: warmupLatestRow.total_questions,
          time: formatLocalTime(warmupLatestRow.practiced_at),
        } : null,
        latestPassingAttempt: warmupPassedRow ? {
          scorePercent: warmupPassedRow.score_percent,
          correctQuestions: warmupPassedRow.correct_questions,
          totalQuestions: warmupPassedRow.total_questions,
        } : null,
      }
    );

    renderQuizSection(
      'target',
      'Target Skill Practice',
      target ? `Practice for <span class="mono">${escapeHtml(target.title)}</span>.` : 'No target assignment found.',
      targetQuizLive,
      targetSeed >>> 0,
      {
        completed: Boolean(targetPassedRow),
        attemptsCount: countAttempts(attempts, 'daily_target', targetAssignmentId),
        latestAttempt: targetLatestRow ? {
          scorePercent: targetLatestRow.score_percent,
          correctQuestions: targetLatestRow.correct_questions,
          totalQuestions: targetLatestRow.total_questions,
          time: formatLocalTime(targetLatestRow.practiced_at),
        } : null,
        latestPassingAttempt: targetPassedRow ? {
          scorePercent: targetPassedRow.score_percent,
          correctQuestions: targetPassedRow.correct_questions,
          totalQuestions: targetPassedRow.total_questions,
        } : null,
      }
    );

    renderQuizSection(
      'mixed',
      'Mixed Review Practice',
      mixed ? `Review for <span class="mono">${escapeHtml(mixed.title)}</span>.` : 'No mixed review assignment found.',
      mixedQuizLive,
      mixedSeed >>> 0,
      {
        completed: Boolean(mixedPassedRow),
        attemptsCount: countAttempts(attempts, 'daily_mixed', mixedAssignmentId),
        latestAttempt: mixedLatestRow ? {
          scorePercent: mixedLatestRow.score_percent,
          correctQuestions: mixedLatestRow.correct_questions,
          totalQuestions: mixedLatestRow.total_questions,
          time: formatLocalTime(mixedLatestRow.practiced_at),
        } : null,
        latestPassingAttempt: mixedPassedRow ? {
          scorePercent: mixedPassedRow.score_percent,
          correctQuestions: mixedPassedRow.correct_questions,
          totalQuestions: mixedPassedRow.total_questions,
        } : null,
      }
    );

    renderQuizSection(
      'ai',
      'AI Co-Learning Quiz',
      'Short quiz on how to use ChatGPT / Codex / Claude effectively (provable completion).',
      aiQuizLive,
      aiSeed >>> 0,
      {
        completed: Boolean(aiPassedRow),
        attemptsCount: countAttempts(attempts, 'daily_ai', aiAssignmentId),
        latestAttempt: aiLatestRow ? {
          scorePercent: aiLatestRow.score_percent,
          correctQuestions: aiLatestRow.correct_questions,
          totalQuestions: aiLatestRow.total_questions,
          time: formatLocalTime(aiLatestRow.practiced_at),
        } : null,
        latestPassingAttempt: aiPassedRow ? {
          scorePercent: aiPassedRow.score_percent,
          correctQuestions: aiPassedRow.correct_questions,
          totalQuestions: aiPassedRow.total_questions,
        } : null,
      }
    );

    const lookup = { byId: {} };
    for (const a of (BRADY_ASSIGNMENTS || [])) {
      if (a && a.id) lookup.byId[a.id] = a;
    }
    renderAttemptHistory(dayISO, attempts, lookup);

    // Restore drafts (Supabase first, then local fallback).
    const warmupDraft = draftByKey[`daily_warmup:${warmupAssignmentId}`] || readLocalDraft(dayISO, 'daily_warmup', warmupAssignmentId);
    const targetDraft = draftByKey[`daily_target:${targetAssignmentId}`] || readLocalDraft(dayISO, 'daily_target', targetAssignmentId);
    const mixedDraft = draftByKey[`daily_mixed:${mixedAssignmentId}`] || readLocalDraft(dayISO, 'daily_mixed', mixedAssignmentId);
    const aiDraft = draftByKey[`daily_ai:${aiAssignmentId}`] || readLocalDraft(dayISO, 'daily_ai', aiAssignmentId);

    const warmupRestored = restoreDraftInputs('warmup', warmupQuizLive, warmupDraft, warmupSeed >>> 0);
    const targetRestored = restoreDraftInputs('target', targetQuizLive, targetDraft, targetSeed >>> 0);
    const mixedRestored = restoreDraftInputs('mixed', mixedQuizLive, mixedDraft, mixedSeed >>> 0);
    const aiRestored = restoreDraftInputs('ai', aiQuizLive, aiDraft, aiSeed >>> 0);

    const warmupAutosave = bindDraftAutosave({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_warmup',
      assignmentId: warmupAssignmentId,
      sectionKey: 'warmup',
      seed: warmupSeed >>> 0,
      quiz: warmupQuizLive,
    });
    if (warmupRestored.restored > 0) warmupAutosave.setStatus(`Draft restored (${warmupRestored.restored} answered).`);

    const targetAutosave = bindDraftAutosave({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_target',
      assignmentId: targetAssignmentId,
      sectionKey: 'target',
      seed: targetSeed >>> 0,
      quiz: targetQuizLive,
    });
    if (targetRestored.restored > 0) targetAutosave.setStatus(`Draft restored (${targetRestored.restored} answered).`);

    const mixedAutosave = bindDraftAutosave({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_mixed',
      assignmentId: mixedAssignmentId,
      sectionKey: 'mixed',
      seed: mixedSeed >>> 0,
      quiz: mixedQuizLive,
    });
    if (mixedRestored.restored > 0) mixedAutosave.setStatus(`Draft restored (${mixedRestored.restored} answered).`);

    const aiAutosave = bindDraftAutosave({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_ai',
      assignmentId: aiAssignmentId,
      sectionKey: 'ai',
      seed: aiSeed >>> 0,
      quiz: aiQuizLive,
    });
    if (aiRestored.restored > 0) aiAutosave.setStatus(`Draft restored (${aiRestored.restored} answered).`);

    bindUploadHandlers({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_warmup',
      assignmentId: warmupAssignmentId,
      sectionKey: 'warmup',
    });
    bindUploadHandlers({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_target',
      assignmentId: targetAssignmentId,
      sectionKey: 'target',
    });
    bindUploadHandlers({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_mixed',
      assignmentId: mixedAssignmentId,
      sectionKey: 'mixed',
    });
    bindUploadHandlers({
      session: gate.session,
      dayISO,
      practiceKind: 'daily_ai',
      assignmentId: aiAssignmentId,
      sectionKey: 'ai',
    });

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
