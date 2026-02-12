const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadRunner() {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_assignment_runner.js');
  const code = fs.readFileSync(filePath, 'utf8');

  const state = { reloadCount: 0 };
  const context = vm.createContext({
    window: {
      location: {
        origin: 'https://example.com',
        reload: () => { state.reloadCount += 1; },
      },
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      body: { classList: { add: () => {} } },
    },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    // timers
    setInterval,
    clearInterval,
    Date,
    console,
    __test: state,
  });

  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test('computeLockedUntil returns null for passing attempts', () => {
  const ctx = loadRunner();
  const lockedUntil = ctx.computeLockedUntil(
    { attempted_at: new Date().toISOString(), score_percent: 90 },
    80
  );
  assert.equal(lockedUntil, null);
});

test('computeLockedUntil returns attempted_at + 3 days for failing attempts', () => {
  const ctx = loadRunner();
  const attemptedAt = new Date('2026-02-01T00:00:00.000Z');
  const lockedUntil = ctx.computeLockedUntil(
    { attempted_at: attemptedAt.toISOString(), score_percent: 70 },
    80
  );
  assert.ok(lockedUntil instanceof Date);
  const ms = lockedUntil.getTime() - attemptedAt.getTime();
  assert.equal(ms, 3 * 24 * 60 * 60 * 1000);
});

test('computeFocusTagsFromAttempt counts missed tags from attempt results', () => {
  const ctx = loadRunner();
  const attempt = {
    seed: 123,
    results: {
      q1: { correct: false, tags: ['simplify'] },
      q2: { correct: false, tags: ['simplify', 'equivalence'] },
      q3: { correct: true, tags: ['equivalence'] },
      q4: { correct: false, tags: ['equivalence'] },
    },
  };
  // Values coming from a vm context can have a different prototype/realm.
  const focus = JSON.parse(JSON.stringify(
    ctx.computeFocusTagsFromAttempt(attempt, { id: 'math_equivalent_fractions' })
  ));
  assert.deepEqual(focus, { simplify: 2, equivalence: 2 });
});

test('hasRenderableAttemptQuiz requires prompt/type and choices for mc', () => {
  const ctx = loadRunner();
  const okAttempt = {
    results: {
      q1: { prompt: 'P1', type: 'number' },
      q2: { prompt: 'P2', type: 'fraction' },
      q3: { prompt: 'P3', type: 'expanded_sum' },
      q4: { prompt: 'P4', type: 'set_numbers' },
      q5: { prompt: 'P5', type: 'mc', choices: ['A', 'B'] },
      q6: { prompt: 'P6', type: 'number' },
      q7: { prompt: 'P7', type: 'number' },
      q8: { prompt: 'P8', type: 'number' },
      q9: { prompt: 'P9', type: 'number' },
      q10: { prompt: 'P10', type: 'number' },
    },
  };
  assert.equal(ctx.hasRenderableAttemptQuiz(okAttempt), true);

  const badAttempt = {
    results: {
      q1: { prompt: 'P1', type: 'mc', choices: [] }, // invalid
      q2: { prompt: 'P2', type: 'number' },
      q3: { prompt: 'P3', type: 'number' },
      q4: { prompt: 'P4', type: 'number' },
      q5: { prompt: 'P5', type: 'number' },
      q6: { prompt: 'P6', type: 'number' },
      q7: { prompt: 'P7', type: 'number' },
      q8: { prompt: 'P8', type: 'number' },
      q9: { prompt: 'P9', type: 'number' },
      q10: { prompt: 'P10', type: 'number' },
    },
  };
  assert.equal(ctx.hasRenderableAttemptQuiz(badAttempt), false);
});

test('isValidQuizShape rejects malformed mc choices and missing fields', () => {
  const ctx = loadRunner();
  const quiz = {
    passPercent: 80,
    title: 'Bad',
    questions: Array.from({ length: 10 }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'mc',
      prompt: `Q${i + 1}`,
      choices: 'AB', // invalid: must be array
      answer: 'A',
      explanation: 'ok',
      tags: ['tag_one'],
    })),
  };
  assert.equal(ctx.isValidQuizShape(JSON.parse(JSON.stringify(quiz))), false);
});

test('startLockoutCountdown reloads the page after lockout expires', () => {
  const ctx = loadRunner();
  ctx.startLockoutCountdown(80, { score_percent: 70 }, new Date(Date.now() - 1000));
  assert.equal(ctx.__test.reloadCount, 1);
});
