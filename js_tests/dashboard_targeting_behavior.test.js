const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadDashboardScript() {
  const context = vm.createContext({
    BRADY_ASSIGNMENTS: [],
    window: {
      BRADY_ASSIGNMENTS: [],
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      body: {},
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: () => Promise.resolve({ ok: true }),
    console,
    Date,
    setInterval,
    clearInterval,
    URL,
  });

  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_dashboard.js');
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test('dashboard target selection prefers in-progress over unmastered', () => {
  const context = loadDashboardScript();
  context.BRADY_ASSIGNMENTS = [
    { id: 'm1', priority: 2 },
    { id: 'm2', priority: 1 },
    { id: 'm3', priority: 3 },
  ];
  context.window.BRADY_ASSIGNMENTS = context.BRADY_ASSIGNMENTS;

  const target = context.pickTargetAssignment({
    m1: { status: 'in_progress' },
    m2: { status: 'not_started' },
  });

  assert.equal(target.id, 'm1');
});
