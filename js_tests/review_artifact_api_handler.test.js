const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/brady/review-artifact.js');

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

test('review handler: rejects missing bearer token', async () => {
  const req = makeReq({ method: 'POST', body: { artifactId: 'a1' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res._getJson(), { error: 'Missing bearer token' });
});

test('review handler: returns 428 when artifact not found', async () => {
  const oldFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: /\/rest\/v1\/brady_artifacts\?/,
      handle: async () => jsonResponse(200, []),
    },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: { artifactId: 'missing' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res._getJson(), { error: 'Artifact not found' });

  global.fetch = oldFetch;
});

test('review handler: reuses cached review when present (no OpenAI call)', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: /\/rest\/v1\/brady_artifacts\?/,
      handle: async () => jsonResponse(200, [{
        id: 'a1',
        user_id: 'u1',
        day: '2026-02-12',
        practice_kind: 'daily_ai',
        assignment_id: 'daily_ai',
        filename: 'notes.txt',
        mime_type: 'text/plain',
        size_bytes: 20,
        content_base64: Buffer.from('hello', 'utf8').toString('base64'),
      }]),
    },
    {
      match: /\/rest\/v1\/brady_ai_reviews\?/,
      handle: async () => jsonResponse(200, [{
        id: 'r1',
        artifact_id: 'a1',
        score_percent: 90,
        feedback: 'Looks good',
        created_at: '2026-02-12T00:00:00Z',
      }]),
    },
  ]);

  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: { artifactId: 'a1' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.reused, true);
  assert.equal(out.review.score_percent, 90);
  assert.equal(fetchStub.calls.some((c) => c.url.includes('api.openai.com')), false);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});

test('review handler: generates review and uses gpt-5.2 by default', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: /\/rest\/v1\/brady_artifacts\?/,
      handle: async () => jsonResponse(200, [{
        id: 'a1',
        user_id: 'u1',
        day: '2026-02-12',
        practice_kind: 'daily_ai',
        assignment_id: 'daily_ai',
        filename: 'notes.txt',
        mime_type: 'text/plain',
        size_bytes: 20,
        content_base64: Buffer.from('hello', 'utf8').toString('base64'),
      }]),
    },
    {
      match: /\/rest\/v1\/brady_ai_reviews\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async (_href, opts) => {
        const payload = JSON.parse(opts.body);
        assert.equal(payload.model, 'gpt-5.2');
        return jsonResponse(200, {
          choices: [{ message: { content: JSON.stringify({ scorePercent: 85, feedback: 'OK', nextSteps: ['x'] }) } }],
        });
      },
    },
    {
      match: /\/rest\/v1\/brady_ai_reviews$/,
      handle: async () => jsonResponse(201, [{ id: 'r2' }]),
    },
  ]);

  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: { artifactId: 'a1' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.reused, false);
  assert.equal(out.review.score_percent, 85);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
  if (typeof oldModel === 'string') process.env.OPENAI_MODEL = oldModel;
  else delete process.env.OPENAI_MODEL;
});

test('review handler: Supabase insert error -> 500', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchStub = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: /\/rest\/v1\/brady_artifacts\?/,
      handle: async () => jsonResponse(200, [{
        id: 'a1',
        user_id: 'u1',
        day: '2026-02-12',
        practice_kind: 'daily_ai',
        assignment_id: 'daily_ai',
        filename: 'notes.txt',
        mime_type: 'text/plain',
        size_bytes: 20,
        content_base64: Buffer.from('hello', 'utf8').toString('base64'),
      }]),
    },
    {
      match: /\/rest\/v1\/brady_ai_reviews\?/,
      handle: async () => jsonResponse(200, []),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async () => jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ scorePercent: 85, feedback: 'OK', nextSteps: [] }) } }],
      }),
    },
    {
      match: /\/rest\/v1\/brady_ai_reviews$/,
      handle: async () => textResponse(500, 'db down'),
    },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: { artifactId: 'a1' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.ok(res._getJson().error.includes('Supabase REST INSERT failed'));

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});
