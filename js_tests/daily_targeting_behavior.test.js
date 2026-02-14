const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadScript(filePath, extraWindow = {}) {
  const context = vm.createContext({
    BRADY_ASSIGNMENTS: [],
    window: Object.assign({}, {
      location: {
        href: 'https://example.com/daily.html?seed_warmup=111&seed_target=222&seed_ai=333&other=1',
      },
      BRADY_ASSIGNMENTS: [],
      BRADY_QUIZ: {},
      MHA_Auth: null,
      MHA_Brady: null,
    }, extraWindow),
    document: {
      addEventListener: () => {},
      createElement: () => ({}),
      body: {},
      getElementById: () => null,
    },
    alert: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: () => Promise.resolve({ ok: true }),
    console,
    URL,
    location: { pathname: '/daily.html' },
    setInterval,
    clearInterval,
    Date,
  });

  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test('daily target selection prioritizes in-progress assignment', () => {
  const context = loadScript(path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js'));
  context.BRADY_ASSIGNMENTS = [
    { id: 'm1', priority: 2, title: 'Math 1' },
    { id: 'm2', priority: 1, title: 'Math 2' },
    { id: 'm3', priority: 3, title: 'Math 3' },
  ];
  context.window.BRADY_ASSIGNMENTS = context.BRADY_ASSIGNMENTS;
  const target = context.pickTargetAssignment({
    m1: 'in_progress',
    m2: 'mastered',
    m3: 'not_started',
  });

  assert.equal(target.id, 'm1');
});

test('daily target selection falls back to first unmastered when no in-progress exists', () => {
  const context = loadScript(path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js'));
  context.BRADY_ASSIGNMENTS = [
    { id: 'm1', priority: 5, title: 'Math 1' },
    { id: 'm2', priority: 1, title: 'Math 2' },
    { id: 'm3', priority: 3, title: 'Math 3' },
  ];
  context.window.BRADY_ASSIGNMENTS = context.BRADY_ASSIGNMENTS;
  const target = context.pickTargetAssignment({
    m2: 'mastered',
    m3: 'not_started',
    m1: 'mastered',
  });

  assert.equal(target.id, 'm3');
});

test('daily new-version seed update preserves existing query params', () => {
  const context = loadScript(path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js'));
  context.window.location.href = 'https://example.com/daily.html?seed_warmup=111&seed_target=222&other=abc';

  context.updateDailySeed('target', 555);
  const updated = new URL(context.window.location.href);
  const query = updated.searchParams;

  assert.equal(query.get('seed_target'), '555');
  assert.equal(query.get('seed_warmup'), '111');
  assert.equal(query.get('other'), 'abc');
});
