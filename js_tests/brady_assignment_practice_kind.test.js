const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('assignment retake practice attempts store and query practice_kind', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_assignment_runner.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes(".from('brady_practice_attempts')"), 'Expected assignment runner to use brady_practice_attempts table');
  assert.ok(code.includes('practice_kind'), 'Expected practice_kind to be referenced');
  assert.ok(code.includes('assignment_retake'), 'Expected assignment_retake practice_kind to be used');
});
