const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('coach page markup is present in static_auth', () => {
  const file = path.join(__dirname, '..', 'static_auth', 'brady', 'coach.html');
  const html = fs.readFileSync(file, 'utf8');

  assert.ok(html.includes('AI Coach'));
  assert.ok(html.includes('id="planContainer"'));
  assert.ok(html.includes('id="profileContainer"'));
  assert.ok(html.includes('id="saveManualBtn"'));
  assert.ok(html.includes('../js/brady_coach.js'));
});

