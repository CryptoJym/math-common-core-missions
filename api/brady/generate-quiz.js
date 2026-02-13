/**
 * Vercel Serverless Function: /api/brady/generate-quiz
 *
 * Purpose:
 * - Securely call an LLM (server-side, with API key) to generate a fresh,
 *   auto-graded quiz JSON for a specific assignment.
 * - Store the generated quiz in Supabase so we can reuse it and render the same
 *   quiz again later (review mode, refreshes, etc.).
 *
 * Auth model:
 * - Client sends Supabase access token in `Authorization: Bearer <token>`.
 * - We verify the token with Supabase Auth, then enforce a simple allowed-email list.
 * - We insert into Supabase using the SAME user token, so Supabase RLS stays the
 *   source of truth (no service role key required).
 */

const DEFAULT_SUPABASE_URL = 'https://dwkjbuefiiawoktmprmp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2pidWVmaWlhd29rdG1wcm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDA0MTgsImV4cCI6MjA4NjQxNjQxOH0.EXY-qerJ9v9EeerJ4Q2ec0XC3_rbbRls2HH8bTRxRTw';

const ALLOWED_EMAILS = new Set([
  'bradyhyro67@gmail.com',
  'james@jamesbrady.org',
]);

// Server-enforced cooldown after a failed attempt (< passPercent).
const LOCKOUT_DAYS = 3;
const LOCKOUT_MS = LOCKOUT_DAYS * 24 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUuid(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return /^[0-9a-f-]{36}$/.test(v) ? v : '';
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  const s = String(raw || '').trim();
  if (!s.toLowerCase().startsWith('bearer ')) return '';
  return s.slice('bearer '.length).trim();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function safeJsonParse(maybeText) {
  const s = String(maybeText || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    // Try to extract first JSON object in the text.
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function normalizeTagKey(tag) {
  const k = String(tag || '').trim().toLowerCase();
  if (!k) return '';
  if (!/^[a-z0-9_]{1,32}$/.test(k)) return '';
  return k;
}

function computeFocusTagsFromAttemptResults(results) {
  const out = {};
  if (!results || typeof results !== 'object') return out;
  for (const r of Object.values(results)) {
    if (!r || typeof r !== 'object') continue;
    if (r.correct !== false) continue;
    const tags = Array.isArray(r.tags) ? r.tags : [];
    for (const t of tags) {
      const k = normalizeTagKey(t);
      if (!k) continue;
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}

function buildQuizPrompt({ assignment, passPercent, focusTags, latestScorePercent }) {
  const standards = Array.isArray(assignment?.standards) ? assignment.standards : [];
  const targets = Array.isArray(assignment?.learningTargets) ? assignment.learningTargets : [];
  const focus = focusTags && typeof focusTags === 'object' ? focusTags : {};

  const focusLines = Object.entries(focus)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 10)
    .map(([k, v]) => `- ${k}: missed in ${v} question(s)`)
    .join('\n');

  return [
    'You are an expert tutor and curriculum designer.',
    'You must output ONLY valid JSON (no markdown, no commentary).',
    '',
    `Assignment: ${assignment?.title || assignment?.id || 'Unknown'}`,
    `Pass threshold: ${passPercent}%`,
    Number.isFinite(latestScorePercent) ? `Most recent score: ${latestScorePercent}%` : '',
    standards.length ? `Standards: ${standards.join(', ')}` : 'Standards: (not provided)',
    targets.length ? `Learning targets:\n- ${targets.join('\n- ')}` : 'Learning targets: (not provided)',
    '',
    'The student missed these skill tags (highest priority first):',
    focusLines || '- (no tag data available; generate a balanced version)',
    '',
    'Output requirements:',
    '- Output EXACTLY 10 questions.',
    '- Each question MUST be auto-graded and include an answer key.',
    '- Use ONLY these question types: mc, number, fraction, set_numbers, expanded_sum.',
    '- Each question object MUST include: id (q1..q10), type, prompt, answer, choices (if mc), explanation, tags.',
    '- tags should be short snake_case strings (1-3 per question).',
    '- Do not include trick questions. Keep numbers reasonable.',
    '',
    'Return JSON with this shape:',
    '{ "passPercent": 80, "title": "string", "questions": [ ...10 items... ] }',
  ].filter(Boolean).join('\n');
}

function validateGeneratedQuiz(quiz) {
  const errors = [];
  const allowedTypes = new Set(['mc', 'number', 'fraction', 'set_numbers', 'expanded_sum']);

  if (!quiz || typeof quiz !== 'object') {
    return { ok: false, errors: ['Quiz is not an object'] };
  }

  if (!Number.isFinite(Number(quiz.passPercent))) errors.push('passPercent must be a number');
  if (!quiz.title || typeof quiz.title !== 'string') errors.push('title must be a string');
  if (!Array.isArray(quiz.questions)) errors.push('questions must be an array');

  if (errors.length) return { ok: false, errors };

  if (quiz.questions.length !== 10) errors.push('questions must have exactly 10 items');

  const ids = quiz.questions.map((q) => q && q.id).filter(Boolean);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== 10) errors.push('question ids must be unique (q1..q10)');
  for (let i = 1; i <= 10; i++) {
    if (!uniqueIds.has(`q${i}`)) errors.push(`missing question id q${i}`);
  }

  for (const q of quiz.questions) {
    if (!q || typeof q !== 'object') {
      errors.push('question is not an object');
      continue;
    }
    if (!q.id || typeof q.id !== 'string') errors.push('question.id must be a string');
    if (!allowedTypes.has(q.type)) errors.push(`question.type invalid: ${q.type}`);
    if (!q.prompt || typeof q.prompt !== 'string') errors.push(`question.prompt missing for ${q.id}`);
    if (!Array.isArray(q.tags) || q.tags.length < 1) errors.push(`question.tags missing for ${q.id}`);
    if (typeof q.explanation !== 'string') errors.push(`question.explanation must be a string for ${q.id}`);

    if (q.type === 'mc') {
      if (!Array.isArray(q.choices) || q.choices.length < 2) errors.push(`mc choices missing for ${q.id}`);
      if (typeof q.answer !== 'string') errors.push(`mc answer must be a string for ${q.id}`);
      if (Array.isArray(q.choices) && typeof q.answer === 'string' && !q.choices.includes(q.answer)) {
        errors.push(`mc answer must be one of choices for ${q.id}`);
      }
    } else if (q.type === 'number' || q.type === 'expanded_sum') {
      if (!Number.isFinite(Number(q.answer))) errors.push(`${q.type} answer must be a number for ${q.id}`);
    } else if (q.type === 'fraction') {
      if (!q.answer || typeof q.answer !== 'object') errors.push(`fraction answer must be an object for ${q.id}`);
      const num = Number(q.answer?.num);
      const den = Number(q.answer?.den);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) errors.push(`fraction num/den invalid for ${q.id}`);
    } else if (q.type === 'set_numbers') {
      if (!Array.isArray(q.answer)) errors.push(`set_numbers answer must be an array for ${q.id}`);
      if (Array.isArray(q.answer) && q.answer.some((n) => !Number.isFinite(Number(n)))) errors.push(`set_numbers answer must be numbers for ${q.id}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function supabaseGetUser({ supabaseUrl, anonKey, accessToken }) {
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    const errorCode = String(parsed?.error_code || parsed?.code || '');
    const msg = String(parsed?.msg || parsed?.message || text || '');

    if (resp.status === 403 && (errorCode === 'session_not_found' || msg.includes('session_id claim'))) {
      const err = new Error('Session expired. Please log in again.');
      err.statusCode = 401;
      err.errorCode = 'session_not_found';
      throw err;
    }

    const err = new Error(`Supabase auth failed (${resp.status}): ${text}`);
    err.statusCode = resp.status;
    err.errorCode = errorCode || '';
    throw err;
  }
  return await resp.json();
}

async function supabaseRestGet({ supabaseUrl, anonKey, accessToken, table, params }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase REST GET failed (${resp.status}): ${text}`);
  }
  return await resp.json();
}

async function supabaseRestInsert({ supabaseUrl, anonKey, accessToken, table, row }) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase REST INSERT failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data[0] : data;
}

async function assertCanManageUserData({
  supabaseUrl,
  anonKey,
  accessToken,
  actorId,
  targetUserId,
}) {
  if (!actorId || !targetUserId || actorId === targetUserId) {
    return;
  }

  const rows = await supabaseRestGet({
    supabaseUrl,
    anonKey,
    accessToken,
    table: 'brady_sub_accounts',
    params: {
      select: 'id',
      admin_user_id: `eq.${actorId}`,
      learner_id: `eq.${targetUserId}`,
      is_active: 'eq.true',
      limit: '1',
    },
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    const err = new Error('Not allowed for this learner');
    err.statusCode = 403;
    throw err;
  }
}

async function callOpenAIForQuiz({ model, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }

  const responseFormat = {
    type: 'json_object',
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'developer', content: 'Return only valid JSON. Do not include markdown.' },
        { role: 'user', content: prompt },
      ],
      response_format: responseFormat,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error('Model did not return valid JSON.');
  return parsed;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    // Same-origin by default, but handle preflight safely.
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      sendJson(res, 401, { error: 'Missing bearer token' });
      return;
    }

    const body = await readJsonBody(req);
    const assignment = body?.assignment || null;
    const assignmentId = String(body?.assignmentId || assignment?.id || '').trim();
    const passPercent = 80;
    const basedOnAttemptedAt = body?.basedOnAttemptedAt ? String(body.basedOnAttemptedAt) : '';
    const requestedQueryUserId = normalizeUuid(body?.queryUserId);
    let queryUserId = '';

    if (!assignmentId) {
      sendJson(res, 400, { error: 'assignmentId is required' });
      return;
    }

    if (!basedOnAttemptedAt) {
      sendJson(res, 400, { error: 'basedOnAttemptedAt is required' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

    const user = await supabaseGetUser({ supabaseUrl, anonKey, accessToken });
    const email = normalizeEmail(user?.email);
    if (!ALLOWED_EMAILS.has(email)) {
      sendJson(res, 403, { error: 'Not allowed' });
      return;
    }

    queryUserId = requestedQueryUserId || normalizeUuid(user?.id);
    if (requestedQueryUserId && !queryUserId) {
      sendJson(res, 400, { error: 'queryUserId must be a valid UUID' });
      return;
    }

    await assertCanManageUserData({
      supabaseUrl,
      anonKey,
      accessToken,
      actorId: user?.id,
      targetUserId: queryUserId,
    });

    // This endpoint is intended to generate an adaptive quiz only after a failed attempt's
    // cooldown has expired. Enforce that server-side to prevent cost abuse.
    const latestRows = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_assignment_attempts',
      params: {
        select: 'attempted_at,score_percent,results',
        user_id: `eq.${queryUserId}`,
        assignment_id: `eq.${assignmentId}`,
        order: 'attempted_at.desc',
        limit: 1,
      },
    });

    const latestAttempt = Array.isArray(latestRows) ? latestRows[0] : null;
    if (!latestAttempt) {
      sendJson(res, 409, { error: 'No attempts found for this assignment' });
      return;
    }

    const latestAttemptedAt = String(latestAttempt.attempted_at || '');
    const latestMs = Date.parse(latestAttemptedAt);
    const basedOnMs = Date.parse(basedOnAttemptedAt);
    const matchesLatest = (
      latestAttemptedAt === basedOnAttemptedAt
      || (Number.isFinite(latestMs) && Number.isFinite(basedOnMs) && Math.abs(latestMs - basedOnMs) < 1000)
    );
    if (!matchesLatest) {
      sendJson(res, 409, { error: 'basedOnAttemptedAt must match latest attempt' });
      return;
    }

    const score = Number(latestAttempt.score_percent);
    if (!Number.isFinite(score)) {
      sendJson(res, 500, { error: 'Latest attempt score is invalid' });
      return;
    }
    if (score >= passPercent) {
      sendJson(res, 409, { error: 'Latest attempt already passed' });
      return;
    }

    const lockedUntilMs = Number.isFinite(latestMs) ? (latestMs + LOCKOUT_MS) : NaN;
    if (Number.isFinite(lockedUntilMs) && Date.now() < lockedUntilMs) {
      sendJson(res, 423, { error: 'Locked', lockedUntil: new Date(lockedUntilMs).toISOString() });
      return;
    }

    // Practice requirement (defense-in-depth):
    // After a failed attempt + cooldown expiry, the student must complete a passing
    // auto-graded practice set before the adaptive retake quiz is available.
    const practiceRows = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_practice_attempts',
      params: {
        select: 'practiced_at,score_percent',
        user_id: `eq.${queryUserId}`,
        practice_kind: 'eq.assignment_retake',
        assignment_id: `eq.${assignmentId}`,
        based_on_attempted_at: `eq.${basedOnAttemptedAt}`,
        score_percent: `gte.${passPercent}`,
        order: 'practiced_at.desc',
        limit: 1,
      },
    });

    const passingPractice = Array.isArray(practiceRows) ? practiceRows[0] : null;
    if (!passingPractice) {
      sendJson(res, 428, { error: 'Practice required', passPercent });
      return;
    }

    const focusTags = computeFocusTagsFromAttemptResults(latestAttempt.results);
    const latestScorePercent = score;

    // Cache: if we already generated a quiz for this failed attempt, reuse it.
    if (basedOnAttemptedAt) {
      const existing = await supabaseRestGet({
        supabaseUrl,
        anonKey,
        accessToken,
        table: 'brady_generated_quizzes',
        params: {
          select: 'id,quiz,created_at',
          user_id: `eq.${queryUserId}`,
          assignment_id: `eq.${assignmentId}`,
          based_on_attempted_at: `eq.${basedOnAttemptedAt}`,
          order: 'created_at.desc',
          limit: 1,
        },
      });
      if (Array.isArray(existing) && existing[0]?.quiz) {
        sendJson(res, 200, { reused: true, quiz: existing[0].quiz });
        return;
      }
    }

    const prompt = buildQuizPrompt({ assignment, passPercent, focusTags, latestScorePercent });
    const model = process.env.OPENAI_MODEL || 'gpt-5.2';
    const quiz = await callOpenAIForQuiz({ model, prompt });

    // Force pass percent to match the assignment (do not let the model change it).
    quiz.passPercent = passPercent;
    if (!quiz.title) quiz.title = assignment?.title || assignmentId;

    const validation = validateGeneratedQuiz(quiz);
    if (!validation.ok) {
      sendJson(res, 422, { error: 'Invalid quiz generated', details: validation.errors });
      return;
    }

    // Store for later reuse.
    await supabaseRestInsert({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_generated_quizzes',
      row: {
        user_id: queryUserId,
        assignment_id: assignmentId,
        based_on_attempted_at: basedOnAttemptedAt,
        focus_tags: focusTags,
        quiz,
      },
    });

    sendJson(res, 200, { reused: false, quiz });
  } catch (e) {
    const status = Number.isFinite(Number(e?.statusCode)) ? Number(e.statusCode) : 500;
    sendJson(res, status, {
      error: e?.message || 'Unknown error',
      error_code: e?.errorCode || e?.code || e?.error_code || null,
    });
  }
}

module.exports = handler;
module.exports._internal = {
  normalizeEmail,
  safeJsonParse,
  normalizeTagKey,
  computeFocusTagsFromAttemptResults,
  buildQuizPrompt,
  validateGeneratedQuiz,
};
