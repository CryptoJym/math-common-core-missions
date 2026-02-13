const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('brady_access pre-seeds James as admin over Hyro', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'brady_access.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('BRADY_PRESEED_LINKS'),
    'Expected brady_access.js to define BRADY_PRESEED_LINKS for deterministic admin relationships'
  );
  assert.ok(
    code.includes('james@jamesbrady.org'),
    'Expected brady_access.js to include james@jamesbrady.org in preseed links'
  );
  assert.ok(
    code.includes('bradyhyro67@gmail.com'),
    'Expected brady_access.js to include Hyro learner email in preseed links'
  );
  assert.ok(
    code.includes("learnerName: 'Hyro'"),
    'Expected brady_access.js to include Hyro learnerName in preseed links'
  );
});

