const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/brady/export.js');

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
    async blob() {
      return Buffer.from(JSON.stringify(data), 'utf8');
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
    _getJson() {
      return body ? JSON.parse(body) : null;
    },
  };
  return res;
}

test('export handler: rejects non-POST', async () => {
  const req = makeReq({ method: 'GET' });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res._getJson(), { error: 'Method not allowed' });
});

test('export handler: missing bearer token returns 401', async () => {
  const req = makeReq({ method: 'POST', body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res._getJson(), { error: 'Missing bearer token' });
});

test('export handler: invalid date payload returns 400', async () => {
  const oldFetch = global.fetch;
  global.fetch = createFetchStub([
    { match: /\/auth\/v1\/user$/, handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }) },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { startDay: 'not-a-day', endDay: '2026-02-13' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(String(res._getJson()?.error || '').includes('startDay'));

  global.fetch = oldFetch;
});

test('export handler: too-large date range returns 400', async () => {
  const oldFetch = global.fetch;
  global.fetch = createFetchStub([
    { match: /\/auth\/v1\/user$/, handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }) },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { startDay: '2026-01-01', endDay: '2026-06-01' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(String(res._getJson()?.error || '').toLowerCase().includes('range'));

  global.fetch = oldFetch;
});

test('export handler: disallowed email returns 403', async () => {
  const oldFetch = global.fetch;
  global.fetch = createFetchStub([
    { match: /\/auth\/v1\/user$/, handle: async () => jsonResponse(200, { id: 'u1', email: 'nope@example.com' }) },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { startDay: '2026-02-10', endDay: '2026-02-13' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res._getJson(), { error: 'Not allowed' });

  global.fetch = oldFetch;
});

test('export handler: session_not_found becomes 401 with error_code', async () => {
  const oldFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () =>
        textResponse(403, JSON.stringify({
          code: 403,
          error_code: 'session_not_found',
          msg: 'Session from session_id claim in JWT does not exist',
        })),
    },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { startDay: '2026-02-12', endDay: '2026-02-13' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res._getJson()?.error_code, 'session_not_found');

  global.fetch = oldFetch;
});

test('export handler: success returns JSON with expected top-level keys', async () => {
  const oldFetch = global.fetch;

  const fetchStub = createFetchStub([
    { match: /\/auth\/v1\/user$/, handle: async () => jsonResponse(200, { id: '00000000-0000-0000-0000-000000000001', email: 'james@jamesbrady.org' }) },
    {
      match: /\/rest\/v1\/brady_assignment_progress\?/,
      handle: async () => jsonResponse(200, [{ assignment_id: 'a1', status: 'in_progress' }]),
    },
    { match: /\/rest\/v1\/brady_assignment_attempts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_practice_attempts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_daily_training_log\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_practice_drafts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_assignment_drafts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_reading_log\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_reading_drafts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_artifacts\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_ai_reviews\?/, handle: async () => jsonResponse(200, []) },
    { match: /\/rest\/v1\/brady_ai_learner_profile\?/, handle: async () => jsonResponse(200, []) },
  ]);
  global.fetch = fetchStub;

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { startDay: '2026-02-12', endDay: '2026-02-13' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.export_version, 1);
  assert.ok(out.generated_at);
  assert.deepEqual(out.range, { startDay: '2026-02-12', endDay: '2026-02-13', days: 2 });
  assert.ok(out.data);
  assert.ok(out.counts);
  assert.equal(res.getHeader('content-disposition')?.includes('attachment'), true);

  global.fetch = oldFetch;
});
