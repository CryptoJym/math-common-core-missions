const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily training supports uploads saved in brady_artifacts', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes(".from('brady_artifacts')"), 'Expected daily training to store upload metadata in brady_artifacts');
  assert.ok(code.includes('FileReader'), 'Expected daily training to read uploads in the browser');
});
