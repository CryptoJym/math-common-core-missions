const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/brady/coach.js');

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    },
  };
}

function textResponse(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new Error('not json');
    },
    async text() {
      return String(text);
    },
  };
}

function createFetchStub(routeHandlers) {
  const calls = [];
  const stub = async (url, options) => {
    const href = String(url);
    const opts = options || {};
    calls.push({ url: href, options: opts });

    for (const { match, handle } of routeHandlers) {
      const ok = typeof match === 'function' ? match(href, opts) : match.test(href);
      if (ok) return await handle(href, opts, calls);
    }

    throw new Error(`Unexpected fetch call: ${href}`);
  };

  stub.calls = calls;
  return stub;
}

function makeReq({ method = 'POST', headers = {}, body = undefined } = {}) {
  return {
    method,
    headers,
    body,
  };
}

function makeRes() {
  const headers = {};
  let body = '';
  const res = {
    statusCode: 200,
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[String(k).toLowerCase()];
    },
    end(chunk) {
      if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      res.ended = true;
    },
    ended: false,
    _getBody() {
      return body;
    },
    _getJson() {
      return body ? JSON.parse(body) : null;
    },
  };
  return res;
}

test('coach handler: OPTIONS preflight returns 204 and CORS headers', async () => {
  const req = makeReq({ method: 'OPTIONS' });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(res.ended, true);
});

test('coach handler: rejects non-POST', async () => {
  const req = makeReq({ method: 'GET' });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res._getJson(), { error: 'Method not allowed' });
});

test('coach handler: missing bearer token returns 401', async () => {
  const req = makeReq({ method: 'POST', body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res._getJson(), { error: 'Missing bearer token' });
});

test('coach handler: disallowed email returns 403', async () => {
  const oldFetch = global.fetch;

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'not-allowed@example.com' }),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({ method: 'POST', headers: { Authorization: 'Bearer token' }, body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res._getJson(), { error: 'Not allowed' });

  global.fetch = oldFetch;
});

test('coach handler: reuses cached daily plan for today (no OpenAI call)', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const day = new Date().toISOString().slice(0, 10);

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: (href, opts) =>
        /\/rest\/v1\/brady_ai_learner_profile\?/.test(href) && String(opts?.method || 'GET').toUpperCase() === 'GET',
      handle: async () =>
        jsonResponse(200, [
          {
            user_id: 'u1',
            schema_version: 1,
            manual: { goal: 'test' },
            memory: {
              daily_plan_cache: {
                day,
                headline: 'Cached plan',
                steps: [{ title: 'Do the thing', minutes: 10, instructions: 'Go.' }],
                check_for_understanding: [],
                parent_view: {},
              },
              daily_plan_provider: 'openai',
              daily_plan_model: 'gpt-5.2',
            },
            updated_at: new Date().toISOString(),
          },
        ]),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({ method: 'POST', headers: { Authorization: 'Bearer token' }, body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.reused, true);
  assert.equal(out.daily_plan.day, day);
  assert.equal(fetchStub.calls.some((c) => c.url.includes('api.openai.com')), false);
  assert.equal(fetchStub.calls.some((c) => c.url.includes('brady_assignment_attempts')), false);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});

test('coach handler: generates plan via OpenAI and persists memory', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;

  const day = new Date().toISOString().slice(0, 10);
  const modelReply = {
    schema_version: 1,
    memory_update: {
      strengths: ['shows up'],
      weaknesses: [{ area: 'fractions', evidence: 'missed tags: simplify' }],
      coach_rules: ['short sessions'],
      next_focus: { type: 'assignment', id: 'math_equivalent_fractions', why: 'lowest score' },
    },
    daily_plan: {
      day,
      headline: 'Today we tighten fractions.',
      steps: [
        { title: 'Warm-up', minutes: 8, instructions: 'Do 8 quick problems.' },
        { title: 'Target', minutes: 12, instructions: 'Practice simplify + equivalent fractions.' },
      ],
      check_for_understanding: [{ question: 'What does simplify mean?', expected: 'Reduce fraction' }],
      parent_view: { what_to_watch: 'rushing', how_to_help: 'slow down' },
    },
  };

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: (href, opts) =>
        /\/rest\/v1\/brady_ai_learner_profile\?/.test(href) && String(opts?.method || 'GET').toUpperCase() === 'GET',
      handle: async () =>
        jsonResponse(200, [
          { user_id: 'u1', schema_version: 1, manual: {}, memory: {}, updated_at: new Date().toISOString() },
        ]),
    },
    {
      match: /\/rest\/v1\/brady_assignment_progress\?/,
      handle: async () =>
        jsonResponse(200, [
          { assignment_id: 'math_equivalent_fractions', status: 'in_progress', score: 60 },
        ]),
    },
    {
      match: /\/rest\/v1\/brady_assignment_attempts\?/,
      handle: async () =>
        jsonResponse(200, [
          {
            assignment_id: 'math_equivalent_fractions',
            attempted_at: new Date().toISOString(),
            score_percent: 60,
            results: {
              q1: { correct: false, tags: ['simplify'] },
            },
          },
        ]),
    },
    {
      match: /\/rest\/v1\/brady_daily_training_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_reading_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async () =>
        jsonResponse(200, {
          choices: [{ message: { content: JSON.stringify(modelReply) } }],
        }),
    },
    {
      match: /\/rest\/v1\/brady_ai_learner_profile\?user_id=eq\./,
      handle: async (href, opts) => {
        assert.equal(opts.method, 'PATCH');
        return jsonResponse(200, [
          {
            user_id: 'u1',
            schema_version: 1,
            manual: {},
            memory: { ...modelReply.memory_update, daily_plan_cache: modelReply.daily_plan },
            updated_at: new Date().toISOString(),
          },
        ]);
      },
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({ method: 'POST', headers: { Authorization: 'Bearer token' }, body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.reused, false);
  assert.equal(out.provider, 'openai');
  assert.equal(out.daily_plan.day, day);
  assert.ok(out.profile.memory.daily_plan_cache);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
  if (typeof oldModel === 'string') process.env.OPENAI_MODEL = oldModel;
  else delete process.env.OPENAI_MODEL;
});

