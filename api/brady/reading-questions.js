/**
 * Vercel Serverless Function: /api/brady/reading-questions
 *
 * Purpose:
 * - Generate simple reading-comprehension questions from today's reading notes.
 * - Focus on understanding + message/theme (what the learner is gleaning).
 *
 * Security:
 * - Requires Supabase bearer token.
 * - Allowlisted emails only.
 * - Supports delegated learner context via brady_sub_accounts.
 */

const DEFAULT_SUPABASE_URL = 'https://dwkjbuefiiawoktmprmp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2pidWVmaWlhd29rdG1wcm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDA0MTgsImV4cCI6MjA4NjQxNjQxOH0.EXY-qerJ9v9EeerJ4Q2ec0XC3_rbbRls2HH8bTRxRTw';

const ALLOWED_EMAILS = new Set([
  'bradyhyro67@gmail.com',
  'james@jamesbrady.org',
]);

const BOOK_TITLES = {
  richest_man_babylon: 'The Richest Man in Babylon',
  alchemist: 'The Alchemist (Graphic Novel)',
  anthem: 'Anthem (Ayn Rand)',
  nineteen_eighty_four: '1984 (George Orwell)',
  animal_farm: 'Animal Farm (George Orwell)',
  meditations: 'Meditations (Marcus Aurelius)',
  as_a_man_thinketh: 'As a Man Thinketh (James Allen)',
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUuid(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return /^[0-9a-f-]{36}$/.test(v) ? v : '';
}

function normalizeText(value, maxLen = 2000) {
  return String(value || '').trim().slice(0, Math.max(0, Number(maxLen) || 0));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function safeJsonParse(maybeText) {
  const s = String(maybeText || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, payload) {
  setCors(res);
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

function parseQuestionsPayload(payload) {
  const source = payload && typeof payload === 'object'
    ? (Array.isArray(payload.questions) ? payload.questions : payload.items)
    : null;
  if (!Array.isArray(source)) throw new Error('AI response missing questions array');

  const out = [];
  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    if (typeof item === 'string') {
      const q = normalizeText(item, 240);
      if (!q) continue;
      out.push({ id: `q${out.length + 1}`, question: q, focus: 'comprehension', why: 'Checks understanding.' });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const question = normalizeText(item.question || item.prompt, 240);
    if (!question) continue;
    const focus = normalizeText(item.focus || item.type || 'comprehension', 40).toLowerCase() || 'comprehension';
    const why = normalizeText(item.why || item.reason || 'Checks understanding.', 240) || 'Checks understanding.';
    out.push({ id: `q${out.length + 1}`, question, focus, why });
    if (out.length >= 8) break;
  }

  if (out.length < 4) throw new Error('AI response included too few valid questions');
  return out;
}

function fallbackQuestions({ bookTitle, pagesRead, rememberedNotes, journal }) {
  const pageText = pagesRead ? `on pages ${pagesRead}` : 'today';
  const memoryText = normalizeText(rememberedNotes || journal, 220);

  const questions = [
    {
      id: 'q1',
      question: `What happened ${pageText} in ${bookTitle}?`,
      focus: 'literal',
      why: 'Checks basic recall accuracy.',
    },
    {
      id: 'q2',
      question: 'What is one message or lesson you think the author is teaching here?',
      focus: 'message',
      why: 'Checks what message the learner is gleaning.',
    },
    {
      id: 'q3',
      question: 'What detail from the text best supports that message?',
      focus: 'evidence',
      why: 'Checks evidence-based understanding.',
    },
    {
      id: 'q4',
      question: 'What part was confusing, and what question should you ask tomorrow to clear it up?',
      focus: 'clarify',
      why: 'Checks metacognition and next-step planning.',
    },
    {
      id: 'q5',
      question: 'How could you apply one idea from this reading in real life today?',
      focus: 'application',
      why: 'Checks transfer from reading to action.',
    },
    {
      id: 'q6',
      question: 'If you had to teach this section to someone else in 30 seconds, what would you say?',
      focus: 'synthesis',
      why: 'Checks concise understanding and retention.',
    },
  ];

  if (memoryText) {
    questions.push({
      id: `q${questions.length + 1}`,
      question: `You wrote: "${memoryText}". Which part are you most confident about, and which part should you verify in the book?`,
      focus: 'self-check',
      why: 'Checks confidence calibration vs text evidence.',
    });
  }

  return questions.slice(0, 8);
}

function buildPrompt({ day, bookTitle, pagesRead, rememberedNotes, journal }) {
  return [
    'You are a reading tutor for a middle-school learner.',
    'Generate simple comprehension questions that test understanding and message/theme.',
    'Return ONLY valid JSON. No markdown.',
    '',
    'JSON schema:',
    '{',
    '  "questions": [',
    '    { "question": "string", "focus": "literal|message|evidence|application|reflection", "why": "string" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Return 6 questions.',
    '- Keep each question short and clear (grade 6-8 reading level).',
    '- At least 2 questions must test message/theme.',
    '- At least 1 question must ask for text evidence.',
    '- At least 1 question must ask for real-life application.',
    '- Keep "why" to one short sentence.',
    '',
    `Date: ${day}`,
    `Book: ${bookTitle}`,
    `Pages read: ${pagesRead || '(not provided)'}`,
    '',
    'Student "what I remember" notes:',
    rememberedNotes || '(none provided)',
    '',
    'Optional workbook notes:',
    journal || '(none provided)',
  ].join('\n');
}

function providerUnavailableError(message) {
  const err = new Error(message);
  err.statusCode = 503;
  err.errorCode = 'llm_not_configured';
  return err;
}

async function callOpenAIQuestions({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw providerUnavailableError('OPENAI_API_KEY is not configured.');

  const model = process.env.OPENAI_MODEL || 'gpt-5.2';

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'developer', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`OpenAI request failed (${resp.status}): ${text}`);
    err.statusCode = resp.status;
    throw err;
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error('Model did not return valid JSON');

  return {
    provider: 'openai',
    model,
    questions: parseQuestionsPayload(parsed),
  };
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
    const err = new Error(`Supabase auth failed (${resp.status}): ${text}`);
    err.statusCode = resp.status;
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

async function assertCanManageUserData({ supabaseUrl, anonKey, accessToken, actorId, targetUserId }) {
  if (!actorId || !targetUserId || actorId === targetUserId) return;

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

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end('');
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Missing bearer token' });
    return;
  }

  try {
    const body = await readJsonBody(req);

    const day = normalizeText(body?.day, 32) || todayISO();
    const bookId = normalizeText(body?.bookId, 80);
    const pagesRead = normalizeText(body?.pagesRead, 120);
    const rememberedNotes = normalizeText(body?.rememberedNotes, 4000);
    const journal = normalizeText(body?.journal, 8000);

    if (!bookId) {
      sendJson(res, 400, { error: 'bookId is required' });
      return;
    }
    if (!pagesRead && !rememberedNotes && !journal) {
      sendJson(res, 400, { error: 'Provide at least one of pagesRead, rememberedNotes, or journal' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

    const user = await supabaseGetUser({ supabaseUrl, anonKey, accessToken: token });
    const actorEmail = normalizeEmail(user?.email);
    if (!ALLOWED_EMAILS.has(actorEmail)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    const actorId = normalizeUuid(user?.id);
    const requestedUserId = normalizeUuid(body?.queryUserId);
    const targetUserId = requestedUserId || actorId;
    await assertCanManageUserData({
      supabaseUrl,
      anonKey,
      accessToken: token,
      actorId,
      targetUserId,
    });

    const bookTitle = BOOK_TITLES[bookId] || bookId;
    const prompt = buildPrompt({ day, bookTitle, pagesRead, rememberedNotes, journal });

    let provider = 'fallback';
    let model = 'deterministic';
    let questions = fallbackQuestions({ bookTitle, pagesRead, rememberedNotes, journal });

    try {
      const ai = await callOpenAIQuestions({ prompt });
      provider = ai.provider;
      model = ai.model;
      questions = ai.questions;
    } catch (_) {
      // Fall back to deterministic questions so the feature still works without provider config.
    }

    sendJson(res, 200, {
      day,
      bookId,
      bookTitle,
      queryUserId: targetUserId,
      provider,
      model,
      questions,
    });
  } catch (e) {
    const status = Number.isFinite(Number(e?.statusCode)) ? Number(e.statusCode) : 500;
    sendJson(res, status, {
      error: e?.message || 'Unknown error',
      error_code: e?.errorCode || e?.code || null,
    });
  }
}

module.exports = handler;
module.exports._internal = {
  normalizeEmail,
  normalizeUuid,
  parseQuestionsPayload,
  fallbackQuestions,
  buildPrompt,
};
