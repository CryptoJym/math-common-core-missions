const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily training supports autosave drafts (brady_practice_drafts)', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_daily.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes(".from('brady_practice_drafts')"), 'Expected daily training to use brady_practice_drafts table');
  assert.ok(code.includes('.upsert('), 'Expected daily training to upsert drafts');
  assert.ok(code.includes(".delete()"), 'Expected daily training to clear drafts after submit');
});