test('coach handler: supports delegated queryUserId only when mapping exists', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const day = new Date().toISOString().slice(0, 10);
  const payload = {
    schema_version: 1,
    memory_update: { strengths: [], weaknesses: [], coach_rules: [], next_focus: { type: 'daily', id: 'daily', why: 'ok' } },
    daily_plan: { day, headline: 'x', steps: [{ title: 'a', minutes: 10, instructions: 'b' }], check_for_understanding: [], parent_view: {} },
  };

  const learnerId = '00000000-0000-0000-0000-000000000001';

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'admin', email: 'james@jamesbrady.org' }),
    },
    // Mapping exists -> allow.
    {
      match: /\/rest\/v1\/brady_sub_accounts\?/,
      handle: async () => jsonResponse(200, [{ id: 'link1' }]),
    },
    {
      match: (href, opts) =>
        /\/rest\/v1\/brady_ai_learner_profile\?/.test(href) && String(opts?.method || 'GET').toUpperCase() === 'GET',
      handle: async () => jsonResponse(200, [{ user_id: learnerId, schema_version: 1, manual: {}, memory: {} }]),
    },
    {
      match: /\/rest\/v1\/brady_assignment_progress\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_assignment_attempts\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_daily_training_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_reading_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async () => jsonResponse(200, { choices: [{ message: { content: JSON.stringify(payload) } }] }),
    },
    {
      match: /\/rest\/v1\/brady_ai_learner_profile\?user_id=eq\./,
      handle: async () =>
        jsonResponse(200, [
          { user_id: learnerId, schema_version: 1, manual: {}, memory: { daily_plan_cache: payload.daily_plan } },
        ]),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { queryUserId: learnerId },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res._getJson().target_user_id, learnerId);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});

test('coach handler: returns 403 when delegated mapping is missing', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'admin', email: 'james@jamesbrady.org' }),
    },
    {
      match: /\/rest\/v1\/brady_sub_accounts\?/,
      handle: async () => jsonResponse(200, []),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { queryUserId: '00000000-0000-0000-0000-000000000002' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res._getJson(), { error: 'Not allowed for this learner' });

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});

test('coach handler: falls back to gemini when OpenAI fails and GEMINI_API_KEY is set', async () => {
  const oldFetch = global.fetch;
  const oldOpenAi = process.env.OPENAI_API_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.GEMINI_API_KEY = 'gkey';

  const day = new Date().toISOString().slice(0, 10);
  const payload = {
    schema_version: 1,
    memory_update: { strengths: [], weaknesses: [], coach_rules: [], next_focus: { type: 'daily', id: 'daily', why: 'ok' } },
    daily_plan: { day, headline: 'x', steps: [{ title: 'a', minutes: 10, instructions: 'b' }], check_for_understanding: [], parent_view: {} },
  };

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: (href, opts) =>
        /\/rest\/v1\/brady_ai_learner_profile\?/.test(href) && String(opts?.method || 'GET').toUpperCase() === 'GET',
      handle: async () => jsonResponse(200, [{ user_id: 'u1', schema_version: 1, manual: {}, memory: {} }]),
    },
    {
      match: /\/rest\/v1\/brady_assignment_progress\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_assignment_attempts\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_daily_training_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: /\/rest\/v1\/brady_reading_log\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async () => textResponse(500, 'OpenAI down'),
    },
    {
      match: /generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent\?/,
      handle: async () =>
        jsonResponse(200, {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(payload) }],
              },
            },
          ],
        }),
    },
    {
      match: /\/rest\/v1\/brady_ai_learner_profile\?user_id=eq\./,
      handle: async () =>
        jsonResponse(200, [
          { user_id: 'u1', schema_version: 1, manual: {}, memory: { daily_plan_cache: payload.daily_plan } },
        ]),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({ method: 'POST', headers: { Authorization: 'Bearer token' }, body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res._getJson().provider, 'gemini');

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldOpenAi;
  process.env.GEMINI_API_KEY = oldGemini;
});
