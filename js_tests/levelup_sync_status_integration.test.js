const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('sync status module exists and wires online/offline + fetch activity', () => {
  const code = read('static_auth/js/sync_status.js');

  assert.ok(code.includes('navigator.onLine'), 'Expected online/offline state detection');
  assert.ok(code.includes('window.fetch'), 'Expected fetch wrapping for syncing state');
  assert.ok(code.includes('sync-chip'), 'Expected sync chip rendering hooks');
});

test('all Brady pages load sync status module', () => {
  const pages = [
    'static_auth/brady/index.html',
    'static_auth/brady/assignments.html',
    'static_auth/brady/assignment.html',
    'static_auth/brady/daily.html',
    'static_auth/brady/reading.html',
    'static_auth/brady/avatar.html',
    'static_auth/brady/coach.html',
    'static_auth/brady/admin.html',
  ];

  for (const page of pages) {
    const html = read(page);
    assert.ok(
      html.includes('../js/sync_status.js'),
      `Expected ${page} to load ../js/sync_status.js`,
    );
  }
});
