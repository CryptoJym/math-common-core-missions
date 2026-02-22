const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/brady/reading-questions.js');

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

test('reading questions handler: OPTIONS preflight returns 204 and CORS headers', async () => {
  const req = makeReq({ method: 'OPTIONS' });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(res.ended, true);
});

test('reading questions handler: missing bearer token returns 401', async () => {
  const req = makeReq({
    method: 'POST',
    body: {
      bookId: 'richest_man_babylon',
      rememberedNotes: 'I remember the idea of paying yourself first.',
    },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res._getJson(), { error: 'Missing bearer token' });
});

test('reading questions handler: missing comprehension input returns 400', async () => {
  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: {
      bookId: 'richest_man_babylon',
      pagesRead: '',
      rememberedNotes: '',
      journal: '',
    },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res._getJson(), {
    error: 'Provide at least one of pagesRead, rememberedNotes, or journal',
  });
});

test('reading questions handler: fallback questions when no AI provider configured', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  global.fetch = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: {
      day: '2026-02-22',
      bookId: 'richest_man_babylon',
      pagesRead: '34-47',
      rememberedNotes: 'Pay yourself first and guard savings.',
    },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.provider, 'fallback');
  assert.ok(Array.isArray(out.questions), 'Expected questions array');
  assert.ok(out.questions.length >= 5, 'Expected at least 5 fallback questions');
  assert.ok(String(out.questions[0]?.question || '').length > 0);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
});

test('reading questions handler: uses gpt-5.2 by default when OpenAI is configured', async () => {
  const oldFetch = global.fetch;
  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;

  global.fetch = createFetchStub([
    {
      match: /\/auth\/v1\/user$/,
      handle: async () => jsonResponse(200, { id: 'u1', email: 'james@jamesbrady.org' }),
    },
    {
      match: (href) => href === 'https://api.openai.com/v1/chat/completions',
      handle: async (_href, opts) => {
        const payload = JSON.parse(opts.body);
        assert.equal(payload.model, 'gpt-5.2');
        return jsonResponse(200, {
          choices: [{
            message: {
              content: JSON.stringify({
                questions: [
                  { question: 'What happened in this section?', focus: 'literal', why: 'Checks basic recall.' },
                  { question: 'What message did you notice?', focus: 'message', why: 'Checks theme understanding.' },
                  { question: 'What evidence supports that message?', focus: 'evidence', why: 'Checks text evidence.' },
                  { question: 'What surprised you and why?', focus: 'reflection', why: 'Checks personal processing.' },
                  { question: 'How can you apply one idea today?', focus: 'application', why: 'Checks transfer.' },
                  { question: 'What should you review tomorrow?', focus: 'review', why: 'Checks retention planning.' },
                ],
              }),
            },
          }],
        });
      },
    },
  ]);

  const req = makeReq({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: {
      day: '2026-02-22',
      bookId: 'richest_man_babylon',
      pagesRead: '10-22',
      rememberedNotes: 'Save first, spend second.',
    },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const out = res._getJson();
  assert.equal(out.provider, 'openai');
  assert.ok(Array.isArray(out.questions));
  assert.equal(out.questions.length, 6);

  global.fetch = oldFetch;
  process.env.OPENAI_API_KEY = oldApiKey;
  if (typeof oldModel === 'string') process.env.OPENAI_MODEL = oldModel;
  else delete process.env.OPENAI_MODEL;
});
