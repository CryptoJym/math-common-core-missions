const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin portal markup is present in static_auth', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'brady', 'admin.html');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes('Brady Admin Portal'), 'Expected admin page title/header to exist');
  assert.ok(code.includes('id="addSubAccountForm"'), 'Expected add-subaccount form on admin page');
  assert.ok(code.includes('id="subAccountList"'), 'Expected sub-account list container on admin page');
  assert.ok(code.includes('id="downloadExportBtn"'), 'Expected export download button on admin page');
  assert.ok(code.includes('id="exportLearner"'), 'Expected export learner selector on admin page');
});

test('admin portal script manages learner links', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_admin.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(code.includes("from('brady_sub_accounts')"), 'Expected admin script to use brady_sub_accounts table');
  assert.ok(code.includes('setBradyLearner'), 'Expected admin script to switch active learner context');
  assert.ok(code.includes('delete()'), 'Expected admin script to support deleting learner links');
  assert.ok(code.includes('/api/brady/export'), 'Expected admin script to call export endpoint');
});
