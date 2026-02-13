/**
 * Vercel Serverless Function: /api/brady/export
 *
 * Purpose (plain language):
 * - Download Hyro's work for a date range (assignments, daily training, reading,
 *   uploads, AI reviews) as a single JSON file.
 *
 * Why this exists:
 * - Parents/teachers want "proof of work" and a way to review progress during
 *   explicit time windows without clicking through pages.
 *
 * Auth model:
 * - Client sends Supabase access token in `Authorization: Bearer <token>`.
 * - We verify token with Supabase Auth.
 * - We enforce an allowlist of admin emails.
 * - We query Supabase using the SAME user token so RLS remains the source of truth.
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

function isIsoDay(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders || {}).forEach(([k, v]) => {
    if (!k) return;
    res.setHeader(k, v);
  });
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

async function supabaseRestGetList({ supabaseUrl, anonKey, accessToken, table, paramsList }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const pair of (paramsList || [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const k = pair[0];
    const v = pair[1];
    if (!k) continue;
    url.searchParams.append(String(k), String(v));
  }

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Supabase REST GET failed (${resp.status}): ${text}`);
    err.statusCode = resp.status;
    throw err;
  }
  return await resp.json();
}

async function assertCanAccessTargetUser({ supabaseUrl, anonKey, accessToken, actorId, targetUserId }) {
  if (actorId === targetUserId) return;

  const rows = await supabaseRestGetList({
    supabaseUrl,
    anonKey,
    accessToken,
    table: 'brady_sub_accounts',
    paramsList: [
      ['select', 'id,admin_user_id,learner_id,is_active'],
      ['admin_user_id', `eq.${actorId}`],
      ['learner_id', `eq.${targetUserId}`],
      ['is_active', 'eq.true'],
      ['limit', '1'],
    ],
  });

  if (!rows || rows.length === 0) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }
}

function filenameSafe(s) {
  return String(s || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'export';
}

function dayRangeToTimestamps(startDay, endDay) {
  const start = new Date(`${startDay}T00:00:00.000Z`);
  const end = new Date(`${endDay}T23:59:59.999Z`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Missing bearer token' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const startDay = String(body?.startDay || body?.start || '').trim();
    const endDay = String(body?.endDay || body?.end || '').trim();
    const queryUserId = normalizeUuid(body?.queryUserId || '');
    const includeArtifacts = Boolean(body?.includeArtifacts);
    const includeArtifactContent = Boolean(body?.includeArtifactContent);

    if (!isIsoDay(startDay) || !isIsoDay(endDay)) {
      sendJson(res, 400, { error: 'startDay and endDay are required (YYYY-MM-DD)' });
      return;
    }
    if (startDay > endDay) {
      sendJson(res, 400, { error: 'startDay must be <= endDay' });
      return;
    }

    // Guard: prevent huge accidental exports.
    const startMs = new Date(`${startDay}T00:00:00.000Z`).getTime();
    const endMs = new Date(`${endDay}T00:00:00.000Z`).getTime();
    const days = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 120) {
      sendJson(res, 400, { error: 'Date range must be between 1 and 120 days.' });
      return;
    }

    const actor = await supabaseGetUser({ supabaseUrl, anonKey, accessToken: token });
    const actorEmail = normalizeEmail(actor?.email);
    const actorId = normalizeUuid(actor?.id);
    if (!actorId || !ALLOWED_EMAILS.has(actorEmail)) {
      sendJson(res, 403, { error: 'Not allowed' });
      return;
    }

    const targetUserId = queryUserId || actorId;
    if (!normalizeUuid(targetUserId)) {
      sendJson(res, 400, { error: 'queryUserId must be a valid UUID' });
      return;
    }

    await assertCanAccessTargetUser({ supabaseUrl, anonKey, accessToken: token, actorId, targetUserId });

    const { startIso, endIso } = dayRangeToTimestamps(startDay, endDay);

    const selectArtifacts = includeArtifactContent
      ? 'id,day,practice_kind,assignment_id,filename,mime_type,size_bytes,content_base64,created_at'
      : 'id,day,practice_kind,assignment_id,filename,mime_type,size_bytes,created_at';

    const [
      assignmentProgress,
      assignmentAttempts,
      practiceAttempts,
      dailyTraining,
      practiceDrafts,
      assignmentDrafts,
      readingLogs,
      readingDrafts,
      artifacts,
      aiReviews,
      learnerProfile,
    ] = await Promise.all([
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_assignment_progress',
        paramsList: [['select', '*'], ['user_id', `eq.${targetUserId}`]],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_assignment_attempts',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['attempted_at', `gte.${startIso}`],
          ['attempted_at', `lte.${endIso}`],
          ['order', 'attempted_at.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_practice_attempts',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['practiced_at', `gte.${startIso}`],
          ['practiced_at', `lte.${endIso}`],
          ['order', 'practiced_at.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_daily_training_log',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['day', `gte.${startDay}`],
          ['day', `lte.${endDay}`],
          ['order', 'day.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_practice_drafts',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['day', `gte.${startDay}`],
          ['day', `lte.${endDay}`],
          ['order', 'updated_at.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_assignment_drafts',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['updated_at', `gte.${startIso}`],
          ['updated_at', `lte.${endIso}`],
          ['order', 'updated_at.desc'],
          ['limit', '200'],
        ],
      }).catch(() => []), // draft table may not exist yet in older deployments
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_reading_log',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['day', `gte.${startDay}`],
          ['day', `lte.${endDay}`],
          ['order', 'day.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_reading_drafts',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['day', `gte.${startDay}`],
          ['day', `lte.${endDay}`],
          ['order', 'updated_at.desc'],
          ['limit', '500'],
        ],
      }).catch(() => []),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_artifacts',
        paramsList: [
          ['select', selectArtifacts],
          ['user_id', `eq.${targetUserId}`],
          ['day', `gte.${startDay}`],
          ['day', `lte.${endDay}`],
          ['order', 'created_at.desc'],
          ['limit', '200'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_ai_reviews',
        paramsList: [
          ['select', '*'],
          ['user_id', `eq.${targetUserId}`],
          ['created_at', `gte.${startIso}`],
          ['created_at', `lte.${endIso}`],
          ['order', 'created_at.desc'],
          ['limit', '500'],
        ],
      }),
      supabaseRestGetList({
        supabaseUrl, anonKey, accessToken: token, table: 'brady_ai_learner_profile',
        paramsList: [['select', '*'], ['user_id', `eq.${targetUserId}`], ['limit', '1']],
      }),
    ]);

    const exportObj = {
      export_version: 1,
      generated_at: new Date().toISOString(),
      actor: { id: actorId, email: actorEmail },
      learner: { id: targetUserId },
      range: { startDay, endDay, days },
      options: { includeArtifacts: includeArtifacts || includeArtifactContent, includeArtifactContent },
      counts: {
        assignment_progress: Array.isArray(assignmentProgress) ? assignmentProgress.length : 0,
        assignment_attempts: Array.isArray(assignmentAttempts) ? assignmentAttempts.length : 0,
        practice_attempts: Array.isArray(practiceAttempts) ? practiceAttempts.length : 0,
        daily_training: Array.isArray(dailyTraining) ? dailyTraining.length : 0,
        practice_drafts: Array.isArray(practiceDrafts) ? practiceDrafts.length : 0,
        assignment_drafts: Array.isArray(assignmentDrafts) ? assignmentDrafts.length : 0,
        reading_logs: Array.isArray(readingLogs) ? readingLogs.length : 0,
        reading_drafts: Array.isArray(readingDrafts) ? readingDrafts.length : 0,
        artifacts: Array.isArray(artifacts) ? artifacts.length : 0,
        ai_reviews: Array.isArray(aiReviews) ? aiReviews.length : 0,
        learner_profile: Array.isArray(learnerProfile) ? learnerProfile.length : 0,
      },
      data: {
        assignment_progress: assignmentProgress || [],
        assignment_attempts: assignmentAttempts || [],
        practice_attempts: practiceAttempts || [],
        daily_training_log: dailyTraining || [],
        practice_drafts: practiceDrafts || [],
        assignment_drafts: assignmentDrafts || [],
        reading_log: readingLogs || [],
        reading_drafts: readingDrafts || [],
        artifacts: (includeArtifacts || includeArtifactContent) ? (artifacts || []) : (artifacts || []),
        ai_reviews: aiReviews || [],
        learner_profile: (learnerProfile && learnerProfile[0]) ? learnerProfile[0] : null,
      },
    };

    const fname = filenameSafe(`mha_export_${targetUserId}_${startDay}_to_${endDay}.json`);
    sendJson(res, 200, exportObj, {
      'Content-Disposition': `attachment; filename="${fname}"`,
    });
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
  normalizeUuid,
  isIsoDay,
  dayRangeToTimestamps,
};

