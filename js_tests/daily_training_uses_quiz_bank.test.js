const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily training loads brady_quiz_bank before brady_daily.js', () => {
  const filePath = path.join(__dirname, '..', 'static_auth', 'brady', 'daily.html');
  const html = fs.readFileSync(filePath, 'utf8');

  const bankIdx = html.indexOf('..\/js\/brady_quiz_bank.js');
  const dailyIdx = html.indexOf('..\/js\/brady_daily.js');

  assert.ok(bankIdx !== -1, 'Expected daily.html to include ../js/brady_quiz_bank.js');
  assert.ok(dailyIdx !== -1, 'Expected daily.html to include ../js/brady_daily.js');
  assert.ok(bankIdx < dailyIdx, 'Expected brady_quiz_bank.js to load before brady_daily.js');
});
