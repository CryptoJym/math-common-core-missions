/**
 * Vercel Serverless Function: /api/brady/review-artifact
 *
 * Purpose:
 * - Review a saved upload artifact (text/pdf/image) with AI.
 * - Cache the review in Supabase so repeat clicks do not re-spend model calls.
 *
 * Security model:
 * - Requires Supabase access token in Authorization bearer header.
 * - Validates user identity with Supabase Auth endpoint.
 * - Enforces allowlist by email and writes via user token (RLS enforced).
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

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizeStringArray(arr, maxLen) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((x) => x.slice(0, maxLen));
}

function parseAiReviewPayload(payload) {
  const out = payload && typeof payload === 'object' ? payload : {};
  const scorePercent = clampInt(out.scorePercent, 0, 100);
  const feedback = String(out.feedback || '').trim().slice(0, 10000);
  const nextSteps = sanitizeStringArray(out.nextSteps, 200);
  if (!feedback) throw new Error('AI review payload missing feedback');
  return { scorePercent, feedback, nextSteps };
}

function inferArtifactKind(mimeType, filename) {
  const mt = String(mimeType || '').trim().toLowerCase();
  const name = String(filename || '').trim().toLowerCase();
  if (
    mt.startsWith('text/')
    || mt.includes('json')
    || mt.includes('javascript')
    || mt.includes('xml')
    || name.endsWith('.txt')
    || name.endsWith('.md')
    || name.endsWith('.js')
    || name.endsWith('.ts')
    || name.endsWith('.py')
    || name.endsWith('.java')
    || name.endsWith('.c')
    || name.endsWith('.cpp')
    || name.endsWith('.html')
    || name.endsWith('.css')
    || name.endsWith('.csv')
  ) return 'text';
  if (mt === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mt.startsWith('image/')) return 'image';
  return 'binary';
}

function decodeBase64ToBuffer(base64) {
  try {
    return Buffer.from(String(base64 || ''), 'base64');
  } catch (_) {
    return Buffer.alloc(0);
  }
}

function extractSimplePdfText(buffer) {
  // Lightweight fallback extraction from PDF content streams.
  const latin = buffer.toString('latin1');
  const out = [];
  const re = /\(([^()]*)\)/g;
  let m = null;
  while ((m = re.exec(latin)) !== null) {
    let chunk = String(m[1] || '');
    chunk = chunk
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');
    chunk = chunk.replace(/\s+/g, ' ').trim();
    if (/[A-Za-z]{3,}/.test(chunk)) out.push(chunk);
    if (out.length >= 3000) break;
  }
  return out.join('\n').slice(0, 30000);
}

function buildReviewPrompt({ filename, mimeType, text, artifactKind }) {
  return [
    'You are a strict but supportive tutor reviewing student work.',
    'Return ONLY valid JSON. No markdown.',
    'JSON schema:',
    '{ "scorePercent": 0-100, "feedback": "short paragraph", "nextSteps": ["step 1", "step 2", "step 3"] }',
    '',
    `File: ${filename || 'upload'}`,
    `MimeType: ${mimeType || 'unknown'}`,
    `ArtifactKind: ${artifactKind}`,
    '',
    'Scoring guidance:',
    '- 90-100: strong accuracy and clear reasoning',
    '- 80-89: mostly correct, small fixes needed',
    '- 60-79: partial understanding, important gaps',
    '- 0-59: major misunderstanding or incomplete',
    '',
    'Feedback guidance:',
    '- Say what is correct first, then what is missing.',
    '- Keep language student-friendly.',
    '- Give exactly 3 next steps that are testable and specific.',
    '',
    'Student work:',
    '---',
    String(text || '').slice(0, 30000),
    '---',
  ].join('\n');
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('\n')
    .trim();
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

async function callOpenAIReview({ model, prompt }) {
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
  const review = parseAiReviewPayload(parsed);
  return {
    provider: 'openai',
    model,
    ...review,
  };
}

async function callGeminiReview({ prompt, inlineMimeType, inlineBase64 }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const userParts = [{ text: prompt }];
  if (inlineBase64) {
    userParts.push({
      inline_data: {
        mime_type: inlineMimeType || 'application/octet-stream',
        data: inlineBase64,
      },
    });
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: userParts,
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
  const content = extractGeminiText(data);
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error('Gemini did not return valid JSON.');
  const review = parseAiReviewPayload(parsed);
  return {
    provider: 'gemini',
    model,
    ...review,
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
    const artifactId = String(body?.artifactId || '').trim();
    if (!artifactId) {
      sendJson(res, 400, { error: 'artifactId is required' });
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

    const artifactRows = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_artifacts',
      params: {
        select: 'id,user_id,day,practice_kind,assignment_id,filename,mime_type,size_bytes,content_base64',
        user_id: `eq.${user.id}`,
        id: `eq.${artifactId}`,
        order: 'created_at.desc',
        limit: 1,
      },
    });
    const artifact = Array.isArray(artifactRows) ? artifactRows[0] : null;
    if (!artifact) {
      sendJson(res, 404, { error: 'Artifact not found' });
      return;
    }

    const existingRows = await supabaseRestGet({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_ai_reviews',
      params: {
        select: 'id,artifact_id,score_percent,feedback,next_steps,provider,model,created_at',
        user_id: `eq.${user.id}`,
        artifact_id: `eq.${artifactId}`,
        order: 'created_at.desc',
        limit: 1,
      },
    });
    const cached = Array.isArray(existingRows) ? existingRows[0] : null;
    if (cached) {
      sendJson(res, 200, { reused: true, review: cached });
      return;
    }

    const artifactKind = inferArtifactKind(artifact.mime_type, artifact.filename);
    const buf = decodeBase64ToBuffer(artifact.content_base64);
    let textForModel = '';
    if (artifactKind === 'text') {
      textForModel = buf.toString('utf8').slice(0, 30000);
    } else if (artifactKind === 'pdf') {
      textForModel = extractSimplePdfText(buf);
    }

    const prompt = buildReviewPrompt({
      filename: artifact.filename,
      mimeType: artifact.mime_type,
      text: textForModel || '[Non-text artifact attached]',
      artifactKind,
    });

    let ai = null;
    if (textForModel) {
      try {
        ai = await callOpenAIReview({
          model: process.env.OPENAI_MODEL || 'gpt-5.2',
          prompt,
        });
      } catch (openAiErr) {
        if (process.env.GEMINI_API_KEY) {
          ai = await callGeminiReview({ prompt });
        } else {
          throw openAiErr;
        }
      }
    } else if (process.env.GEMINI_API_KEY && (artifactKind === 'pdf' || artifactKind === 'image')) {
      ai = await callGeminiReview({
        prompt,
        inlineMimeType: artifact.mime_type || 'application/octet-stream',
        inlineBase64: artifact.content_base64,
      });
    } else {
      sendJson(res, 422, {
        error: 'Unsupported artifact for AI review. Upload text/code, or configure GEMINI_API_KEY for image/PDF review.',
      });
      return;
    }

    const saved = await supabaseRestInsert({
      supabaseUrl,
      anonKey,
      accessToken,
      table: 'brady_ai_reviews',
      row: {
        user_id: user.id,
        artifact_id: artifact.id,
        provider: ai.provider,
        model: ai.model,
        score_percent: ai.scorePercent,
        feedback: ai.feedback,
        next_steps: ai.nextSteps,
      },
    });

    const review = {
      artifact_id: artifact.id,
      provider: ai.provider,
      model: ai.model,
      score_percent: ai.scorePercent,
      feedback: ai.feedback,
      next_steps: ai.nextSteps,
      ...(saved || {}),
    };

    sendJson(res, 200, {
      reused: false,
      review,
    });
  } catch (e) {
    sendJson(res, 500, { error: e?.message || 'Unknown error' });
  }
}

module.exports = handler;
module.exports._internal = {
  normalizeEmail,
  safeJsonParse,
  parseAiReviewPayload,
  inferArtifactKind,
  extractSimplePdfText,
  buildReviewPrompt,
};
