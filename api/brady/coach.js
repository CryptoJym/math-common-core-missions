/**
 * Vercel Serverless Function: /api/brady/coach
 *
 * Purpose (plain language):
 * - This is Hyro's "AI coach" backend.
 * - It reads Hyro's saved progress from Supabase (tests, daily training, reading),
 *   then asks an LLM (server-side) to produce:
 *     1) an updated structured learner profile ("memory"), and
 *     2) a simple daily coaching plan.
 * - It stores the profile memory back into Supabase, tied to Hyro's learner_id.
 *
 * Auth model:
 * - Client sends Supabase access token in `Authorization: Bearer <token>`.
 * - We verify token with Supabase Auth.
 * - We enforce an allowlist of admin emails.
 * - We use the SAME user token for Supabase REST writes so RLS remains source of truth.
 */

const DEFAULT_SUPABASE_URL = 'https://dwkjbuefiiawoktmprmp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2pidWVmaWlhd29rdG1wcm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDA0MTgsImV4cCI6MjA4NjQxNjQxOH0.EXY-qerJ9v9EeerJ4Q2ec0XC3_rbbRls2HH8bTRxRTw';

const ALLOWED_EMAILS = new Set([
  'bradyhyro67@gmail.com',
  'james@jamesbrady.org',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUuid(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return /^[0-9a-f-]{36}$/.test(v) ? v : '';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
    throw new Error(`Supabase auth failed (${resp.status}): ${text}`);
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

async function supabaseRestInsert({ supabaseUrl, anonKey, accessToken, table, row, onConflict = '' }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set('on_conflict', String(onConflict));
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: onConflict ? 'resolution=merge-duplicates, return=representation' : 'return=representation',
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

async function supabaseRestUpdate({ supabaseUrl, anonKey, accessToken, table, match, patch }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(match || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const resp = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase REST UPDATE failed (${resp.status}): ${text}`);
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

function normalizeTagKey(tag) {
  const k = String(tag || '').trim().toLowerCase();
  if (!k) return '';
  if (!/^[a-z0-9_]{1,32}$/.test(k)) return '';
  return k;
}

function computeTopMissedTagsFromAttempts(attemptRows, limit = 12) {
  const counts = {};
  for (const row of (attemptRows || [])) {
    const results = row?.results && typeof row.results === 'object' ? row.results : null;
    if (!results) continue;
    for (const r of Object.values(results)) {
      if (!r || typeof r !== 'object') continue;
      if (r.correct !== false) continue;
      const tags = Array.isArray(r.tags) ? r.tags : [];
      for (const t of tags) {
        const key = normalizeTagKey(t);
        if (!key) continue;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  return Object.entries(counts)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(([tag, missed]) => ({ tag, missed }));
}

function summarizeProgress(progressRows) {
  const rows = Array.isArray(progressRows) ? progressRows : [];
  const statusCounts = { mastered: 0, in_progress: 0, not_started: 0 };
  for (const r of rows) {
    const s = String(r?.status || '').trim().toLowerCase();
    if (s === 'mastered') statusCounts.mastered += 1;
    else if (s === 'in_progress') statusCounts.in_progress += 1;
  }
  // Total assignments in the system is known on the client; server only counts seen rows.
  const totalTracked = rows.length;
  const completionRate = totalTracked > 0 ? Math.round((statusCounts.mastered / totalTracked) * 100) : 0;

  const weakest = rows
    .filter((r) => String(r?.status || '').toLowerCase() !== 'mastered')
    .slice()
    .sort((a, b) => Number(a?.score || 0) - Number(b?.score || 0))[0] || null;

  return {
    statusCounts,
    totalTracked,
    completionRate,
    weakestAssignmentId: weakest?.assignment_id || '',
    weakestBestScore: Number.isFinite(Number(weakest?.score)) ? Number(weakest.score) : null,
  };
}

function summarizeDaily(dailyRows) {
  const rows = Array.isArray(dailyRows) ? dailyRows : [];
  const last14 = rows.slice(0, 14);
  const completed = last14.filter((r) => Boolean(r?.completed)).length;
  const completionRate = last14.length > 0 ? Math.round((completed / last14.length) * 100) : 0;
  return {
    daysTracked: rows.length,
    completedLast14: completed,
    completionRateLast14: completionRate,
    latestDay: rows[0]?.day || '',
  };
}

function summarizeReading(readingRows) {
  const rows = Array.isArray(readingRows) ? readingRows : [];
  const last30 = rows.slice(0, 30);
  const minutesLast30 = last30.reduce((acc, r) => acc + (Number(r?.minutes) || 0), 0);
  return {
    entriesTracked: rows.length,
    minutesLast30,
    latestDay: rows[0]?.day || '',
  };
}

function buildCoachPrompt({ day, manual, memory, computed }) {
  const safeManual = manual && typeof manual === 'object' ? manual : {};
  const safeMemory = memory && typeof memory === 'object' ? memory : {};
  const safeComputed = computed && typeof computed === 'object' ? computed : {};

  return [
    'You are an expert tutor + coach.',
    "You are coaching a learner named Hyro (or the active learner context). Your mission is to help them succeed.",
    '',
    'Hard rules:',
    '- Output ONLY valid JSON (no markdown, no commentary).',
    '- Do NOT invent facts. Only use the provided computed facts + manual profile.',
    '- Keep the plan short and actionable.',
    '',
    `Today: ${day}`,
    '',
    'Manual profile (parent/teacher provided):',
    JSON.stringify(safeManual),
    '',
    'Previous coach memory (if any):',
    JSON.stringify(safeMemory),
    '',
    'Computed facts from the platform (ground truth):',
    JSON.stringify(safeComputed),
    '',
    'Return JSON with this shape:',
    '{',
    '  "schema_version": 1,',
    '  "memory_update": {',
    '    "strengths": ["string", "..."],',
    '    "weaknesses": [{"area":"string","evidence":"string"}],',
    '    "coach_rules": ["string", "..."],',
    '    "next_focus": {"type":"assignment|daily|reading|ai", "id":"string", "why":"string"}',
    '  },',
    '  "daily_plan": {',
    '    "day": "YYYY-MM-DD",',
    '    "headline": "string",',
    '    "steps": [{"title":"string","minutes":10,"instructions":"string"}],',
    '    "check_for_understanding": [{"question":"string","expected":"string"}],',
    '    "parent_view": {"what_to_watch":"string","how_to_help":"string"}',
    '  }',
    '}',
  ].join('\n');
}

function validateCoachPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { ok: false, errors: ['payload is not an object'] };
  if (Number(payload.schema_version) !== 1) errors.push('schema_version must be 1');
  if (!payload.memory_update || typeof payload.memory_update !== 'object') errors.push('memory_update missing');
  if (!payload.daily_plan || typeof payload.daily_plan !== 'object') errors.push('daily_plan missing');

  const daily = payload.daily_plan || {};
  if (!daily.day || typeof daily.day !== 'string') errors.push('daily_plan.day missing');
  if (!daily.headline || typeof daily.headline !== 'string') errors.push('daily_plan.headline missing');
  if (!Array.isArray(daily.steps) || daily.steps.length < 1) errors.push('daily_plan.steps must be a non-empty array');

  if (Array.isArray(daily.steps)) {
    for (const step of daily.steps.slice(0, 20)) {
      if (!step || typeof step !== 'object') { errors.push('daily_plan.steps item not an object'); continue; }
      if (!step.title || typeof step.title !== 'string') errors.push('step.title missing');
      const m = Number(step.minutes);
      if (!Number.isFinite(m) || m <= 0 || m > 120) errors.push('step.minutes invalid');
      if (!step.instructions || typeof step.instructions !== 'string') errors.push('step.instructions missing');
    }
  }

  return { ok: errors.length === 0, errors };
}

async function callOpenAICoach({ model, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');

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
      response_format: { type: 'json_object' },
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
  const validated = validateCoachPayload(parsed);
  if (!validated.ok) {
    const err = new Error(`Model output invalid: ${validated.errors.join('; ')}`);
    err.statusCode = 422;
    throw err;
  }
  return {
    provider: 'openai',
    model,
    payload: parsed,
  };
}

async function callGeminiCoach({ prompt }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');

  const model = process.env.GEMINI_MODEL || 'gemini-3.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join('\n') || '';
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error('Gemini did not return valid JSON.');
  const validated = validateCoachPayload(parsed);
  if (!validated.ok) {
    const err = new Error(`Gemini output invalid: ${validated.errors.join('; ')}`);
    err.statusCode = 422;
    throw err;
  }

  return {
    provider: 'gemini',
    model,
    payload: parsed,
  };
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
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
    const requestedQueryUserId = normalizeUuid(body?.queryUserId);
    const force = body?.force === true;

    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    const user = await supabaseGetUser({ supabaseUrl, anonKey, accessToken });
    const email = normalizeEmail(user?.email);
    if (!ALLOWED_EMAILS.has(email)) {
      sendJson(res, 403, { error: 'Not allowed' });
      return;
    }

    let queryUserId = requestedQueryUserId || normalizeUuid(user?.id);
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

    const day = todayISO();

    // Ensure profile row exists (upsert, protected by RLS).
    let profileRows = [];
    try {
      profileRows = await supabaseRestGet({
        supabaseUrl,
        anonKey,
        accessToken,
        table: 'brady_ai_learner_profile',
        params: {
          select: 'user_id,schema_version,manual,memory,updated_at,created_at',
          user_id: `eq.${queryUserId}`,
          limit: '1',
        },
      });
    } catch (_) {
      profileRows = [];
    }

    let profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile) {
      profile = await supabaseRestInsert({
        supabaseUrl,
        anonKey,
        accessToken,
        table: 'brady_ai_learner_profile',
        onConflict: 'user_id',
        row: {
          user_id: queryUserId,
          schema_version: 1,
          manual: {},
          memory: {},
          updated_at: new Date().toISOString(),
        },
      });
    }

    const manual = profile?.manual && typeof profile.manual === 'object' ? profile.manual : {};
    const memory = profile?.memory && typeof profile.memory === 'object' ? profile.memory : {};

    const cachedPlan = memory?.daily_plan_cache && typeof memory.daily_plan_cache === 'object'
      ? memory.daily_plan_cache
      : null;
    if (!force && cachedPlan && String(cachedPlan.day || '') === day) {
      sendJson(res, 200, {
        reused: true,
        provider: memory?.daily_plan_provider || null,
        model: memory?.daily_plan_model || null,
        actor_user_id: normalizeUuid(user?.id),
        target_user_id: queryUserId,
        profile: {
          user_id: queryUserId,
          schema_version: Number(profile?.schema_version || 1),
          manual,
          memory,
          updated_at: profile?.updated_at || null,
        },
        computed: {
          day,
          note: 'Reused cached plan for today.',
        },
        daily_plan: cachedPlan,
      });
      return;
    }

    // Load ground-truth facts.
    const progress = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_assignment_progress',
      params: {
        select: 'assignment_id,status,score,last_attempt_at',
        user_id: `eq.${queryUserId}`,
      },
    });

    const attempts = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_assignment_attempts',
      params: {
        select: 'assignment_id,attempted_at,score_percent,results',
        user_id: `eq.${queryUserId}`,
        order: 'attempted_at.desc',
        limit: '25',
      },
    });

    const daily = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_daily_training_log',
      params: {
        select: 'day,completed,warmup_done,target_done,mixed_review_done,ai_task_done',
        user_id: `eq.${queryUserId}`,
        order: 'day.desc',
        limit: '60',
      },
    });

    const reading = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_reading_log',
      params: {
        select: 'day,minutes,book_id',
        user_id: `eq.${queryUserId}`,
        order: 'day.desc',
        limit: '60',
      },
    });

    const computed = {
      day,
      progress_summary: summarizeProgress(progress),
      daily_summary: summarizeDaily(daily),
      reading_summary: summarizeReading(reading),
      top_missed_tags: computeTopMissedTagsFromAttempts(attempts, 12),
      recent_attempts: (Array.isArray(attempts) ? attempts : []).slice(0, 8).map((r) => ({
        assignment_id: r?.assignment_id || '',
        attempted_at: r?.attempted_at || '',
        score_percent: Number.isFinite(Number(r?.score_percent)) ? Number(r.score_percent) : null,
      })),
    };

    const prompt = buildCoachPrompt({ day, manual, memory, computed });

    let ai = null;
    try {
      ai = await callOpenAICoach({
        model: process.env.OPENAI_MODEL || 'gpt-5.2',
        prompt,
      });
    } catch (openAiErr) {
      if (process.env.GEMINI_API_KEY) {
        ai = await callGeminiCoach({ prompt });
      } else {
        throw openAiErr;
      }
    }

    const memoryUpdate = ai?.payload?.memory_update && typeof ai.payload.memory_update === 'object'
      ? ai.payload.memory_update
      : {};
    const dailyPlan = ai?.payload?.daily_plan && typeof ai.payload.daily_plan === 'object'
      ? ai.payload.daily_plan
      : { day, headline: 'Daily plan', steps: [], check_for_understanding: [], parent_view: {} };

    const nextMemory = {
      ...(memory || {}),
      ...(memoryUpdate || {}),
      daily_plan_cache: dailyPlan,
      daily_plan_provider: ai?.provider || 'openai',
      daily_plan_model: ai?.model || null,
      last_coach_run_at: new Date().toISOString(),
    };

    const saved = await supabaseRestUpdate({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_ai_learner_profile',
      match: { user_id: `eq.${queryUserId}` },
      patch: {
        schema_version: 1,
        manual,
        memory: nextMemory,
        updated_at: new Date().toISOString(),
      },
    });

    sendJson(res, 200, {
      reused: false,
      provider: ai?.provider || 'openai',
      model: ai?.model || null,
      actor_user_id: normalizeUuid(user?.id),
      target_user_id: queryUserId,
      profile: {
        user_id: queryUserId,
        schema_version: Number(saved?.schema_version || 1),
        manual: saved?.manual && typeof saved.manual === 'object' ? saved.manual : manual,
        memory: saved?.memory && typeof saved.memory === 'object' ? saved.memory : nextMemory,
        updated_at: saved?.updated_at || null,
      },
      computed,
      daily_plan: dailyPlan,
    });
  } catch (e) {
    const status = Number.isFinite(Number(e?.statusCode)) ? Number(e.statusCode) : 500;
    sendJson(res, status, { error: e?.message || 'Unknown error' });
  }
}

module.exports = handler;
module.exports._internal = {
  normalizeEmail,
  normalizeUuid,
  safeJsonParse,
  todayISO,
  buildCoachPrompt,
  validateCoachPayload,
  computeTopMissedTagsFromAttempts,
  summarizeProgress,
  summarizeDaily,
  summarizeReading,
};

