const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('assignment runner supports autosave drafts + stable seed URL', () => {
  const jsPath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_assignment_runner.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  assert.ok(js.includes("from('brady_assignment_drafts')"), 'Expected assignment runner to use brady_assignment_drafts');
  assert.ok(js.includes('mha_assignment_draft:'), 'Expected assignment runner to use a localStorage draft key prefix');
  assert.ok(js.includes('ensureSeedInUrl'), 'Expected assignment runner to keep seed stable in URL for reload safety');
  assert.ok(js.includes('id="draftMsg"'), 'Expected assignment runner to render draft status element');
});

